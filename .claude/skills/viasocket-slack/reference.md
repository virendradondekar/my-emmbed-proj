---
name: viasocket-apps
description: >-
  Integrate Slack into this product through the viaSocket Apps API: render a connect
  button, capture the user's connection, populate pickers with their real data, run
  Slack actions from the backend, and subscribe to Slack events. Use whenever the
  task involves connecting a third-party app for an end user, reading the choices a field
  accepts, running an action in that app, or receiving its events.
---

# Slack via the viaSocket Apps API

> Source: https://flow.viasocket.com/documentation/rowbu58rc.md?format=sdk. Public, no sign-in. Fetch it again for the
> latest version of this file; it is generated from the live catalog.

viaSocket owns the integration with the app. Your code never talks to the app, never holds
its credentials and never refreshes its tokens — you make the five calls below and we do
that part. Your user authorises through the app’s own consent screen.

What that buys you, concretely:

- **Credentials you never see.** Each user’s Slack tokens live encrypted in viaSocket’s vault and are
  refreshed there; a leak of your database leaks no third-party access.
- **One contract for Slack and 2,300 other apps.** The same five calls, the same `{ label, value }` options,
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

1. A **connect button** in your UI that opens Slack's consent screen and gives you an `auth_id`.
2. **Pickers** in your UI filled with the user's real Slack data, one call per field.
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
VIASOCKET_SERVICE_ID=rowbu58rc   # Slack
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

The only browser-side piece. Use Slack's own icon so the button is recognisable.

```html
<button id="connect-app" class="your-button">
  <img src="https://stuff.thingsofbrand.com/slack.com/images/img668216333e_slack.jpg" alt="" width="20" height="20" />
  Connect Slack
</button>

<script type="module">
  import { connect } from 'viasocket-apps/browser'

  document.getElementById("connect-app").onclick = async () => {
    // Your backend signs this for the signed-in user: await user.token()
    const embedToken = await fetch("/api/viasocket/token").then((r) => r.text())
    try {
      const { authId } = await connect({ embedToken, serviceId: "rowbu58rc" })
      // authId is what every later call takes. Hand it to your backend, which enables
      // the app (only if you need actions) and stores the scriptId it gets back.
      await fetch("/api/viasocket/connected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: "rowbu58rc", authId })
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
let scriptId = await user.findEnabled('rowbu58rc')
if (!scriptId) scriptId = (await user.enable('rowbu58rc', authId)).scriptId
// store scriptId against (uniqueIdentifier, "rowbu58rc")
```

## Slack

- `service_id`: `rowbu58rc`
- icon: https://stuff.thingsofbrand.com/slack.com/images/img668216333e_slack.jpg
- auth: Auth2.0
- 25 actions, 6 triggers

## How to render a picker for any field

This is the part that is not obvious. To show the user a dropdown of Slack values —
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
| `channel_id` | Channel | — | — | `rowngjjx9rlo` | Send Block/buttons/Intractive message using AI |
| `channel` | Channel | — | — | `roww420xroem` | Set Channel Topic |
| `canvas_id` | Canvas | — | — | `rowm4pui89qf` | Lookup Canvas Sections |
| `userId` | User | — | — | `rowa5mg9fywy` | Send Direct Message |
| `channel_ids` | Channels | — | — | `row8489a0yme` | New member join/leave or updated in channel |
| `destination.channel_id` | Channels | — | — | `rowj2u3wc8h5` | Send Message |
| `destination.tagged_users` | Also notify | — | — | `rowj2u3wc8h5` | Send Message |
| `destination.thread_channel_id` | On | — | — | `rowj2u3wc8h5` | Send Message |
| `destination.userId` | Users | — | — | `rowj2u3wc8h5` | Send Message |
| `tagged_users` | People to notify | — | — | `row38386b9d9` | Send Message with Block kit |
| `userid` | User | — | — | `rowcqmt43qtk` | Add Users to Channel |
| `parent_message_ts` | Message | `channel` | — | `row26tqmrwom` | Get Thread Replies |
| `destination.thread_ts` | Thread | `destination.thread_channel_id` | — | `rowj2u3wc8h5` | Send Message |
| `section_id` | Section | `canvas_id` | — | `rowrvz8plmz6` | Update Canvas |
| `thread_ts` | Existing Message                             | `channel` | — | `rowk9tjo65dx` | Send Message as Thread |
| `message_select` | Select Message | `time_range`, `channel_id` | — | `rowgxfh9m8jg` | Edit Channel Message |

"searchable": the field has `enableSearchApi`; send what the user typed, debounced, as `existingFields._searchText` — inside existingFields, next to the dependency values. A new text starts a new list.

Worked example — a picker for `channel_id`:

```js
// Send Block/buttons/Intractive message using AI is just the cheapest place this field appears.
const { options } = await user.listOptions('rowngjjx9rlo', { fieldKey: 'channel_id', authId, existingFields: {} })

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

This app's raw schema: `POST https://flow.sokt.io/func/scriolZue69X` with `{"service_id":"rowbu58rc"}`.

## Actions

Run any of these with `viasocket.runAction(scriptId, action_version_id, inputData)`.


### Add Users to Channel

- `action_version_id`: `rowcqmt43qtk`
- Invite users to a channel
- fetch first: `channel_id`, `userid`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel_id` | dropdown | yes | list-options |  |
| `userid` | multiselect | yes | list-options |  |

```js
const result = await viasocket.runAction(scriptId, 'rowcqmt43qtk', {
  "channel_id": "<id from list-options>",
  "userid": [
    "<id from list-options>"
  ]
})
```

A real sample of what this call returns:

```json
{
  "ok": true,
  "channel": {
    "id": "C12345",
    "name": "project-"
  }
}
```

### Chat_update slack block or message using messageTs

- `action_version_id`: `row5je4cstrm`
- Update your open or any other chat message using messageTs
- fetch first: `channel_id`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel_id` | dropdown | yes | list-options |  |
| `message_ts` | string | yes | your user |  |
| `message_text` | string | no | your user |  |
| `message_block` | string | no | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'row5je4cstrm', {
  "channel_id": "<id from list-options>",
  "message_ts": "<message_ts>",
  "message_text": "<message_text>",
  "message_block": "<message_block>"
})
```

A real sample of what this call returns:

```json
{
  "success": true
}
```

### Create Canvas

- `action_version_id`: `rowg40txrx09`
- Create a new Slack canvas.
- fetch first: `channel_id`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `title` | string | yes | your user |  |
| `channel_id` | dropdown | no | list-options |  |
| `markdown_content` | markdown | no | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowg40txrx09', {
  "title": "<title>",
  "channel_id": "<id from list-options>",
  "markdown_content": "<markdown_content>"
})
```

### Create Channel

- `action_version_id`: `rowosh9qot0o`
- Create a new channel

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `name` | string | yes | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowosh9qot0o', {
  "name": "<name>"
})
```

A real sample of what this call returns:

```json
{
  "ok": true,
  "channel": {
    "id": "C08K1",
    "name": "channel",
    "creator": "U08J1",
    "is_channel": true,
    "is_private": false
  }
}
```

### Create Private Channel

- `action_version_id`: `rowbis4p1pcm`
- Create a new private channel

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel_name` | string | yes | your user |  |
| `is_private` | boolean | yes | one of true, false |  |

```js
const result = await viasocket.runAction(scriptId, 'rowbis4p1pcm', {
  "channel_name": "<channel_name>",
  "is_private": true
})
```

### Edit Channel Message

- `action_version_id`: `rowgxfh9m8jg`
- Edit a channel message
- fetch first: `channel_id`, `message_select`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel_id` | dropdown | yes | list-options |  |
| `time_range` | dropdown | yes | one of "5", "15", "30", "60", "1440" |  |
| `message_select` | dropdown | yes | list-options after time_range, channel_id | applies when channel_id && time_range |
| `text` | markdown | yes | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowgxfh9m8jg', {
  "channel_id": "<id from list-options>",
  "time_range": "5",
  "message_select": "<id from list-options>",
  "text": "<text>"
})
```

A real sample of what this call returns:

```json
{
  "ok": true,
  "ts": "1234567890.123456",
  "channel": "C12345",
  "message": {
    "type": "message",
    "user": "U12345",
    "client_msg_id": "abcde-12345"
  }
}
```

### Find Public channel

- `action_version_id`: `rowl5126q33g`
- Find public channel in slack using either the channel's ID or name

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `search_type` | dropdown | yes | one of "name", "id" |  |
| `query` | string | yes | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowl5126q33g', {
  "search_type": "name",
  "query": "<query>"
})
```

A real sample of what this call returns:

```json
{
  "success": true,
  "channels": [
    {
      "id": "C01",
      "name": "general",
      "created": 1609459200,
      "purpose": "This channel is used for announcements.",
      "is_archived": false,
      "num_members": 50
    }
  ]
}
```

### Get all Channel Members

- `action_version_id`: `rowdhdl1dgvs`
- List all the member in a channel.
- fetch first: `channel_id`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel_id` | dropdown | yes | list-options |  |
| `filter_by` | dropdown | no | one of "all", "active", "deleted", "admin", "owner" |  |
| `fields_to_return` | multiselect | yes | one of "ALL", "id", "team_id", "name", "real_name", "is_admin", "is_owner", "is_bot", "deleted", "updated", "profile", "profile.real_name_normalized", "profile.display_name", "profile.display_name_normalized", "profile.email", "profile.phone", "profile.skype", "profile.title", "profile.status_text", "profile.status_emoji", "profile.image_192", "profile.image_512", "profile.tz", "profile.tz_label", "profile.tz_offset" |  |

```js
const result = await viasocket.runAction(scriptId, 'rowdhdl1dgvs', {
  "channel_id": "<id from list-options>",
  "filter_by": "all",
  "fields_to_return": [
    "ALL"
  ]
})
```

A real sample of what this call returns:

```json
{
  "members": [
    {
      "id": "U123",
      "name": "user1",
      "is_bot": false,
      "profile": {
        "email": "user1@example.com",
        "real_name": "User One"
      }
    }
  ],
  "total_members": 1
}
```

### Get Messages from Slack

- `action_version_id`: `row5l67t3gw2`
- Retrieve messages from a Slack thread or channel within a selected time range.
- fetch first: `channel_id`, `parent_message_ts`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel_id` | dropdown | yes | list-options |  |
| `messageof` | boolean | no | one of true, false |  |
| `parent_message_ts` | dropdown | no | list-options after channel_id | only when messageof = true |
| `time_range` | aifield | no | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'row5l67t3gw2', {
  "channel_id": "channel_id[\"C0ATUBJSFFG\"]",
  "messageof": true,
  "parent_message_ts": "<id from list-options>",
  "time_range": "<time_range>"
})
```

A real sample of what this call returns:

```json
{
  "channel": "C0123456789",
  "messages": [
    {
      "ts": "1770997901.378539",
      "text": "Brief message",
      "user": "U0123456789"
    }
  ],
  "time_range": "Last 1440 minutes"
}
```

### Get Thread Replies

- `action_version_id`: `row26tqmrwom`
- List replies in a Slack thread
- fetch first: `channel`, `parent_message_ts`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel` | dropdown | yes | list-options |  |
| `parent_message_ts` | dropdown | yes | list-options after channel |  |

```js
const result = await viasocket.runAction(scriptId, 'row26tqmrwom', {
  "channel": "<id from list-options>",
  "parent_message_ts": "<id from list-options>"
})
```

A real sample of what this call returns:

```json
{
  "ts": "1772717513.983989",
  "text": "Short status update",
  "type": "message",
  "user": "U0AG7GQ02E8",
  "icons": {
    "image_48": "https://example.com/icon48.png"
  },
  "thread_ts": "1772717513.983989",
  "reply_count": 1,
  "reply_users": [
    "U0AG7GQ02E8"
  ]
}
```

### Get User Complete Profile Details by ID

- `action_version_id`: `rowvjyznfs5p`
- Get a user's full profile, including custom fields, by ID.

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `user_id` | string | yes | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowvjyznfs5p', {
  "user_id": "<user_id>"
})
```

A real sample of what this call returns:

```json
{
  "email": "j@x.com",
  "phone": "1234567890",
  "title": "Eng",
  "fields": {
    "Xf1": {
      "alt": "",
      "label": "Skype",
      "value": "jdoe"
    }
  },
  "image_72": "https://example.com/72.png",
  "real_name": "John Doe",
  "status_text": "Away",
  "display_name": "jdoe",
  "is_custom_image": false
}
```

### Get User Information

- `action_version_id`: `rowrubgppa5r`
- Look up a Slack user by email or name and return selected profile fields.

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `search_by` | dropdown | yes | one of "email_search", "name" |  |
| `email` | string | yes | your user | only when search_by = "email_search" |
| `name` | string | yes | your user | only when search_by = "name" |
| `response_fields` | multiselect | no | one of "id", "name", "real_name", "team_id", "phone", "is_bot", "is_app_user", "is_email_confirmed", "tz", "tz_label", "tz_offset", "is_admin", "is_owner", "is_primary_owner", "is_restricted", "is_ultra_restricted", "has_2fa", "profile_email", "title", "skype", "first_name", "last_name", "display_name", "status_text", "status_emoji", "image_512", "details" |  |

```js
const result = await viasocket.runAction(scriptId, 'rowrubgppa5r', {
  "search_by": "email_search",
  "email": "<email>",
  "name": "<name>",
  "response_fields": [
    "id"
  ]
})
```

A real sample of what this call returns:

```json
{
  "message": "User not found"
}
```

### List all Private Channels

- `action_version_id`: `rowf5y4wv05t`
- To fetch all private channels, you must first manually invite the bot to that channel in Slack. Example: Open the private channel → type /invite @your-bot-name → then retry the action.

_No input: send `inputData: {}`._

```js
const result = await viasocket.runAction(scriptId, 'rowf5y4wv05t', {})
```

### List all Public Channels

- `action_version_id`: `roww5rj0i9d7`
- Show all public channels

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `exclude_archived_value` | boolean | no | one of true, false |  |
| `limit` | number | no | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'roww5rj0i9d7', {
  "exclude_archived_value": true,
  "limit": 0
})
```

### Lookup Canvas Sections

- `action_version_id`: `rowm4pui89qf`
- Find sections within a canvas
- fetch first: `canvas_id`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `canvas_id` | dropdown | yes | list-options |  |
| `section_types` | multiselect | no | one of "any_header", "h1", "h2", "h3" |  |
| `contains_text` | string | no | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowm4pui89qf', {
  "canvas_id": "<id from list-options>",
  "section_types": [
    "any_header"
  ],
  "contains_text": "<contains_text>"
})
```

### Message Private Channel

- `action_version_id`: `rowvod9vrulq`
- Message a private channel
- fetch first: `channel`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel` | dropdown | yes | list-options |  |
| `message` | string | yes | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowvod9vrulq', {
  "channel": "<id from list-options>",
  "message": "<message>"
})
```

A real sample of what this call returns:

```json
{
  "ok": true,
  "ts": "1234567890.123456",
  "channel": "C123",
  "message": {
    "ts": "1234567890.123456",
    "text": "Hello",
    "type": "message",
    "blocks": [
      {
        "type": "rich_text",
        "elements": [
          {
            "type": "rich_text_section",
            "elements": [
              {
                "type": "text"
              }
            ]
          }
        ]
      }
    ],
    "subtype": "bot_message"
  }
}
```

### Send Block/buttons/Intractive message using AI

- `action_version_id`: `rowngjjx9rlo`
- Send Block, buttons, or slack form using AI
- fetch first: `channel_id`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel_id` | dropdown | yes | list-options |  |
| `content` | string | yes | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'rowngjjx9rlo', {
  "channel_id": "<id from list-options>",
  "content": "<content>"
})
```

### Send Direct Message

- `action_version_id`: `rowa5mg9fywy`
- Send a Slack DM to a user
- fetch first: `userId`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `userId` | dropdown | yes | list-options |  |
| `content` | string | yes | your user |  |
| `isScheduledMessage` | dropdown | yes | one of "no", "yes" |  |
| `post_at` | string | yes | your user | only when isScheduledMessage = "yes" |
| `bot_details` | object | no | your user |  |
| `bot_details.bot_name` | string | yes | your user |  |
| `bot_details.customIcon` | boolean | yes | one of true, false |  |
| `bot_details.icon_type` | dropdown | yes | one of "emoji", "url" | applies when bot_details.customIcon |
| `bot_details.emoji` | string | yes | your user | only when bot_details.icon_type = "emoji" |
| `bot_details.url` | string | yes | your user | only when bot_details.icon_type = "url" |

```js
const result = await viasocket.runAction(scriptId, 'rowa5mg9fywy', {
  "userId": "<id from list-options>",
  "content": "<content>",
  "isScheduledMessage": "no",
  "bot_details": {
    "bot_name": "viaSocket",
    "customIcon": false,
    "icon_type": "emoji",
    "emoji": "<emoji>",
    "url": "<url>"
  }
})
```

A real sample of what this call returns:

```json
{
  "ok": true,
  "ts": "1750951006.708069",
  "channel": "D0ABC1234",
  "message": {
    "text": "Hello!",
    "subtype": "bot_message"
  }
}
```

### Send Interactive Message

- `action_version_id`: `rowbw84j4cdt`
- Send a message with buttons or a form to collect approvals or responses.
- fetch first: `channel_id`, `userId`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `messageto` | dropdown | yes | one of "user", "channel" |  |
| `channel_id` | dropdown | yes | list-options | only when messageto = "channel" |
| `userId` | dropdown | yes | list-options | only when messageto = "user" |
| `content` | markdown | yes | your user |  |
| `operation` | dropdown | yes | one of "Approval", "Form" |  |
| `blockit-kit-ai` | aifield | yes | your user | only when operation = "Form" |
| `notSubmitForm` | boolean | no | one of true, false | only when operation = "Form" |
| `buttons` | dictionary | yes | your user | only when operation = "Approval" |
| `buttonText` | string | no | your user | only when operation = "Form" |
| `bot_details` | object | no | your user |  |
| `bot_details.bot_name` | string | yes | your user |  |
| `bot_details.customIcon` | boolean | yes | one of true, false |  |
| `bot_details.icon_type` | dropdown | yes | one of "emoji", "url" | applies when bot_details.customIcon |
| `bot_details.emoji` | string | yes | your user | only when bot_details.icon_type = "emoji" |
| `bot_details.url` | string | yes | your user | only when bot_details.icon_type = "url" |
| `isScheduledMessage` | dropdown | no | one of "no", "yes" |  |
| `post_at` | string | yes | your user | only when isScheduledMessage = "yes" |

```js
const result = await viasocket.runAction(scriptId, 'rowbw84j4cdt', {
  "messageto": "user",
  "userId": "<id from list-options>",
  "content": "<content>",
  "operation": "Approval",
  "buttons": {
    "key": "value"
  },
  "bot_details": {
    "bot_name": "viaSocket",
    "customIcon": false,
    "icon_type": "emoji",
    "emoji": "<emoji>",
    "url": "<url>"
  },
  "isScheduledMessage": "no"
})
```

A real sample of what this call returns:

```json
{
  "type": "view_submission",
  "view": {
    "type": "modal",
    "state": {
      "values": {
        "date_block": {
          "date_input": {
            "type": "datepicker",
            "selected_date": "2026-08-27"
          }
        },
        "name_block": {
          "name_input": {
            "type": "plain_text_input",
            "value": "John"
          }
        }
      }
    },
    "title": {
      "text": "Submit"
    },
    "private_metadata": "{\"event_type\":\"submit-form\"}"
  },
  "api_app_id": "A0X",
  "is_enterprise_install": false
}
```

### Send Message

- `action_version_id`: `rowj2u3wc8h5`
- Send or schedule a message to a channel, user, or thread; supports channel names and IDs.
- fetch first: `destination.thread_channel_id`, `destination.channel_id`, `destination.userId`, `destination.thread_ts`, `destination.tagged_users`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `destination` | object | no | your user |  |
| `destination.messageto` | dropdown | yes | one of "channel", "user", "thread" |  |
| `destination.thread_channel_id` | dropdown | yes | list-options | only when destination.messageto = "thread" |
| `destination.channel_id` | multiselect | yes | list-options | only when destination.messageto = "channel" |
| `destination.userId` | multiselect | yes | list-options | only when destination.messageto = "user" |
| `destination.thread_ts` | dropdown | yes | list-options after destination.thread_channel_id | applies when destination.thread_channel_id |
| `destination.tagged_users` | multiselect | no | list-options | applies when destination.thread_ts \|\| destination.["channel_id"].[0] |
| `destination.reply_broadcast` | boolean | no | one of true, false | applies when destination.thread_ts |
| `markdown_content` | markdown | yes | your user | applies when destination.channel_id \|\| destination.thread_ts \|\| destination.userId |
| `buttons` | dictionary | no | your user |  |
| `schedule_type` | dropdown | no | one of "datetime", "delay" |  |
| `delay_value` | number | yes | your user | only when schedule_type = "delay" |
| `post_at` | string | yes | your user | only when schedule_type = "datetime" |
| `bot_details` | object | no | your user |  |
| `bot_details.bot_name` | string | no | your user |  |
| `bot_details.icon_type` | dropdown | no | one of "emoji", "url" |  |
| `bot_details.emoji` | string | no | your user | only when bot_details.icon_type = "emoji" |
| `bot_details.url` | string | no | your user | only when bot_details.icon_type = "url" |
| `preview` | object | no | your user |  |
| `preview.unfurl_links` | dropdown | no | one of true, false |  |
| `preview.unfurl_media` | dropdown | no | one of true, false |  |

```js
const result = await viasocket.runAction(scriptId, 'rowj2u3wc8h5', {
  "destination": {
    "messageto": "channel",
    "channel_id": [
      "<id from list-options>"
    ],
    "tagged_users": [
      "<id from list-options>"
    ],
    "reply_broadcast": true
  },
  "markdown_content": "<markdown_content>",
  "buttons": {
    "key": "value"
  },
  "schedule_type": "datetime",
  "delay_value": 0,
  "post_at": "<post_at>",
  "bot_details": {
    "bot_name": "<bot_name>",
    "icon_type": "emoji",
    "emoji": "<emoji>",
    "url": "<url>"
  },
  "preview": {
    "unfurl_links": true,
    "unfurl_media": true
  }
})
```

A real sample of what this call returns:

```json
{
  "ok": true,
  "ts": "1788491847.000000",
  "channel": "C0ABC",
  "message": {
    "ts": "1788491847.000000",
    "text": "Alert",
    "type": "message",
    "bot_id": "B05",
    "metadata": {
      "event_payload": {
        "script_id": "s1"
      }
    }
  }
}
```

### Send Message as Thread

- `action_version_id`: `rowk9tjo65dx`
- Post a reply to an existing Slack thread. Supports immediate or scheduled delivery,
- fetch first: `channel`, `thread_ts`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel` | dropdown | yes | list-options |  |
| `thread_ts` | dropdown | yes | list-options after channel |  |
| `text` | string | yes | your user |  |
| `isScheduledMessage` | dropdown | yes | one of "no", "yes" |  |
| `post_at` | string | yes | your user | only when isScheduledMessage = "yes" |
| `bot_details` | object | no | your user |  |
| `bot_details.bot_name` | string | yes | your user |  |
| `bot_details.customIcon` | boolean | yes | one of true, false |  |
| `bot_details.icon_type` | dropdown | yes | one of "emoji", "url" | applies when bot_details.customIcon |
| `bot_details.emoji` | string | yes | your user | only when bot_details.icon_type = "emoji" |
| `bot_details.url` | string | yes | your user | only when bot_details.icon_type = "url" |

```js
const result = await viasocket.runAction(scriptId, 'rowk9tjo65dx', {
  "channel": "<id from list-options>",
  "thread_ts": "<id from list-options>",
  "text": "<text>",
  "isScheduledMessage": "no",
  "bot_details": {
    "bot_name": "viaSocket",
    "customIcon": false,
    "icon_type": "emoji",
    "emoji": "<emoji>",
    "url": "<url>"
  }
})
```

A real sample of what this call returns:

```json
{
  "ok": true,
  "ts": "1234567.890123",
  "channel": "C12345",
  "message": {
    "ts": "1234567.890123",
    "text": "Hello",
    "type": "message",
    "app_id": "A12345",
    "bot_id": "B12345",
    "subtype": "bot_message",
    "username": "SocketBot"
  }
}
```

### Send Message with Block kit

- `action_version_id`: `row38386b9d9`
- Send or schedule a message
- fetch first: `channel_id`, `tagged_users`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `messageto` | dropdown | yes | one of "channel", "user" |  |
| `userId` | string | yes | your user | only when messageto = "user" |
| `channel_id` | multiselect | yes | list-options | only when messageto = "channel" |
| `notification_type` | dropdown | yes | one of "channel", "specific", "none" | only when messageto = "channel" |
| `tagged_users` | multiselect | yes | list-options | applies when messageto === 'channel' && notification_type === 'specific' |
| `content` | string | yes | your user |  |
| `isScheduledMessage` | dropdown | yes | one of "no", "yes" |  |
| `post_at` | string | yes | your user | only when isScheduledMessage = "yes" |
| `bot_details` | object | no | your user |  |
| `bot_details.bot_name` | string | yes | your user |  |
| `bot_details.customIcon` | boolean | no | one of true, false |  |
| `bot_details.icon_type` | dropdown | no | one of "emoji", "url" | only when bot_details.customIcon = true |
| `bot_details.emoji` | string | yes | your user | only when bot_details.icon_type = "emoji" |
| `bot_details.url` | string | no | your user | only when bot_details.icon_type = "url" |
| `isReplyMessage` | boolean | no | one of true, false |  |
| `thread_ts` | string | yes | your user | only when isReplyMessage = true |
| `reply_broadcast` | boolean | no | one of true, false | only when isReplyMessage = true |
| `unfurl_links` | boolean | no | one of true, false |  |
| `unfurl_media` | boolean | no | one of true, false |  |
| `buttons` | dictionary | no | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'row38386b9d9', {
  "messageto": "channel",
  "channel_id": [
    "<id from list-options>"
  ],
  "notification_type": "none",
  "tagged_users": [
    "<id from list-options>"
  ],
  "content": "<content>",
  "isScheduledMessage": "no",
  "bot_details": {
    "bot_name": "viaSocket",
    "customIcon": true,
    "icon_type": "url",
    "url": "https://stuff.thingsofbrand.com/viasocket.com/images/imgf_logo-2.png"
  },
  "isReplyMessage": false,
  "unfurl_links": true,
  "unfurl_media": true,
  "buttons": {
    "key": "value"
  }
})
```

A real sample of what this call returns:

```json
{
  "ok": true,
  "ts": "1779250000.000000",
  "channel": "C0ABC",
  "message": {
    "ts": "1779250000.000000",
    "text": "Short msg",
    "app_id": "A0",
    "bot_id": "B0B0",
    "username": "bot"
  }
}
```

### Set Channel Topic

- `action_version_id`: `roww420xroem`
- Set or update channel topic
- fetch first: `channel`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel` | dropdown | yes | list-options |  |
| `topic` | string | yes | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'roww420xroem', {
  "channel": "<id from list-options>",
  "topic": "<topic>"
})
```

A real sample of what this call returns:

```json
{
  "ok": true,
  "channel": {
    "id": "C0XXXXXXX",
    "name": "channel_name",
    "topic": {
      "value": "General topic",
      "creator": "U0XXXXXXX"
    },
    "creator": "U0XXXXXXX"
  },
  "warning": "missing_charset"
}
```

### Update Canvas

- `action_version_id`: `rowrvz8plmz6`
- Edit canvas content & sections.
- fetch first: `canvas_id`, `section_id`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `canvas_id` | dropdown | yes | list-options |  |
| `operation` | dropdown | yes | one of "replace_all", "insert_at_start", "insert_at_end", "rename", "replace_section", "insert_before", "insert_after", "delete_section" |  |
| `new_title` | string | yes | your user | only when operation = "rename" |
| `section_id` | dropdown | yes | list-options after canvas_id | applies when operation === 'replace_section' \|\| operation === 'insert_before' \|\| operation === 'insert_after' \|\| operation === 'delete_section' |
| `markdown_content` | markdown | yes | your user | applies when operation !== 'rename' && operation !== 'delete_section' |

```js
const result = await viasocket.runAction(scriptId, 'rowrvz8plmz6', {
  "canvas_id": "<id from list-options>",
  "operation": "replace_all",
  "new_title": "<new_title>",
  "section_id": "<id from list-options>",
  "markdown_content": "<markdown_content>"
})
```

### View_open BlockKit Modal using JSON

- `action_version_id`: `row1y0gah8hc`
- Open Model as a response or any BlockKit action

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `trigger_id` | string | yes | your user |  |
| `view` | string | yes | your user |  |
| `private_metadata` | object | no | your user |  |
| `private_metadata.key` | string | no | your user |  |
| `private_metadata.value` | string | no | your user |  |

```js
const result = await viasocket.runAction(scriptId, 'row1y0gah8hc', {
  "trigger_id": "<trigger_id>",
  "view": "<view>",
  "private_metadata": {
    "key": "<key>",
    "value": "<value>"
  }
})
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
  "service_id": "rowbu58rc",
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


### New member join/leave or updated in channel

- `action_version_id`: `row8489a0yme`
- Triggers when a user joins, leaves, or updates their profile in the selected Slack channel.
- fetch first: `channel_ids`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel_ids` | multiselect | yes | list-options |  |
| `include_profile_updates` | boolean | no | one of true, false |  |

```js
// Subscribe once per user. Save the record described under Triggers: scriptId, inputData, handler.
const { scriptId: subscriptionId } = await user.subscribe('row8489a0yme', {
  authId,
  inputData: {
    "channel_ids": [
      "<id from list-options>"
    ],
    "include_profile_updates": true
  },
  code: handler, // what to do when it fires — a handler from the templates above
  meta: { user_id: uniqueIdentifier }
})
```

A real sample of the event, as your handler receives it in `context.req.body`:

```json
{
  "ts": 1609459200,
  "raw": {
    "id": "U123",
    "tz": "America/New_York",
    "name": "johndoe",
    "is_bot": false,
    "profile": {
      "email": "john@example.com",
      "image_24": "https://example.com/avatar24.png",
      "real_name": "John Doe",
      "display_name": "johnd",
      "is_custom_image": true
    },
    "team_id": "T123",
    "updated": 1609459200,
    "is_admin": true,
    "is_owner": true,
    "real_name": "John Doe"
  },
  "user": "U123",
  "event": "updated",
  "channel": "C123"
}
```

### New Mention

- `action_version_id`: `row9na0usfnq`
- Runs when someone mentions your Slack app or user in a channel you belong to.
- fetch first: `channel`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel` | multiselect | yes | list-options |  |

```js
// Subscribe once per user. Save the record described under Triggers: scriptId, inputData, handler.
const { scriptId: subscriptionId } = await user.subscribe('row9na0usfnq', {
  authId,
  inputData: {
    "channel": [
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
  "channel_id": "C123",
  "message_text": "Hello",
  "sender_user_id": "U123",
  "message_timestamp": "1710000000.000000"
}
```

### New Message in Channels

- `action_version_id`: `row9vbezbm3f`
- Runs when a new message is received in a specific Slack channel. You can select which channel to monitor.
- fetch first: `channel_id`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel_id` | multiselect | yes | list-options |  |

```js
// Subscribe once per user. Save the record described under Triggers: scriptId, inputData, handler.
const { scriptId: subscriptionId } = await user.subscribe('row9vbezbm3f', {
  authId,
  inputData: {
    "channel_id": [
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
  "ts": "1620000000.000001",
  "text": "Short message",
  "type": "message",
  "user": "U123",
  "files": [
    {
      "id": "F123",
      "name": "image.png",
      "size": 12345,
      "mimetype": "image/png",
      "url_private": "https://files.slack.com/files-pri/F123/image.png"
    }
  ],
  "blocks": [
    {
      "type": "rich_text",
      "block_id": "b1"
    }
  ],
  "channel": "C12345678",
  "bot_profile": {
    "id": "B123",
    "name": "bot"
  }
}
```

### New Message on Slack

- `action_version_id`: `rowtnis6dd1n`
- Runs when a new message is posted anywhere in Slack — across all channels and direct messages. No channel filter applied.

_No input: send `inputData: {}`._

```js
// Subscribe once per user. Save the record described under Triggers: scriptId, inputData, handler.
const { scriptId: subscriptionId } = await user.subscribe('rowtnis6dd1n', {
  authId,
  inputData: {},
  code: handler, // what to do when it fires — a handler from the templates above
  meta: { user_id: uniqueIdentifier }
})
```

A real sample of the event, as your handler receives it in `context.req.body`:

```json
{
  "ts": "1610000000.000001",
  "text": "Hi",
  "type": "message",
  "user": "U12345"
}
```

### New Thread Message

- `action_version_id`: `row2nhzn16zd`
- Runs when new thread message.
- fetch first: `channel`, `parent_message_ts`

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `channel` | dropdown | yes | list-options |  |
| `parent_message_ts` | dropdown | no | list-options after channel |  |

```js
// Subscribe once per user. Save the record described under Triggers: scriptId, inputData, handler.
const { scriptId: subscriptionId } = await user.subscribe('row2nhzn16zd', {
  authId,
  inputData: {
    "channel": "<id from list-options>",
    "parent_message_ts": "<id from list-options>"
  },
  code: handler, // what to do when it fires — a handler from the templates above
  meta: { user_id: uniqueIdentifier }
})
```

### New User Joined or Updated in Your Org

- `action_version_id`: `rowcs9tcu9ms`
- Triggers when a new user join workspace.

| key | type | required | value comes from | only applies when |
| --- | --- | --- | --- | --- |
| `filter_by` | dropdown | yes | one of "all", "active", "deleted", "admin", "owner" |  |
| `fields_to_return` | multiselect | yes | one of "ALL", "id", "team_id", "name", "real_name", "is_admin", "is_owner", "is_bot", "deleted", "updated", "profile", "profile.display_name", "profile.display_name_normalized", "profile.email", "profile.phone", "profile.skype", "profile.title", "profile.status_text", "profile.status_emoji", "profile.image_192", "profile.image_512", "profile.tz", "profile.tz_label", "profile.tz_offset" |  |

```js
// Subscribe once per user. Save the record described under Triggers: scriptId, inputData, handler.
const { scriptId: subscriptionId } = await user.subscribe('rowcs9tcu9ms', {
  authId,
  inputData: {
    "filter_by": "all",
    "fields_to_return": [
      "ALL"
    ]
  },
  code: handler, // what to do when it fires — a handler from the templates above
  meta: { user_id: uniqueIdentifier }
})
```

A real sample of the event, as your handler receives it in `context.req.body`:

```json
{
  "id": "U1234567890",
  "name": "username",
  "is_bot": false,
  "profile": {
    "email": "user@example.com",
    "phone": "1234567890",
    "title": "Job Title",
    "real_name": "User Realname"
  },
  "team_id": "T1234567890",
  "updated": 1234567890,
  "real_name": "User Realname"
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
