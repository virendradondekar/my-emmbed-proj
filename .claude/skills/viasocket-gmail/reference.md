---
name: viasocket-apps
description: >-
  Integrate Gmail into this product through the viaSocket Apps API: render a connect
  button, capture the user's connection, populate pickers with their real data, run
  Gmail actions from the backend, and subscribe to Gmail events. Use whenever the
  task involves connecting a third-party app for an end user, reading the choices a field
  accepts, running an action in that app, or receiving its events.
---

# Gmail via the viaSocket Apps API

> Source: https://flow.viasocket.com/documentation/rowo0bqrhj5g.md?format=sdk. Public, no sign-in. Fetch it again for the
> latest version of this file; it is generated from the live catalog.

viaSocket owns the integration with the app. Your code never talks to the app, never holds
its credentials and never refreshes its tokens — you make the five calls below and we do
that part. Your user authorises through the app’s own consent screen.

What that buys you, concretely:

- **Credentials you never see.** Each user’s Gmail tokens live encrypted in viaSocket’s vault and are
  refreshed there; a leak of your database leaks no third-party access.
- **One contract for Gmail and 2,300 other apps.** The same five calls, the same `{ label, value }` options,
  the same event handler shape, whichever app the user connects next.
- **Triggers done for you.** Polling where the app has no webhooks, de-duplication, renewal, delivery.
- **A runtime for your logic, not just a proxy.** An event handler is JavaScript we run in an isolated
  sandbox per event, with every app this user connected one `fetch` away and no secret in the code. So
  "when X, do Y" needs no server of yours, no deploy and nothing public, and `update-subscribed-event`
  swaps a live handler in place rather than shipping a release.
- **Real data for pickers.** `list-options` returns the user’s own channels, sheets and boards,
  searchable where the app’s list is large.
- **This file is generated from the live catalog.** Every id and field is current; refetch it rather than
  trusting a copy.

This file uses the `viasocket-apps` npm package (Node 20+, zero dependencies). Every server-side
call is a method on `viasocket` or `user`, both set up once in “Calling it”.

## What you are building

1. A **connect button** in your UI that opens Gmail's consent screen and gives you an `auth_id`.
2. **Pickers** in your UI filled with the user's real Gmail data, one call per field.
3. **Actions** — enable the app once for a `script_id`, then run them from your backend.
4. **Events** — when something happens in the app, a short handler of yours runs on our
   servers: it runs an action in another app, calls your API, or both. Your server is not in the path.

> Enabling is only for actions. A trigger subscription needs the `auth_id` and nothing
> else, so an integration that only listens for events never calls `/embed/enable`.

## Rules that are not negotiable

1. **The signing secret and the embed token are server-side only.** Sign the token on your
   backend; hand the frontend only what one popup needs.
2. **A `script_id` is a credential.** Anyone holding it can run that app as that user.
   Store it like a password and never ship it to the browser.
3. **Ids are fetched, never guessed.** Repository ids, channel ids, sheet ids — every one
   comes from `POST /embed/list-options`. A hardcoded id fails confusingly, not clearly.
4. **`existingFields` is not optional when a field depends on another.** Options are scoped
   by it; `{}` for a dependent field returns nothing useful.
5. **A nested key is addressed by its whole path.** `inputData` nests — `{ destination: {
   channel_id } }` — and the API addresses that field as `destination.channel_id`. So
   `fieldKey` is the **full dotted path**, never the leaf, and `existingFields` carries the
   value **nested exactly as inputData does**, never flattened:

   ```json
   { "fieldKey": "destination.thread_ts",
     "existingFields": { "destination": { "thread_channel_id": "C082WLRJLAA" } } }
   ```

   A leaf `fieldKey`, or a flat `"destination.thread_channel_id"` key in `existingFields`,
   matches no field: the call succeeds and returns nothing. Every field table below writes
   its keys in this full form, and the `inputData` sample beside each one shows the object
   those paths nest into. **Keys are case-sensitive and differ between actions of this app**
   (Google Sheets: `spreadsheet_Id` in one action, `spreadSheet_id` in another, `spreadsheet_id` in
   a third). A key from another action matches nothing, silently. Copy each key from the table
   of the action you are calling, character for character; never type one from memory. The
   parameter that carries it is `fieldKey` — not `blockKey`, not `field`.
6. **Options are `{ label, value }`.** `user.listOptions` always returns `{ options }` —
   show the label, send the value. There is no paging to do: the first response is the list.
   An unreadable connection (revoked, or another user's `auth_id`) throws a `ViaSocketError` with status 400 even though the API answered 200.
   A field marked **searchable** (`enableSearchApi` in the schema) takes what the user typed as
   `existingFields._searchText`, inside existingFields next to the dependency values. The field
   tables mark it.
7. **One `unique_identifier` per end user, forever.** Connections and subscriptions are
   isolated by it. Change it and the user appears to have lost their connection.
8. **A field of type `object` is not a single choice.** Fetch it like any other field —
   the response is the same `{ label, value }` list — then use *every* option’s `value` as a
   key, **verbatim**, and supply a value for each: `{ "<option value>": "<your value>" }`. The
   value is opaque: `name@longtext` is the whole key, however much it looks like a name plus a
   type. Never send the label, a lowercased label, or the value with a suffix removed.
9. **Enable only when you need actions, and never twice.** Subscribing to an event needs
   the connection and nothing more. Before enabling, look the flows up (see “Managing what
   a user already has”) — the `script_id` you want may already exist.
10. **A subscription needs a handler: `code`, a string of JavaScript we run on viaSocket’s
    servers each time the event fires.** It is what makes “when X happens in this app, do Y”
    work with no server of yours in the path. In scope there: `axios`, `fetch`, and `context`;
    the event is `context.req.body`. It stands alone: no `import`/`require`, nothing from this
    codebase; anything of yours it needs (a `script_id`, a picked id, an API key) is baked into
    the string when you subscribe. `webhook` is the edge case, not the default: pass it only
    when the product wants raw events pushed to a public endpoint of its own. Never both.

## Environment

```bash
# Your org signing secret, from the viaSocket Install Code page. Backend only.
VIASOCKET_EMBED_SECRET=...

# Fixed for this integration.
VIASOCKET_ORG_ID=10879
VIASOCKET_PROJECT_ID=projpbIHGVY7
VIASOCKET_API_URL=https://flow-api.viasocket.com
VIASOCKET_RUN_URL=https://flow.sokt.io
VIASOCKET_SERVICE_ID=rowo0bqrhj5g   # Gmail
```

## Calling it

```bash
npm install viasocket-apps
```

One client for the server, created once. Everything for one end user hangs off `viasocket.user(id)`.

```js
import { ViaSocket } from 'viasocket-apps'

export const viasocket = new ViaSocket({
  orgId: process.env.VIASOCKET_ORG_ID,
  projectId: process.env.VIASOCKET_PROJECT_ID,
  secret: process.env.VIASOCKET_EMBED_SECRET, // server-side only
  apiBaseUrl: process.env.VIASOCKET_API_URL,
  runBaseUrl: process.env.VIASOCKET_RUN_URL
})

// One scope per end user. Every example below assumes `user` is this.
const user = viasocket.user(uniqueIdentifier)
```

| method | what it does | returns |
| --- | --- | --- |
| `await user.token()` | Signs the embed token for this user. Hand it to the browser for one popup; never cache it there. | `string` |
| `await user.findEnabled(serviceId)` | The `scriptId` of an app this user already enabled, or `null`. Call before `enable`. | `string \| null` |
| `await user.enable(serviceId, authId)` | Needed only to run actions. Once per (user, app) — store `scriptId`. | `{ scriptId, webhookUrl, serviceId, authId }` |
| `await user.listOptions(versionId, { fieldKey, authId, existingFields })` | The values one field accepts. Both response shapes normalised; no paging. | `{ options: [{ label, value }] }` |
| `await viasocket.runAction(scriptId, versionId, inputData)` | Runs an action. On the root client: no token, the `scriptId` is the credential. | the app’s own response |
| `await user.subscribe(versionId, { authId, inputData, code \| webhook, meta })` | Subscribes to an event with a handler (`code`) we run per event; `webhook` is the edge case. Needs only the connection — no `enable` first. Store `scriptId`. | `{ scriptId, hookUrl, title, authId, inputData, meta }` |
| `await user.updateSubscription(scriptId, { code, meta })` | Changes a live subscription in place. | same as `subscribe` |
| `await user.listFlows()` | Every flow this user has: one per enabled app, one per subscription. | `[{ id, title, status, webhook, authId, serviceId }]` — `id` is the `scriptId` |
| `await user.disableFlow(scriptId)` / `user.enableFlow(scriptId)` | Turns one flow off or on. | `{ id, status }` — `"0"` disabled, `"1"` active |
| `await user.listConnections()` | Every app this user has connected. | array |
| `await user.revokeConnection(authId)` | Disconnects an app. Disable the flows built on it first. | `void` |

The browser half is `import { connect } from 'viasocket-apps/browser'` — used in Step 1. It resolves with
`{ authId }` and rejects with a `ViaSocketConnectError` whose `code` is 'closed', 'rejected' or 'script'.

Every server-side failure throws a `ViaSocketError` carrying the API message, the HTTP `status` and the parsed `body`.

## Step 1 — the connect button (frontend)

The only browser-side piece. Use Gmail's own icon so the button is recognisable.

```html
<button id="connect-app" class="your-button">
  <img src="https://stuff.thingsofbrand.com/gmail.com/images/imge_idrA5FDGTH_1763454052978.svg" alt="" width="20" height="20" />
  Connect Gmail
</button>

<script type="module">
  import { connect } from 'viasocket-apps/browser'

  document.getElementById("connect-app").onclick = async () => {
    // Your backend signs this for the signed-in user: await user.token()
    const embedToken = await fetch("/api/viasocket/token").then((r) => r.text())
    try {
      const { authId } = await connect({ embedToken, serviceId: "rowo0bqrhj5g" })
      // authId is what every later call takes. Hand it to your backend, which enables
      // the app (only if you need actions) and stores the scriptId it gets back.
      await fetch("/api/viasocket/connected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: "rowo0bqrhj5g", authId })
      })
      showConnected()
    } catch (error) {
      if (error.code === 'closed') return // popup closed early; nothing was created
      showError(error.message)
    }
  }
</script>
```

Then, on your backend, for that user:

```js
// Only if you are going to run actions — subscribing to events needs just the authId.
let scriptId = await user.findEnabled('rowo0bqrhj5g')
if (!scriptId) scriptId = (await user.enable('rowo0bqrhj5g', authId)).scriptId
// store scriptId against (uniqueIdentifier, "rowo0bqrhj5g")
```

## Gmail

- `service_id`: `rowo0bqrhj5g`
- icon: https://stuff.thingsofbrand.com/gmail.com/images/imge_idrA5FDGTH_1763454052978.svg
- auth: Auth2.0
- 9 actions, 3 triggers

## How to render a picker for any field

This is the part that is not obvious. To show the user a dropdown of Gmail values —
repositories, channels, boards, spreadsheets — you do **not** need the action you intend to
run. You need *any* action or trigger that exposes that field, and you call list-options on
that one's `action_version_id`. The field key is the same wherever it appears.

This table gives the cheapest source for every fetchable field of this app: the action with
the fewest prerequisites. Use it to build pickers before you have decided which action the
user is ultimately running.

Every key below is the **full path**, which is exactly what `fieldKey` takes. Where one has a
dot in it the field lives inside an object, so its value is nested under that path in both
`existingFields` and `inputData`.

| field key | label | needs first | search | call list-options on | (that action) |
| --- | --- | --- | --- | --- | --- |
| `from` | From | — | — | `rowwj0sfmhub` | Send Email |
| `labelIds` | Label | — | — | `rowwj0sfmhub` | Send Email |
| `searchFields.label` | Filter Mail by label | — | — | `rowubk94iqsc` | New Email Received |
| `attachment_size_help` | Attachment Size Limit | — | — | `rowwj0sfmhub` | Send Email |
| `config.label` | Label | — | — | `rowaag4n9cmx` | Modify Email Labels |
| `label` | Filter Mail by label | — | — | `row0c62qpq3t` | New Attachment |
| `searchFields.labelIds` | Label | — | — | `rowndcp2jy8p` | Search_Email_Messages |

"searchable": the field has `enableSearchApi`; send what the user typed, debounced, as `existingFields._searchText` — inside existingFields, next to the dependency values. A new text starts a new list.

Worked example — a picker for `from`:

```js
// Send Email is just the cheapest place this field appears.
const { options } = await user.listOptions('rowwj0sfmhub', { fieldKey: 'from', authId, existingFields: {} })

// options is [{ label, value }] — render label, submit value.
renderSelect(options)
```

## Rendering a form for any action

Only when the end user configures an action themselves. A fixed feature needs one picker from
the field index above, not a form. Every action and trigger below is described by the same
field schema, so one renderer serves all of them: give it an `action_version_id`, it draws the
form and produces `inputData`.

| column in the tables below | render as | behaviour |
| --- | --- | --- |
| type `string`, `number`, `date`, `html`, `markdown` | text input (number/date typed) | free text from your user |
| type `boolean` | yes / no | send `true` / `false` |
| type `dropdown` | single select | options from the `value comes from` column |
| type `multiselect` | multi select | send an array of values |
| type `object` | a card containing its child fields (the keys with a dot prefix) | nest the children under the parent key in `inputData` |
| type `dictionary` | key / value rows | send an object |
| type `aifield` | free text | a description the platform turns into structured input; send a string |
| `value comes from: one of …` | static options | those literal values |
| `value comes from: list-options` | select that fetches on open | await user.listOptions(versionId, { fieldKey, authId, existingFields }); show `label`, send `value` |
| `list-options (searchable)` | the same, with a search box | debounce typing and send it as `existingFields._searchText`; a new text starts a new list |
| `needs first` / `list-options after X` | disabled until X has a value | put X's current value in `existingFields`, nested exactly as `inputData`; clear this field when X changes |
| `only applies when …` | hidden unless the condition holds | leave hidden fields out of `inputData` entirely |
| `required: yes` | validation | block submit while empty and visible |

`fieldKey` for a fetch is always the full dotted path in the table. The result is the same
`inputData` shape as the sample under each action; submit it unchanged.

The complete recipe — the raw schema and where to get it, the eight rules, a framework-free
form engine and a React skin with paging and search — is its own document. Fetch it when you
build the form:

```http
GET https://flow.viasocket.com/documentation/form-renderer.md
```

This app's raw schema: `POST https://flow.sokt.io/func/scriolZue69X` with `{"service_id":"rowo0bqrhj5g"}`.

## Actions

Run any of these with `viasocket.runAction(scriptId, action_version_id, inputData)`.


### Create Email Draft

- `action_version_id`: `rowramm1dluq`
- Save an email draft in Gmail with recipients, subject, plain or HTML message, and optional attachments (file URLs or Google Drive files).
- fetch first: `from`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `to` | string | yes | your user |  |
| `cc` | string | no | your user |  |
| `bcc` | string | no | your user |  |
| `replyTo` | string | no | your user |  |
| `from` | dropdown | no | list-options |  |
| `fromName` | string | no | your user |  |
| `subject` | string | yes | your user |  |
| `messageType` | dropdown | yes | one of "text", "html" |  |
| `messageBody` | string | yes | your user | only when messageType = "text" |
| `htmlBody` | html | yes | your user | only when messageType = "html" |
| `attachments` | string | no | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowramm1dluq', {
  "to": "<to>",
  "cc": "<cc>",
  "bcc": "<bcc>",
  "replyTo": "<replyTo>",
  "from": "<id from list-options>",
  "fromName": "<fromName>",
  "subject": "<subject>",
  "messageType": "text",
  "messageBody": "<messageBody>",
  "htmlBody": "<htmlBody>",
  "attachments": "<attachments>"
})
```

A real sample of what this call returns:

```json
{
  "data": {
    "id": "d-123",
    "message": {
      "id": "m-123",
      "labelIds": [
        "DRAFT"
      ],
      "threadId": "t-123"
    }
  },
  "draftId": "r-123",
  "message": "Draft created",
  "success": true,
  "threadId": "t-123"
}
```

### Get Email Attachment

- `action_version_id`: `rowd1cj5r1q0`
- Retrieve attachments from an email by Message ID and return attachment details (filename, MIME type, size) and accessible URLs.

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `messageId` | string | yes | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowd1cj5r1q0', {
  "messageId": "<messageId>"
})
```

A real sample of what this call returns:

```json
{
  "attachmentCount": 1,
  "attachmentDetails": [
    {
      "url": "https://example.com/file.txt",
      "size": 12345,
      "filename": "file.txt",
      "mimeType": "text/plain",
      "attachmentId": "sampleId"
    }
  ]
}
```

### Get Gmail Message by ID

- `action_version_id`: `rowodx4ucmph`
- Retrieve a single Gmail message by message ID, returning headers, plain and HTML body, attachments, and thread info.

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `message_id` | string | yes | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowodx4ucmph', {
  "message_id": "<message_id>"
})
```

A real sample of what this call returns:

```json
{
  "cc": "",
  "id": "18c7f4d8e2a1b345",
  "to": "customer@example.com",
  "bcc": "",
  "body": {
    "html": "<p>Thanks for reaching out.</p>",
    "plain": "Thanks for reaching out."
  },
  "from": "sender@example.com",
  "subject": "Paperform submission",
  "emailUrl": "https://mail.google.com/mail/u/0/#inbox/18c7f4d8e2a1b345",
  "labelIds": [
    "INBOX",
    "UNREAD"
  ],
  "threadId": "18c7f4d8e2a1b346",
  "historyId": "12345",
  "attachmentCount": 1,
  "latestReplyDate": "2026-09-29T05:07:31.000Z",
  "originalSentDate": "2026-09-28T05:07:31.000Z",
  "attachmentDetails": [
    {
      "size": 12034,
      "partId": "2",
      "filename": "invoice.pdf",
      "mimeType": "application/pdf",
      "attachmentId": "ANGjdJ-example"
    }
  ],
  "numOfMessagesInThread": 2
}
```

### Get Thread Replies

- `action_version_id`: `rowsesarjlu2`
- Retrieve all messages in a thread excluding those sent from the specified email address.

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `thread_id` | string | yes | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowsesarjlu2', {
  "thread_id": "<thread_id>"
})
```

A real sample of what this call returns:

```json
{
  "replies": [
    {
      "date": "2026-07-17T10:07:08Z",
      "from": "user@example.com",
      "messageId": "m2",
      "plainBody": "Thanks"
    }
  ],
  "threadId": "THREAD_1",
  "repliesCount": 1,
  "totalMessages": 2,
  "originalMessage": {
    "date": "2026-07-16T04:12:45Z",
    "from": "noreply@example.com",
    "subject": "Verification",
    "threadId": "THREAD_1",
    "messageId": "m1",
    "plainBody": "Short plain text"
  }
}
```

### List_all_Mails

- `action_version_id`: `rowgko0n0edh`
- Added optional multi-select System Labels filter (Spam/Important/Categories/etc.) mapped to Gmail system label IDs and applied via labelIds param with backward-compatible behavior.

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `max` | number | no | your user |  |
| `pageToken` | string | no | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowgko0n0edh', {
  "max": 0,
  "pageToken": "<pageToken>"
})
```

A real sample of what this call returns:

```json
{
  "id": "abc123",
  "to": "recipient@example.com",
  "from": "example@example.com",
  "subject": "Your Subject Here",
  "labelIds": [
    "INBOX",
    "UNREAD"
  ]
}
```

### Modify Email Labels

- `action_version_id`: `rowaag4n9cmx`
- Add or remove labels on a message or thread; target by thread ID, message ID, or search filters.
- fetch first: `config.label`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `config` | object | no | your user |  |
| `config.operation` | dropdown | yes | one of "add", "remove" |  |
| `config.label` | multiselect | yes | list-options |  |
| `config.useThreadId` | dropdown | yes | one of "use_message", "use_thread", "search_email" |  |
| `config.messageId` | string | yes | your user | only when config.useThreadId = "use_message" |
| `config.threadId` | string | yes | your user | only when config.useThreadId = "use_thread" |
| `config.from` | string | no | your user | only when config.useThreadId = "search_email" |
| `config.to` | string | no | your user | only when config.useThreadId = "search_email" |
| `config.cc` | string | no | your user | only when config.useThreadId = "search_email" |
| `config.bcc` | string | no | your user | only when config.useThreadId = "search_email" |
| `config.subject` | string | no | your user | only when config.useThreadId = "search_email" |
| `config.matchHandling` | dropdown | yes | one of "recent", "all" | only when config.useThreadId = "search_email" |
| `config.maxMatches` | number | yes | your user | applies when config.useThreadId === "search_email" && config.matchHandling === 'all' |

```js
const result = await viasocket.runAction(scriptId, 'rowaag4n9cmx', {
  "config": {
    "operation": "add",
    "label": [
      "<id from list-options>"
    ],
    "useThreadId": "search_email",
    "from": "<from>",
    "to": "<to>",
    "cc": "<cc>",
    "bcc": "<bcc>",
    "subject": "<subject>",
    "matchHandling": "recent",
    "maxMatches": 0
  }
})
```

A real sample of what this call returns:

```json
{
  "results": [
    {
      "status": "success",
      "labelIds": [
        "Label_8310433811936292840",
        "IMPORTANT",
        "SENT",
        "Label_3859301108852197983",
        "INBOX",
        "Label_5015927466667266057"
      ],
      "threadId": "19f4b420bbb37f7d",
      "messageCount": 2
    }
  ],
  "operation": "add",
  "appliedLabels": [
    "Label_3859301108852197983",
    "Label_5015927466667266057",
    "Label_8310433811936292840"
  ],
  "totalLabelsApplied": 3,
  "totalThreadsProcessed": 1
}
```

### Reply To Thread

- `action_version_id`: `rowxvyjgbn1y`
- Reply to an existing email thread — choose recipients (sender/all/specific), send text or HTML, add attachments, and apply labels.
- fetch first: `labelIds`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `threadId` | string | yes | your user |  |
| `replyMode` | dropdown | yes | one of "sender", "all", "specific" |  |
| `to` | string | yes | your user | only when replyMode = "specific" |
| `cc` | string | no | your user | applies when replyMode === 'specific' \|\| replyMode === 'all' |
| `bcc` | string | no | your user | applies when replyMode === 'specific' \|\| replyMode === 'all' |
| `messageType` | dropdown | yes | one of "text", "html" |  |
| `messageBody` | string | yes | your user | only when messageType = "text" |
| `htmlBody` | html | yes | your user | only when messageType = "html" |
| `fromName` | string | no | your user |  |
| `attachments` | string | no | your user |  |
| `labelIds` | multiselect | no | list-options |  |

```js
const result = await viasocket.runAction(scriptId, 'rowxvyjgbn1y', {
  "threadId": "<threadId>",
  "replyMode": "sender",
  "cc": "<cc>",
  "bcc": "<bcc>",
  "messageType": "text",
  "messageBody": "<messageBody>",
  "fromName": "<fromName>",
  "attachments": "<attachments>",
  "labelIds": [
    "<id from list-options>"
  ]
})
```

A real sample of what this call returns:

```json
{
  "id": "msg_1",
  "labelIds": [
    "SENT_LABEL"
  ],
  "threadId": "thr_1"
}
```

### Search_Email_Messages

- `action_version_id`: `rowndcp2jy8p`
- Search emails (manual or AI), resolve custom labels by name or ID, and return message details, attachments, and a next-page token.
- fetch first: `searchFields.labelIds`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `search_mode` | dropdown | yes | one of "manual", "ai" |  |
| `ai_query` | aifield | yes | your user | only when search_mode = "ai" |
| `includeReplies` | boolean | no | one of true, false |  |
| `query` | multiselect | yes | one of "senderEmail", "to", "cc", "bcc", "subject", "label", "domain" | only when search_mode = "manual" |
| `searchFields` | object | no | your user | applies when search_mode === 'manual' && (query.includes('senderEmail') \|\| query.includes('subject') \|\| query.includes('label') \|\| query.includes('to') \|\| query.includes('cc') \|\| query.includes('bcc') \|\| query.includes('domain')) |
| `searchFields.senderEmail` | string | yes | your user | applies when query.includes('senderEmail') |
| `searchFields.to` | string | yes | your user | applies when query.includes('to') |
| `searchFields.cc` | string | yes | your user | applies when query.includes('cc') |
| `searchFields.bcc` | string | yes | your user | applies when query.includes('bcc') |
| `searchFields.subject` | string | yes | your user | applies when query.includes('subject') |
| `searchFields.labelIds` | multiselect | yes | list-options | applies when query.includes('label') |
| `searchFields.domain` | string | yes | your user | applies when query.includes('domain') |
| `searchFields.operator` | dropdown | no | one of "AND", "OR" | applies when query && query.length > 1 |
| `pagination` | object | no | your user |  |
| `pagination.maxResults` | number | no | your user |  |
| `pagination.pageToken` | string | no | your user |  |
| `select_response_fields` | multiselect | no | one of "id", "labelIds", "threadId", "numOfMessagesInThread", "to", "cc", "bcc", "from", "subject", "body", "attachmentCount", "attachmentDetails", "historyId", "emailUrl", "latestReplyDate", "originalSentDate" |  |

```js
const result = await viasocket.runAction(scriptId, 'rowndcp2jy8p', {
  "search_mode": "manual",
  "includeReplies": false,
  "query": [
    "senderEmail"
  ],
  "searchFields": {
    "senderEmail": "<senderEmail>",
    "to": "<to>",
    "cc": "<cc>",
    "bcc": "<bcc>",
    "subject": "<subject>",
    "labelIds": [
      "<id from list-options>"
    ],
    "domain": "<domain>",
    "operator": "AND"
  },
  "pagination": {
    "maxResults": 0,
    "pageToken": "<pageToken>"
  },
  "select_response_fields": [
    "id"
  ]
})
```

A real sample of what this call returns:

```json
{
  "emails": [
    {
      "cc": "",
      "id": "msg_1",
      "to": "user@example.com",
      "bcc": "",
      "body": {
        "html": "<p>Short body</p>",
        "plain": "Short body"
      },
      "from": "sender@example.com",
      "subject": "Test",
      "emailUrl": "https://mail.google.com/mail/u/0/#inbox/msg_1",
      "labelIds": [
        "INBOX",
        "Label_123"
      ],
      "threadId": "thread_1",
      "historyId": "12345",
      "attachmentCount": 0,
      "latestReplyDate": "2026-05-22T00:00:00Z",
      "originalSentDate": "2026-05-20T00:00:00Z",
      "attachmentDetails": "No attachment found in this mail",
      "numOfMessagesInThread": 0
    }
  ],
  "totalResults": 1
}
```

### Send Email

- `action_version_id`: `rowwj0sfmhub`
- send a new email message.
- fetch first: `from`, `attachment_size_help`, `labelIds`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `to` | string | yes | your user |  |
| `cc` | string | no | your user |  |
| `bcc` | string | no | your user |  |
| `subject` | string | yes | your user |  |
| `from` | dropdown | no | list-options |  |
| `fromName` | string | no | your user |  |
| `replyTo` | string | no | your user |  |
| `messageBody` | html | yes | your user |  |
| `attachments` | string | no | your user |  |
| `labelIds` | multiselect | no | list-options |  |

```js
const result = await viasocket.runAction(scriptId, 'rowwj0sfmhub', {
  "to": "<to>",
  "cc": "<cc>",
  "bcc": "<bcc>",
  "subject": "<subject>",
  "from": "<id from list-options>",
  "fromName": "<fromName>",
  "replyTo": "<replyTo>",
  "messageBody": "<messageBody>",
  "attachments": "<attachments>",
  "labelIds": [
    "<id from list-options>"
  ]
})
```

A real sample of what this call returns:

```json
{
  "id": "m_1",
  "labelIds": [
    "SENT"
  ],
  "threadId": "t_1"
}
```

## Triggers

Subscribing to an event means telling us **what to do when it fires**. That is a `code` handler:
a short script we run on our servers per event, with the event in `context.req.body`. Your server
is not in the path; the handler does the work itself. Decide from what the product wants:

| When the event fires, the product wants… | Handler |
| --- | --- |
| something to happen in another app the user connected (“new mail → post to Slack”) | **Template A**: run that app’s action |
| its own backend to know (“new mail → save it in our database”) | **Template B**: call your own API, with your own auth header baked in |
| both | one handler doing A, then B |
| raw events pushed to a public, unauthenticated endpoint of yours | `webhook: url` instead of `code` — the edge case; confirm with the developer before choosing it |

**Template A — run an action in another app.** The other app has its own document: fetch it for the
action’s `action_version_id` and fields, and enable that app once for this user at setup (its Step 1)
to get its `script_id`. Values the action needs picked (a channel, a sheet) are fetched with
`list-options` at setup too. Bake all of them into the string. The run URL takes no token: the
`script_id` is the credential, so the handler needs no secret. Map event keys from the sample
under each trigger below.

```js
// A string, not a function: it is sent to viaSocket and executed there.
// ${…} below are YOUR variables, baked in per user at subscribe time.
const handler = `
  const event = context.req.body
  const response = await fetch("https://flow.sokt.io/func/${otherAppScriptId}", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action_version_id: "${otherAppActionVersionId}", // from the other app’s document
      inputData: {
        // that action’s fields, mapped from this event (keys as in the sample below)
        channel_id: "${channelIdPickedAtSetup}",
        text: "New mail from " + event.from + ": " + event.subject
      }
    })
  })
  const result = await response.json()
  // Envelope { success, data }, or the action's own body (which may carry its own success key).
  if ("data" in result ? !result.success : result.success === false) throw new Error(result.message || "action failed")
  return "data" in result ? result.data : result
`
```

**Template B — tell your own product.** Call your API from the handler with your own auth header
baked in. Your endpoint stays protected; nothing has to be public.

```js
const handler = `
  const event = context.req.body
  await axios.post("https://your-app.com/api/viasocket-events", { event, user_id: "${uniqueIdentifier}" }, {
    headers: { authorization: "Bearer ${apiKeyForThisUser}" }
  })
  return { delivered: true }
`
```

Then subscribe with it. Each trigger below shows this call with its own `inputData`:

```js
await user.subscribe('<trigger_version_id>', { authId, inputData, code: handler, meta: { user_id: uniqueIdentifier } })
```

The edge case, only when the developer wants raw events on a public endpoint of theirs: pass
`webhook: 'https://your-app.com/webhooks/viasocket'` instead of `code`. We POST every event there
with `meta` attached, unauthenticated, so use `meta` to identify the user and treat the body as untrusted.

**Record every subscription you create.** The response gives you only the `script_id`, and
`listFlows` later returns id, title and status — not the `inputData` or the handler. So the only
way to know later *what* a user is subscribed to, with which settings and doing what, is your own
record, keyed by your user and the trigger. Save it in the same transaction as the subscribe call:

```json
{
  "unique_identifier": "<your user id>",
  "service_id": "rowo0bqrhj5g",
  "trigger_version_id": "<the trigger subscribed to>",
  "script_id": "<from the subscribe response>",
  "auth_id": "<the connection used>",
  "inputData": { "...": "exactly what was sent" },
  "delivery": { "code": "<the handler string>" },
  "created_at": "<timestamp>"
}
```

Check this record before subscribing again (same user, same trigger, same `inputData` means it
already exists), use its `script_id` to pause, resume, update or remove the subscription, and show
it to the user as “what is connected”. For a `webhook` subscription store `{ "webhook": "<url>" }`
as the delivery instead.

**How often we check.** Some triggers are polled rather than pushed. For those, `inputData` may
carry `scheduledTime`, the minutes between checks, as a string: `"5"` or `"15"`. Leave it out for
the default. It sits beside the event’s own fields:

```json
{ "channel_id": ["<id from list-options>"], "scheduledTime": "5" }
```


### New Attachment

- `action_version_id`: `row0c62qpq3t`
- Retrieve recent Gmail messages (optionally filtered by label) that contain attachments, upload those attachments to Viasocket, and return message and attachment details.
- fetch first: `label`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `label` | multiselect | yes | list-options |  |

```js
// Subscribe once per user. Save the record described under Triggers: scriptId, inputData, handler.
const { scriptId: subscriptionId } = await user.subscribe('row0c62qpq3t', {
  authId,
  inputData: {
    "label": [
      "<id from list-options>"
    ]
  },
  code: handler, // what to do when it fires — a handler from the templates above
  meta: { user_id: uniqueIdentifier }
})
```

A real sample of the event, as your handler receives it in `context.req.body`:

```json
{
  "date": "Sample date",
  "rawId": "sample-id",
  "bodyPlain": "Sample body content",
  "rawSizeEstimate": 123,
  "rawPayloadHeaders": {
    "To": "Sample Receiver",
    "From": "Sample Sender",
    "Subject": "Sample subject"
  }
}
```

### New Email Received

- `action_version_id`: `rowubk94iqsc`
- Runs when new email arrives
- fetch first: `searchFields.label`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `query` | multiselect | no | one of "subject", "senderEmail", "label" |  |
| `searchFields` | object | no | your user | applies when query.includes('senderEmail') \|\| query.includes('subject') \|\| query.includes('cc') \|\| query.includes('label') |
| `searchFields.senderEmail` | string[] | yes | your user | applies when query.includes('senderEmail') |
| `searchFields.subject` | string[] | yes | your user | applies when query.includes('subject') |
| `searchFields.label` | multiselect | yes | list-options | applies when query.includes('label') |
| `thread` | dropdown | yes | one of "first_email_only", "include_replies" |  |

```js
// Subscribe once per user. Save the record described under Triggers: scriptId, inputData, handler.
const { scriptId: subscriptionId } = await user.subscribe('rowubk94iqsc', {
  authId,
  inputData: {
    "query": [
      "subject"
    ],
    "searchFields": {
      "senderEmail": [
        "<senderEmail>"
      ],
      "subject": [
        "<subject>"
      ],
      "label": [
        "<id from list-options>"
      ]
    },
    "thread": "first_email_only"
  },
  code: handler, // what to do when it fires — a handler from the templates above
  meta: { user_id: uniqueIdentifier }
})
```

A real sample of the event, as your handler receives it in `context.req.body`:

```json
{
  "To": {
    "name": null,
    "email": "recipient@example.com"
  },
  "From": {
    "name": "Sender Name",
    "email": "sender@example.com"
  },
  "date": "2026-08-29T02:09:18-04:00",
  "rawId": "1a04c23716ee14f9",
  "subject": "Sample subject",
  "threadId": "1a04c23716ee14f9",
  "bodyPlain": "Short preview text.",
  "messageUrl": "https://mail.google.com/mail/u/0/#inbox/1a04c23716ee14f9",
  "rawLabelIds": [
    "UNREAD",
    "INBOX"
  ],
  "attachmentCount": 1,
  "rawInternalDate": 1787983758000,
  "rawSizeEstimate": 409434,
  "attachmentDetails": [
    {
      "url": "https://storage.example.com/att/1",
      "size": 12345,
      "filename": "doc.pdf",
      "mimeType": "application/pdf"
    }
  ],
  "rawPayloadHeaders": {
    "Date": "Sat, 29 Aug 2026 02:09:18 -0400",
    "From": "Sender <sender@example.com>",
    "Subject": "Sample subject"
  },
  "rawPayloadMimeType": "multipart/mixed"
}
```

### New Email Sent

- `action_version_id`: `rowpw1i7ci9h`
- Runs the workflow automatically whenever a new email appears in the Sent mailbox or in a specified label.
- fetch first: `searchFields.label`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `query` | multiselect | no | one of "subject", "recipientEmail", "label" |  |
| `searchFields` | object | no | your user | applies when Array.isArray(query) && (query.includes('recipientEmail') \|\| query.includes('subject') \|\| query.includes('label')) |
| `searchFields.recipientEmail` | string[] | yes | your user | applies when Array.isArray(query) && query.includes('recipientEmail') |
| `searchFields.subject` | string[] | yes | your user | applies when Array.isArray(query) && query.includes('subject') |
| `searchFields.label` | multiselect | yes | list-options | applies when Array.isArray(query) && query.includes('label') |
| `thread` | dropdown | yes | one of "include_replies", "first_email_only" |  |

```js
// Subscribe once per user. Save the record described under Triggers: scriptId, inputData, handler.
const { scriptId: subscriptionId } = await user.subscribe('rowpw1i7ci9h', {
  authId,
  inputData: {
    "query": [
      "subject"
    ],
    "searchFields": {
      "recipientEmail": [
        "<recipientEmail>"
      ],
      "subject": [
        "<subject>"
      ],
      "label": [
        "<id from list-options>"
      ]
    },
    "thread": "include_replies"
  },
  code: handler, // what to do when it fires — a handler from the templates above
  meta: { user_id: uniqueIdentifier }
})
```

A real sample of the event, as your handler receives it in `context.req.body`:

```json
{
  "date": "2026-09-01T00:00:00Z",
  "rawId": "msg-1",
  "rawSizeEstimate": 123,
  "rawPayloadHeaders": {
    "To": "to@example.com",
    "From": "from@example.com",
    "Subject": "Hi"
  }
}
```

## Managing what a user already has

All four are scoped to the `unique_identifier` in the token, so they answer for one end user.

| call | what it is for |
| --- | --- |
| `await user.listFlows()` | Every flow this user has. Match `serviceId` to find an app they already enabled, and to recover a `scriptId`. |
| `await user.disableFlow(scriptId)` | Disable an enabled app, or end a trigger subscription. `user.enableFlow(scriptId)` re-enables. |
| `await user.listConnections()` | Every app this user has connected. |
| `await user.revokeConnection(authId)` | Disconnect an app. Disable its flows first. |

The flows list, as the package returns it:

```json
[
  {
    "id": "scriRx0PKDEG",
    "title": "rowqm5xi2",
    "status": "active",
    "webhook": "https://flow.sokt.io/func/scriRx0PKDEG",
    "authId": "auth2c38gFVg_rowqm5xi2",
    "serviceId": "rowqm5xi2"
  }
]
```

`id` is the `scriptId`. The list carries no `inputData` and no handler, so a subscription is not
identifiable from it alone: match `id` against the subscription records you saved (Triggers section).

## When it goes wrong

| symptom | cause |
| --- | --- |
| 401 / invalid token | Signed with the wrong secret, or the payload is missing `org_id` / `project_id` / `unique_identifier`. |
| Empty option list | `existingFields` is missing something this field depends on, or the `auth_id` belongs to a different `unique_identifier`. |
| Empty option list on a nested field | `fieldKey` was the leaf instead of the full path, or `existingFields` was flattened to dotted keys instead of nested. Both match nothing, and neither errors. |
| A field is ignored, or the record is created empty | An option’s `value` was altered before being used as a key (`name` sent for `name@longtext`), or a key was typed from a label. Keys are each option’s `value`, verbatim. |
| Empty option list, key looks right | Its casing is from another action of this app (`spreadsheet_id` vs `spreadsheet_Id`), or the request said `blockKey` instead of `fieldKey`. Compare with this action’s table, character for character. |
| `ViaSocketError` thrown | The API refused the call. Read `error.status` and `error.body.message` — the row above that matches is the cause. |
| `listOptions` throws status 400 `Auth data not found` | The connection cannot be read: revoked, or the `auth_id` belongs to another `unique_identifier`. Reconnect the app. |
| App rejects the action | An id was hardcoded instead of fetched, or two mutually exclusive keys were both sent — see the "only applies when" column. |
| Handler never runs | The subscription was created against a different `auth_id`, or `inputData` did not match the event (wrong label, wrong sheet). |
| Handler runs, the action inside it fails | The `script_id` baked into the handler belongs to another user, or that app was never enabled for this user; or the `inputData` keys do not match the other app’s document. Read the response `message`. |
| Someone asks for a webhook URL | Nobody needs one for “when X, do Y”: the handler does Y itself. A webhook is only for pushing raw events to a public endpoint the product chose to expose. |
| The same event fires twice | Subscribed twice for one user. Check the saved subscription record before subscribing; remove the duplicate with its `script_id`. |
| Connection appears lost | A different `unique_identifier` was used for the same end user. |
| Two script_ids for one app | `user.enable` ran without checking `user.findEnabled` first. |
