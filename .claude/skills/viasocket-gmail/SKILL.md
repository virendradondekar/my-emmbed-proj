---
name: viasocket-gmail
description: >-
  Integrate Gmail into this product through viaSocket's Apps API: an end user connects Gmail
  from this product's own screens; this product then runs Gmail actions and reacts to Gmail
  events. Use whenever the task involves Gmail for an end user.
---

# Gmail via viaSocket

viaSocket owns the connection to Gmail: OAuth, token refresh, its API, its webhooks. This product
makes a few calls to viaSocket and never talks to Gmail directly. Each user's Gmail credentials stay
encrypted in viaSocket's vault, event handlers run in viaSocket's sandbox, and the documentation below is
generated from the live catalog.

## Your workspace

| | |
| --- | --- |
| `org_id` | `10879` |
| `project_id` | `projpbIHGVY7` |
| `service_id` | `rowo0bqrhj5g` (Gmail) |
| `VIASOCKET_EMBED_SECRET` | in this product's server environment. If it is missing, ask the developer to paste it from the viaSocket dashboard. Never print it. |

The dashboard filled these in when the developer copied this file. You need no viaSocket login.

## Read the Gmail documentation first

```
GET https://beta-flow.viasocket.com/documentation/rowo0bqrhj5g.md?format=sdk&org=10879&project=projpbIHGVY7
Accept: text/markdown
```

Save it as `.claude/skills/viasocket-gmail/reference.md` (or your agent's equivalent) and
follow it. It is generated from the live catalog: every Gmail action and trigger with its
`action_version_id`, every field with its type, whether it is required, whether its value comes from
`list-options` and when it applies, a field index for pickers, a sample `inputData` per event, two
handler templates for events, how to render a form for any action, and a troubleshooting table.
It is written for the `viasocket-apps` npm package (Node 20+). For plain HTTP from any language, fetch the same URL with `format=http`.

## The embed token

Every call for an end user carries a JWT this product's backend signs, per user, on demand:

```
algorithm: HS256
payload:   { "org_id": "10879", "project_id": "projpbIHGVY7", "unique_identifier": "<your stable id for this user>" }
secret:    VIASOCKET_EMBED_SECRET
```

`unique_identifier` is this product's own user id, not a token. One per user, forever. The browser
receives a token only to open the connect popup, never the secret.

## Build only what the use case needs

Every integration is a subset of the same pieces: Connect (always — their account), Pick (the user
must choose something from their Gmail account), Act (this product does something in Gmail), React
(something happens in Gmail and this product responds). Take only what the request needs. How they
combine — worked examples, not the menu:

| The developer says | Pieces | The end user sees |
| --- | --- | --- |
| "When X happens in Gmail, do Y" | Connect, Pick, React | a connect button and a picker for what they must choose; a handler does Y — no action list, no form |
| "Let users decide what happens in Gmail" | Connect, Act | connect, the Gmail actions, a form rendered from the chosen schema (`https://beta-flow.viasocket.com/documentation/form-renderer.md`) |
| "Gmail data inside our product" | Connect, Pick | connect and a picker; `list-options`, nothing else |

A request that matches none of these is built from the same pieces, in this order:

1. Environment: the ids above and the secret. 2. A token endpoint on this product's backend.
3. The connect button, as the document's Step 1 shows; store the `auth_id`. 4. Enable Gmail only if
the product runs its actions: once per user, look up first, store the `script_id` like a password.
5. Pickers for what the user must choose, from the field index. 6. Actions with `inputData` as the
document's sample; events subscribed once, with a handler, saving the subscription record the document describes.

**Events run on viaSocket, not on this server.** A Gmail trigger subscription carries a handler:
`code`, a short script viaSocket runs each time the event fires. It runs an action in another app the
user connected, or calls this product's own API with its own auth header baked in. Never ask the
developer for a webhook URL; `webhook` exists only for pushing raw events to a public endpoint they
explicitly want. Both handler templates are in the document.

If the feature also needs another app (say Gmail events posting to Slack), find its `service_id` with
`GET https://flow.sokt.io/func/scri12BSufQM?key=<app name>` (pick by `name`) and fetch its documentation
from the same route: `https://beta-flow.viasocket.com/documentation/<service_id>.md?format=sdk&org=10879&project=projpbIHGVY7`.
One document per app, one connection per app, one handler.

Test with a real call before saying it works. Report what actually came back.

## Rules

- The signing secret and every `script_id` stay on the server. Never in the repo, never in a browser.
- One `unique_identifier` per end user, forever.
- Never hardcode an id the document says to fetch. Never type a field key: keys are case-sensitive and differ between actions of one app; copy each from the table of the action you call.
- The UI is only what the use case needs. Where this file and the document disagree, the document wins.
