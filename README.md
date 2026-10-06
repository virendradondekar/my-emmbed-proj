# SubTrack Pro

SubTrack Pro tracks subscriptions, warranties, software licenses, and Gmail-detected purchases. This demo build includes single-admin sign-in, ViaSocket connection popups for Gmail and Slack, Ollama email extraction, invoice records, Slack alerts, and a persistent light/dark choice.

Start with [README-SETUP.md](README-SETUP.md) for environment setup and demo instructions.

## Important

- Set secrets and admin credentials in a local `.env` file. Never commit or share it.
- Gmail and Slack OAuth credentials are stored encrypted by ViaSocket. SubTrack stores only the ViaSocket references it needs.
- Incoming email event payloads may contain only a text preview; attachment names are saved, but attached PDFs/images are not parsed in this demo build.
- A public HTTPS callback URL is required for ViaSocket to deliver email events.
