const express = require('express');
const db = require('../data/db');
const { viasocket, viasocketUser } = require('../services/viasocket-client');
const router = express.Router();

const GMAIL_SERVICE_ID = process.env.VIASOCKET_SERVICE_ID || 'rowo0bqrhj5g';
const GMAIL_REPLY_TO_THREAD_ID = 'rowxvyjgbn1y';

// Strip server-only fields before sending invoice rows to the browser.
function publicInvoice(row) {
  const { sourceEmailId, ...rest } = row;
  return { ...rest, canReply: !!row.threadId, replies: row.replies || [] };
}

router.get('/', (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();
  const rows = (db.invoices || []).filter(row => !query || [row.vendor, row.subject, row.invoiceNumber, row.kind].some(value => String(value || '').toLowerCase().includes(query)));
  res.json(rows.map(publicInvoice));
});

// Gmail actions need an enabled flow (script_id) per connection. Look it up
// first, excluding the trigger subscription, and enable only when none exists.
async function gmailActionScriptId(connection) {
  if (connection.actionScriptId) return connection.actionScriptId;
  const user = viasocketUser(db.settings.vsUserId);
  const subscriptionIds = new Set(Object.values(db.vsIntegration?.connectedAccts || {}).map(c => c.subscriptionId).filter(Boolean));
  const flows = await user.listFlows();
  const existing = flows.find(flow => flow.serviceId === GMAIL_SERVICE_ID && flow.authId === connection.authId
    && flow.status === 'active' && !subscriptionIds.has(flow.id));
  const scriptId = existing?.id || (await user.enable(GMAIL_SERVICE_ID, connection.authId)).scriptId;
  if (!scriptId) throw new Error('ViaSocket did not return a Gmail action ID.');
  connection.actionScriptId = scriptId;
  db.save();
  return scriptId;
}

router.post('/:id/reply', async (req, res) => {
  const invoice = (db.invoices || []).find(row => row.id === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice record not found.' });
  if (!invoice.threadId) return res.status(400).json({ error: 'This record has no Gmail thread to reply to.' });
  const connection = db.vsIntegration?.connectedAccts?.[invoice.acctId];
  if (!connection?.linked || !connection.authId) return res.status(400).json({ error: 'Reconnect the Gmail account this invoice came from.' });

  const message = String(req.body?.message || '').trim();
  const replyMode = ['sender', 'all'].includes(req.body?.replyMode) ? req.body.replyMode : 'sender';
  const cc = String(req.body?.cc || '').trim();
  if (!message) return res.status(400).json({ error: 'Write a reply first.' });
  if (message.length > 20000) return res.status(400).json({ error: 'Reply is too long.' });

  const inputData = { threadId: invoice.threadId, replyMode, messageType: 'text', messageBody: message };
  if (replyMode === 'all' && cc) inputData.cc = cc;

  try {
    const scriptId = await gmailActionScriptId(connection);
    const result = await viasocket.runAction(scriptId, GMAIL_REPLY_TO_THREAD_ID, inputData);
    const sent = result?.data || result || {};
    invoice.replies ||= [];
    invoice.replies.push({ message: message.slice(0, 2000), replyMode, sentAt: new Date().toISOString(), gmailMessageId: sent.id || null });
    db.save();
    res.json({ success: true, invoice: publicInvoice(invoice) });
  } catch (error) {
    console.error('[Gmail reply] Failed:', error.message);
    res.status(502).json({ error: `Could not send the reply: ${error.message}` });
  }
});

router.delete('/:id', (req, res) => {
  const before = db.invoices.length;
  db.invoices = db.invoices.filter(row => row.id !== req.params.id);
  if (db.invoices.length === before) return res.status(404).json({ error: 'Invoice record not found.' });
  db.save();
  res.json({ success: true });
});

module.exports = router;
