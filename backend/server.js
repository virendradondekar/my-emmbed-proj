require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./data/db');
const { analyzeEmail } = require('./services/email-analyzer');

const accountsRouter = require('./routes/accounts');
const itemsRouter = require('./routes/items');
const settingsRouter = require('./routes/settings');
const integrationRouter = require('./routes/integration');
const activityRouter = require('./routes/activity');
const notificationsRouter = require('./routes/notifications');
const invoicesRouter = require('./routes/invoices');

const app = express();
const PORT = process.env.PORT || 3000;

function signedSession(email, expiresAt) {
  const payload = Buffer.from(JSON.stringify({ email, exp: expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function sessionEmail(req) {
  const cookie = req.headers.cookie || '';
  const raw = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('subtrack_session='))?.slice('subtrack_session='.length);
  if (!raw || !process.env.SESSION_SECRET) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch (_) { return null; }
  const [payload, signature] = decoded.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  if (!sameSecret(signature, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.exp > Date.now() ? session.email : null;
  } catch (_) { return null; }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const expectedEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const expectedPassword = String(process.env.ADMIN_PASSWORD || '');
  if (!expectedEmail || !expectedPassword || !process.env.SESSION_SECRET) return res.status(503).json({ error: 'Set ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET in .env first.' });
  if (!sameSecret(email, expectedEmail) || !sameSecret(password, expectedPassword)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  res.setHeader('Set-Cookie', `subtrack_session=${encodeURIComponent(signedSession(expectedEmail, expires))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ success: true });
});
app.get('/api/auth/session', (req, res) => res.json({ authenticated: !!sessionEmail(req), email: sessionEmail(req) }));
app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `subtrack_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ success: true });
});
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/session' || req.path === '/auth/logout' || req.path === '/webhook/viasocket') return next();
  if (!sessionEmail(req)) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
});
app.use('/vendor/viasocket-apps', express.static(path.join(__dirname, '../node_modules/viasocket-apps/dist/esm')));
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/accounts', accountsRouter);
app.use('/api/items', itemsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/integration', integrationRouter);
app.use('/api/activity', activityRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/invoices', invoicesRouter);

function sameSecret(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function emailEventId(email) {
  if (email.rawId) return String(email.rawId);
  const stableParts = [email.From?.email, email.subject, email.date, email.bodyPlain].join('|');
  return crypto.createHash('sha256').update(stableParts).digest('hex');
}

function isoDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

async function sendSlackInvoiceNotice(invoice) {
  const s = db.slackIntegration;
  if (!s?.enabled || !s.scriptId || !s.destinationId) return;
  const message = `*New ${invoice.kind} added to SubTrack Pro*\n• Vendor: ${invoice.vendor}\n• Amount: ${invoice.currency} ${invoice.amount || 'Not detected'}\n• Date: ${invoice.purchaseDate || 'Not detected'}\n• ${invoice.subject}`;
  try {
    const { viasocket } = require('./services/viasocket-client');
    const user = viasocket.user(db.settings.vsUserId);
    if (s.destinationType === 'user') {
      await viasocket.runAction(s.scriptId, 'rowa5mg9fywy', { userId: s.destinationId, content: message, isScheduledMessage: 'no' });
    } else {
      await viasocket.runAction(s.scriptId, 'rowj2u3wc8h5', { destination: { messageto: 'channel', channel_id: [s.destinationId] }, markdown_content: message });
    }
  } catch (error) { console.error('[Slack notification] Delivery failed:', error.message); }
}

// ViaSocket runs this handler for new email events and sends them here.
// Ollama classifies each message; relevant matches become reviewable drafts.
app.post('/api/webhook/viasocket', async (req, res) => {
  const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(bearer, process.env.VIASOCKET_EVENT_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized ViaSocket event.' });
  }

  const { event, authId } = req.body || {};
  if (!event || typeof event !== 'object' || !authId) {
    return res.status(400).json({ error: 'Expected an email event and its Gmail connection ID.' });
  }

  const accountEntry = Object.entries(db.vsIntegration?.connectedAccts || {})
    .find(([, connection]) => connection.linked && connection.authId === authId);
  if (!accountEntry) return res.status(403).json({ error: 'This Gmail connection is not linked in SubTrack.' });
  const [acctId] = accountEntry;
  const sourceEmailId = emailEventId(event);
  if ((db.invoices || []).some(item => item.sourceEmailId === sourceEmailId) || db.items.some(item => item.sourceEmailId === sourceEmailId)) {
    return res.json({ success: true, duplicate: true });
  }

  try {
    const analysis = await analyzeEmail(event);
    if (!analysis.relevant) return res.json({ success: true, ignored: true });

    const allowedCategories = ['SaaS', 'Infrastructure', 'Design', 'Domain', 'Hardware', 'License'];
    const allowedCycles = ['monthly', 'quarterly', 'annual', 'one-time', 'unknown'];
    const category = allowedCategories.includes(analysis.category) ? analysis.category : 'SaaS';
    const cycle = allowedCycles.includes(analysis.cycle) ? analysis.cycle : 'one-time';
    const amount = String(analysis.amount || '').replace(/[^0-9.\-]/g, '');
    const from = event.From?.email || event.rawPayloadHeaders?.From || 'Unknown sender';
    const subject = event.subject || event.rawPayloadHeaders?.Subject || 'Email detected';
    const invoice = {
      id: uuidv4(),
      acctId,
      vendor: String(analysis.vendor || analysis.name || '').trim().slice(0, 120) || from,
      kind: ['invoice', 'purchase', 'renewal', 'subscription'].includes(analysis.kind) ? analysis.kind : 'purchase',
      invoiceNumber: String(analysis.invoiceNumber || '').slice(0, 100),
      purchaseDate: isoDate(analysis.purchaseDate || analysis.start) || isoDate(event.date),
      name: String(analysis.name || analysis.vendor || '').trim().slice(0, 120) || subject.slice(0, 120),
      category,
      plan: String(analysis.plan || '').slice(0, 120),
      amount: amount || '',
      currency: String(analysis.currency || '₹ INR').slice(0, 20),
      tax: String(analysis.tax || ''),
      cycle,
      sender: from,
      subject: String(subject).slice(0, 240),
      notes: String(analysis.notes || '').slice(0, 1000),
      emailUrl: event.messageUrl || '',
      threadId: String(event.threadId || event.rawId || '').slice(0, 100),
      messageId: String(event.rawId || '').slice(0, 100),
      emailPreview: String(event.bodyPlain || event.snippet || '').slice(0, 2000),
      replies: [],
      attachmentNames: Array.isArray(event.attachmentDetails)
        ? event.attachmentDetails.map(file => String(file?.filename || '').slice(0, 140)).slice(0, 10)
        : event.attachmentDetails && typeof event.attachmentDetails === 'object'
          ? [String(event.attachmentDetails.filename || '').slice(0, 140)]
          : [],
      confidence: Number.isFinite(Number(analysis.confidence)) ? Math.max(0, Math.min(1, Number(analysis.confidence))) : null,
      needsReview: !Number.isFinite(Number(analysis.confidence)) || Number(analysis.confidence) < 0.65,
      sourceEmailId,
      createdAt: new Date().toISOString()
    };

    db.invoices ||= [];
    db.invoices.unshift(invoice);
    // Recurring services are also added to the subscription tracker automatically.
    if (cycle !== 'one-time' && cycle !== 'unknown') {
      db.items.push({
        id: uuidv4(), acctId, name: invoice.name, category, plan: invoice.plan,
        cost: invoice.amount || '0', currency: invoice.currency, cycle,
        start: invoice.purchaseDate, expiry: isoDate(analysis.expiry),
        notes: `Auto-added from invoice email: ${subject}`.slice(0, 1000), key: '', seats: '1',
        url: event.messageUrl || '', isDraft: false, sourceEmailId, createdAt: new Date().toISOString()
      });
    }
    db.notifications.unshift({
      id: uuidv4(),
      title: `${invoice.kind[0].toUpperCase()}${invoice.kind.slice(1)} added: ${invoice.vendor}`,
      desc: `${invoice.currency} ${invoice.amount || 'Amount not detected'} · ${subject}`,
      ico: '✉️',
      color: '#4F8EF7',
      unread: true,
      ts: Date.now()
    });
    db.activity.unshift({
      id: uuidv4(),
      text: `Email analyzed — ${invoice.kind} added for ${invoice.vendor}`,
      ico: '✉️',
      color: 'var(--acc-bg)',
      ts: Date.now()
    });
    db.activity = db.activity.slice(0, 30);
    db.save();
    sendSlackInvoiceNotice(invoice);
    return res.json({ success: true, invoiceId: invoice.id });
  } catch (error) {
    console.error('[Email analysis] Failed:', error.message);
    return res.status(503).json({ error: error.message || 'Email analysis failed.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ SubTrack Pro running at http://localhost:${PORT}\n`);
});
