# SubTrack Pro — Demo Setup

This build adds single-admin login, Gmail invoice/purchase capture, Ollama extraction, optional Slack alerts, a light/dark switch, and an Invoices & Purchases page. The database is a local JSON file created automatically at `backend/data/db.json`.

## 1. Install and configure

Use Node.js 20 or newer. In this project folder:

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Edit `.env` and set `ADMIN_EMAIL`, a strong `ADMIN_PASSWORD`, `SESSION_SECRET`, a fresh `VIASOCKET_EMBED_SECRET`, and `VIASOCKET_EVENT_SECRET`. Keep `.env` private; it is excluded from the project archive and Git. The ViaSocket signing secret previously shown in screenshots/chat should be rotated in the ViaSocket dashboard before use.

## 2. Install and launch

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with the admin email/password from `.env`.

## 3. Start local AI

Install/start Ollama, then download the configured model:

```bash
ollama pull qwen3.5:4b
```

Keep Ollama running. The server calls its local API at `OLLAMA_URL`; email bodies are sent only to this local Ollama process for extraction.

## 4. Enable ViaSocket event delivery

ViaSocket must be able to reach a public HTTPS URL for the callback. A localhost URL will not work. Start an HTTPS tunnel to port 3000 using your preferred tunnel provider, then set the resulting address as `PUBLIC_APP_URL` in `.env` (no trailing path). Restart `npm run dev` after changing environment values.

Click **Integrations → Connect Gmail**. Each mailbox is authorized separately through ViaSocket’s Gmail consent popup. SubTrack subscribes to new-email events and sends them to `/api/webhook/viasocket` with the event secret. Matching invoices and purchases are saved automatically; recurring charges also create subscription records. Existing historical email is not imported. If the AI confidence is low, the invoice is still stored but marked “Review extraction”.

## 5. Optional Slack notifications

Go to **Integrations → Enable Slack notifications**, authorize Slack in the popup, then choose a channel or direct-message recipient. The choice is saved for subsequent alerts. Notifications are sent for new qualifying invoice/purchase email records. Slack credentials stay in ViaSocket; only ViaSocket references and the chosen destination are stored in SubTrack’s server-side database.

## Data and demo limitations

- The app is configured as a single administrator workspace, not a multi-tenant public SaaS login system.
- ViaSocket holds third-party OAuth credentials. SubTrack stores only connection references and automation IDs in its local JSON database.
- Gmail event attachment names are recorded. The trigger payload provides an email text preview, not necessarily the full message. This version analyzes that available text and does not download or OCR attached PDF/image contents; invoices whose totals appear only in an attachment may need review/manual entry.
- Local tunnel URLs can change; update `PUBLIC_APP_URL` and reconnect/resubscribe after tunnel changes.
- For a public production deployment, use HTTPS and a persistent database/session store, set `NODE_ENV=production`, and keep all secrets in the hosting provider’s secret manager.
