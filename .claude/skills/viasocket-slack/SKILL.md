---
name: viasocket-slack
description: Integrate Slack for SubTrack Pro using ViaSocket. Read the current generated reference.md before changing Slack integrations.
---

# Slack via ViaSocket

- Workspace: org `10879`, project `projpbIHGVY7`, Slack service `rowbu58rc`.
- ViaSocket owns Slack OAuth and stores actual Slack credentials encrypted. Do not store passwords or OAuth tokens in SubTrack.
- The backend signs user-scoped embed tokens; never expose the signing secret or Slack `scriptId` to the browser.
- Use the small provider connect popup via `connect({embedToken, serviceId: 'rowbu58rc'})`; do not mount the full catalog UI for this fixed product feature.
- Read `reference.md` for exact action ids, option field keys, and inputData schemas. Never guess IDs or field keys.
- Slack action connections are enabled once with `findEnabled` / `enable`, then actions run on the backend. Persist `scriptId` and selected destination as server-only data.
- The invoice notification feature supports a Slack channel or direct-message destination chosen by the user. Load options with `listOptions` using the documented field index and `authId`.
