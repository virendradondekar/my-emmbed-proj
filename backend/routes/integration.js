const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../data/db');
const { viasocketUser } = require('../services/viasocket-client');
const { safeViaSocketCleanup } = require('../services/viasocket-cleanup');

const router = express.Router();
const GMAIL_SERVICE_ID = process.env.VIASOCKET_SERVICE_ID || 'rowo0bqrhj5g';
const NEW_EMAIL_TRIGGER_ID = 'rowubk94iqsc';
const SLACK_SERVICE_ID = 'rowbu58rc';
const SLACK_CHANNEL_PICKER_ID = 'rowngjjx9rlo';
const SLACK_USER_PICKER_ID = 'rowa5mg9fywy';
const SLACK_SEND_MESSAGE_ID = 'rowj2u3wc8h5';
const SLACK_SEND_DM_ID = 'rowa5mg9fywy';

function getUniqueIdentifier() {
  if (!db.settings.vsUserId) {
    db.settings.vsUserId = uuidv4();
    db.save();
  }
  return db.settings.vsUserId;
}

function getUser() {
  return viasocketUser(getUniqueIdentifier());
}

function safeIntegration() {
  const connectedAccts = {};
  for (const [acctId, connection] of Object.entries(db.vsIntegration?.connectedAccts || {})) {
    connectedAccts[acctId] = {
      linked: !!connection.linked,
      linkedAt: connection.linkedAt || null,
      email: connection.email || null,
      subscriptionActive: !!connection.subscriptionId && connection.active !== false
    };
  }
  return { enabled: !!db.vsIntegration?.enabled, connectedAccts };
}

router.get('/', (req, res) => res.json(safeIntegration()));

// The SDK signs the token on the server for this stable user identifier.
// The browser receives only the short-lived purpose token, never the secret.
router.get('/embed-token', async (req, res) => {
  try {
    const token = await getUser().token();
    res.type('text/plain').send(token);
  } catch (error) {
    console.error('[ViaSocket] Token generation failed:', error.message);
    res.status(503).json({ error: error.message || 'Could not create a ViaSocket embed token.' });
  }
});

// Save one Gmail connection and subscribe to new incoming emails for it.
router.post('/gmail/connect/:acctId', async (req, res) => {
  const acct = db.accounts.find(account => account.id === req.params.acctId);
  if (!acct) return res.status(404).json({ error: 'SubTrack account not found.' });

  const authId = String(req.body?.authId || '').trim();
  if (!authId) return res.status(400).json({ error: 'ViaSocket did not return a Gmail connection ID.' });

  const integration = db.vsIntegration || (db.vsIntegration = { enabled: false, connectedAccts: {} });
  integration.connectedAccts ||= {};
  const existing = integration.connectedAccts[acct.id];
  if (existing?.linked && existing.authId === authId && existing.subscriptionId) {
    return res.json({ success: true, integration: safeIntegration() });
  }

  const publicUrl = process.env.PUBLIC_APP_URL;
  const eventSecret = process.env.VIASOCKET_EVENT_SECRET;
  if (!publicUrl || !eventSecret) {
    return res.status(503).json({ error: 'Set PUBLIC_APP_URL and VIASOCKET_EVENT_SECRET in .env before connecting Gmail.' });
  }
  let callbackUrl;
  try {
    callbackUrl = new URL(publicUrl);
    if (callbackUrl.protocol !== 'https:') throw new Error('PUBLIC_APP_URL must use HTTPS.');
  } catch (error) {
    return res.status(400).json({ error: error.message || 'PUBLIC_APP_URL must be a valid HTTPS URL.' });
  }

  try {
    // Handler executes inside ViaSocket and securely delivers each event to the
    // SubTrack backend. It is not a raw, unauthenticated ViaSocket webhook.
    const eventHandler = `
      const event = context.req.body;
      const response = await fetch(${JSON.stringify(`${callbackUrl.origin}/api/webhook/viasocket`)}, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": ${JSON.stringify(`Bearer ${eventSecret}`)}
        },
        body: JSON.stringify({ event, authId: ${JSON.stringify(authId)} })
      });
      if (!response.ok) throw new Error("SubTrack event endpoint returned " + response.status);
      return await response.json();
    `;

    // An empty query subscribes to incoming email without imposing a filter.
    // The Gmail trigger requires thread mode; first_email_only avoids processing
    // each reply in a conversation as another new subscription record.
    const inputData = { query: [], thread: 'first_email_only' };
    const subscription = await getUser().subscribe(NEW_EMAIL_TRIGGER_ID, {
      authId,
      inputData,
      code: eventHandler,
      meta: { user_id: getUniqueIdentifier(), account_id: acct.id }
    });
    if (!subscription?.scriptId) throw new Error('ViaSocket did not return a subscription script ID.');

    integration.connectedAccts[acct.id] = {
      linked: true,
      active: true,
      authId,
      subscriptionId: subscription.scriptId,
      email: acct.email,
      linkedAt: new Date().toISOString(),
      serviceId: GMAIL_SERVICE_ID,
      triggerVersionId: NEW_EMAIL_TRIGGER_ID,
      inputData
    };
    integration.enabled = true;
    db.save();

    // If this mailbox was reconnected, retire its previous subscription and
    // connection only after the replacement has been saved successfully.
    if (existing?.subscriptionId && existing.subscriptionId !== subscription.scriptId) {
      try { await getUser().disableFlow(existing.subscriptionId); } catch (error) {
        console.warn('[ViaSocket] Old subscription cleanup failed:', error.message);
      }
      if (existing.authId && existing.authId !== authId) {
        try { await getUser().revokeConnection(existing.authId); } catch (error) {
          console.warn('[ViaSocket] Old connection cleanup failed:', error.message);
        }
      }
    }

    res.json({ success: true, integration: safeIntegration() });
  } catch (error) {
    console.error('[ViaSocket] Could not subscribe Gmail account:', error.message);
    res.status(502).json({ error: `Gmail connected, but email monitoring could not be started: ${error.message}` });
  }
});

router.post('/unlink/:acctId', async (req, res) => {
  const integration = db.vsIntegration || { enabled: false, connectedAccts: {} };
  const connection = integration.connectedAccts?.[req.params.acctId];
  if (!connection?.linked) return res.json({ success: true, integration: safeIntegration() });

  try {
    await safeViaSocketCleanup({
      disableFlow: connection.subscriptionId ? () => getUser().disableFlow(connection.subscriptionId) : null,
      shouldDisable: !!connection.subscriptionId,
    });
    await safeViaSocketCleanup({
      disableFlow: connection.actionScriptId ? () => getUser().disableFlow(connection.actionScriptId) : null,
      shouldDisable: !!connection.actionScriptId,
    });
    await safeViaSocketCleanup({
      revokeConnection: connection.authId ? () => getUser().revokeConnection(connection.authId) : null,
      shouldRevoke: !!connection.authId,
    });

    delete integration.connectedAccts[req.params.acctId];
    integration.enabled = Object.values(integration.connectedAccts).some(item => item.linked && item.active !== false);
    db.vsIntegration = integration;
    db.save();
    res.json({ success: true, integration: safeIntegration() });
  } catch (error) {
    console.error('[ViaSocket] Disconnect failed:', error.message);
    res.status(502).json({ error: `Could not disconnect Gmail: ${error.message}` });
  }
});

router.post('/toggle', async (req, res) => {
  const integration = db.vsIntegration || (db.vsIntegration = { enabled: false, connectedAccts: {} });
  const activeConnections = Object.entries(integration.connectedAccts || {}).filter(([, connection]) => connection.linked && connection.subscriptionId);
  if (!activeConnections.length) {
    integration.enabled = false;
    db.save();
    return res.json({ enabled: false, integration: safeIntegration() });
  }

  const nextEnabled = !integration.enabled;
  try {
    for (const [, connection] of activeConnections) {
      if (nextEnabled) await getUser().enableFlow(connection.subscriptionId);
      else await getUser().disableFlow(connection.subscriptionId);
    }
    for (const [, connection] of activeConnections) connection.active = nextEnabled;
    integration.enabled = nextEnabled;
    db.save();
    res.json({ enabled: integration.enabled, integration: safeIntegration() });
  } catch (error) {
    console.error('[ViaSocket] Could not change monitoring state:', error.message);
    res.status(502).json({ error: `Could not ${nextEnabled ? 'resume' : 'pause'} Gmail monitoring: ${error.message}` });
  }
});

// Slack connection and destination setup. The actual Slack OAuth token stays in ViaSocket.
router.get('/slack/status', (req, res) => {
  const s = db.slackIntegration || {};
  res.json({ connected: !!s.authId, enabled: !!s.enabled, destinationType: s.destinationType || null, destinationLabel: s.destinationLabel || null });
});
router.post('/slack/connect', (req, res) => {
  const authId = String(req.body?.authId || '').trim();
  if (!authId) return res.status(400).json({ error: 'ViaSocket did not return a Slack connection ID.' });
  db.slackIntegration = { ...(db.slackIntegration || {}), authId, enabled: false };
  db.save();
  res.json({ success: true });
});
router.get('/slack/options/:type', async (req, res) => {
  const s = db.slackIntegration || {};
  if (!s.authId) return res.status(400).json({ error: 'Connect Slack first.' });
  const type = req.params.type;
  const versionId = type === 'channel' ? SLACK_CHANNEL_PICKER_ID : type === 'user' ? SLACK_USER_PICKER_ID : null;
  const fieldKey = type === 'channel' ? 'channel_id' : type === 'user' ? 'userId' : null;
  if (!versionId) return res.status(400).json({ error: 'Choose channel or DM.' });
  try {
    const { options = [] } = await getUser().listOptions(versionId, { fieldKey, authId: s.authId, existingFields: {} });
    res.json(options);
  } catch (error) {
    console.error('[ViaSocket] Slack destination list failed:', error.message);
    res.status(502).json({ error: error.message || 'Could not load Slack destinations.' });
  }
});
router.post('/slack/destination', async (req, res) => {
  const s = db.slackIntegration || {};
  if (!s.authId) return res.status(400).json({ error: 'Connect Slack first.' });
  const { type, value, label } = req.body || {};
  if (!['channel', 'user'].includes(type) || !value || !label) return res.status(400).json({ error: 'Choose a Slack channel or user.' });
  try {
    let scriptId = await getUser().findEnabled(SLACK_SERVICE_ID);
    if (!scriptId) scriptId = (await getUser().enable(SLACK_SERVICE_ID, s.authId)).scriptId;
    if (!scriptId) throw new Error('ViaSocket did not return a Slack action ID.');
    Object.assign(s, { scriptId, destinationType: type, destinationId: String(value), destinationLabel: String(label), enabled: true });
    db.slackIntegration = s;
    db.save();
    res.json({ connected: true, enabled: true, destinationType: type, destinationLabel: s.destinationLabel });
  } catch (error) {
    console.error('[ViaSocket] Slack setup failed:', error.message);
    res.status(502).json({ error: error.message || 'Could not enable Slack notifications.' });
  }
});
router.post('/slack/toggle', async (req, res) => {
  const s = db.slackIntegration || {};
  if (!s.authId) return res.status(400).json({ error: 'Connect Slack first.' });
  if (!s.destinationId || !s.scriptId) return res.status(400).json({ error: 'Choose a Slack channel or DM first.' });
  s.enabled = req.body?.enabled === true;
  db.slackIntegration = s; db.save();
  res.json({ enabled: s.enabled });
});
router.post('/slack/disconnect', async (req, res) => {
  const s = db.slackIntegration || {};
  try {
    await safeViaSocketCleanup({
      disableFlow: s.scriptId ? () => getUser().disableFlow(s.scriptId) : null,
      shouldDisable: !!s.scriptId,
    });
    await safeViaSocketCleanup({
      revokeConnection: s.authId ? () => getUser().revokeConnection(s.authId) : null,
      shouldRevoke: !!s.authId,
    });
    db.slackIntegration = { enabled: false, authId: null, scriptId: null, destinationType: null, destinationId: null, destinationLabel: null };
    db.save(); res.json({ success: true });
  } catch (error) { res.status(502).json({ error: error.message || 'Could not disconnect Slack.' }); }
});

module.exports = router;
