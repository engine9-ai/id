# Connect a web page to engine9 (MCP)

`@engine9/id/mcp` lets a web page sign a person in to an engine9 server, list
the engine9 accounts they may open, let them pick one, and call the server's
MCP tools as that person. It runs in the browser only.

You do not need:

- a server of your own, or any engine9 code on a server;
- to register your site with Delegate or with the engine9 server;
- a client secret or an API key.

You do need:

- the URL of an engine9 MCP server, such as `https://data.engine9.ai/mcp`
  (whoever runs the server gives it to you);
- a page served over **https**, or from `localhost` while you develop;
- a person who can open at least one account on that server.

Contents:

- [Quick start](#quick-start)
- [What the person sees](#what-the-person-sees)
- [Accounts](#accounts)
- [Calling tools](#calling-tools)
- [More than one server](#more-than-one-server)
- [Options](#options)
- [API](#api)
- [Security](#security)
- [The wire protocol](#the-wire-protocol), to implement this without the library
- [Troubleshooting](#troubleshooting)

## Quick start

**Script tag:**

```html
<span data-e9-mcp-button></span>
<div id="report"></div>

<script src="https://unpkg.com/@engine9/id@1/dist/id.iife.js"></script>
<script>
  const mcp = engine9Id.connectMcp({ servers: ['https://data.engine9.ai/mcp'] });

  engine9Id.mcpButton({
    mcp,
    onAccountChange: (account) => show(account),
  });

  async function show(account) {
    const el = document.getElementById('report');
    if (!account) return (el.textContent = 'Pick an account.');
    const result = await mcp.call('report', { command: 'list' });
    el.textContent = JSON.stringify(result, null, 2);
  }

  mcp.ready.then(() => mcp.account() && show({ id: mcp.account() }));
</script>
```

**npm** (Vite, Next, React and so on):

```bash
npm install @engine9/id
```

```js
import { connectMcp, mcpButton } from '@engine9/id/mcp';

const mcp = connectMcp({ servers: ['https://data.engine9.ai/mcp'] });
mcpButton({ mcp, target: '#connect', onAccountChange: render });
```

Create the connection **once per page load, early**: `connectMcp()` finishes a
sign-in that is returning to the page (it reads `?code=…&state=…` and removes
them from the address bar). `mcp.ready` resolves when that is done.

The button is the whole interface: **Connect to engine9** → the person signs
in → they choose an account → the button shows their email with the
account's name. Clicking it again switches account, switches server, or signs
out.

## What the person sees

1. **Connect to engine9** in your page, then **Sign in to data.engine9.ai**.
2. **Delegate** (`delegate.network`), engine9's common sign-in. A person
   already signed in to Delegate in this browser usually goes straight
   through.
3. **The engine9 server's consent screen**: "Allow `app.example.com` to use
   engine9 as alex@example.com?". It names your site by its address and says
   that your site will be able to read and change data in their accounts. It
   is shown **on every sign-in**. Pages on `localhost` do not get this screen,
   and neither do sites the server's operator lists as trusted.
4. Back on your page, signed in. **Deny** comes back too, with
   `mcp.callbackError.code === 'access_denied'`; the button shows the message.

The sign-in lasts **8 hours** and cannot be renewed in the background. When it
ends, the next call fails with `signed_out` and the person signs in again
(step 2 is usually instant).

## Accounts

An engine9 server holds many **accounts** (one per organization). The person
sees the accounts they may open: every account for a superadmin, or the
accounts where they hold the `admin` role. In engine9 the account is the
role, so the button shows the account where the login widget shows a role.

```js
const accounts = await mcp.accounts();
// [{ id: 'acme', name: 'Acme Action', type: 'client', parentIds: ['agency'],
//    disabled: false, tags: [], level: 'admin' }, …]

mcp.setAccount('acme');   // what mcpButton does when the person picks one
mcp.account();            // 'acme'
```

The selected account is remembered per server in this browser. Choosing an
account in your page does not grant anything: the server checks every call
against the signed-in person.

Superadmins can see hundreds of accounts. The button shows a search box above
8 accounts and lists at most 100 at a time.

## Calling tools

```js
const result = await mcp.call('report', { command: 'list' });
```

- `account_id` is added from the selected account unless you pass one, or pass
  `{ accountId: null }` for a tool that takes no account:
  `mcp.call('ok', {}, { accountId: null })`.
- The result is the tool's `structuredContent`, or the JSON in its first text
  block, or that text.
- A tool that reports an error throws `McpError` with `code: 'tool_error'`.
- An ended sign-in throws `code: 'signed_out'` (check with `isMcpSignedOut`);
  the token is already forgotten, so show the button again.

```js
import { isMcpSignedOut } from '@engine9/id/mcp';

try {
  render(await mcp.call('report', { command: 'list' }));
} catch (error) {
  if (isMcpSignedOut(error)) button.open();
  else showError(error);
}
```

Which tools exist, and what they take, is the server's list:
`await mcp.request('tools/list')`.

`mcp.getToken()` returns the bearer token if you want to call the server
yourself (see [the wire protocol](#the-wire-protocol)).

### React

```jsx
import { useEffect, useState } from 'react';
import { connectMcp, mcpButton } from '@engine9/id/mcp';

const mcp = connectMcp({ servers: ['https://data.engine9.ai/mcp'] }); // module scope: once

export function useEngine9() {
  const [state, setState] = useState(mcp.state());
  useEffect(() => mcp.onChange(setState), []);
  return { mcp, ...state };
}

export function ConnectButton() {
  useEffect(() => mcpButton({ mcp, target: '#e9-connect' }).destroy, []);
  return <span id="e9-connect" />;
}
```

## More than one server

engine9 runs as several deployments. List each one; the button shows a server
list, and each server has its own sign-in, token, and selected account.

```js
const mcp = connectMcp({
  servers: [
    { url: 'https://data.engine9.ai/mcp', name: 'engine9' },
    { url: 'https://data.partner.org/mcp', name: 'Partner' },
  ],
  allowCustomServer: true, // also let the person type a server URL
});
```

`mcp.selectServer(url)` switches; `mcp.state().server` is the current one.

## Options

`connectMcp(options)`:

| Option | Default | Meaning |
| --- | --- | --- |
| `servers` | required | MCP endpoint URLs or `{ url, name }`. A bare origin gets `/mcp`. https only, except `localhost` |
| `allowCustomServer` | `false` | The button offers a field for another server URL |
| `mode` | `'redirect'` | `'popup'` signs in in a small window and keeps your page |
| `redirectUri` | this page without its query | Where the server sends the browser back. It must load a page that calls `connectMcp()` |
| `clientId` | your origin, `https://app.example.com/` | Your OAuth client id. See [client id](#client-id) |
| `storage` | `'local'` | `'session'` (this tab only) or `'memory'` (gone on reload) |
| `clientName` | your host | Sent to the server as the MCP client name |
| `fetchImpl`, `navigate` | `fetch`, `location.assign` | For tests or a router |

`mcpButton(options)`:

| Option | Default | Meaning |
| --- | --- | --- |
| `mcp` | required | The connection |
| `target` | `[data-e9-mcp-button]`, else `<body>` | Element or selector for the button |
| `onAccountChange(account, state)` | none | The person picked an account (`null` after sign-out). Throw to refuse; the message shows in the dialog |
| `mode` | the connection's | `'redirect'` or `'popup'` |
| `labels` | English | Any text: `connect`, `signIn` (`{server}`), `chooseAccount`, `search`, … |
| `theme` | `'auto'` | `'light'` or `'dark'` |
| `searchThreshold`, `maxListed` | `8`, `100` | When the search box shows; how many accounts list at once |
| `promptForAccount` | `true` | Open the dialog after sign-in when no account is chosen |
| `onError` | `console.warn` | Every error the dialog shows |

Styling: the same `--e9-accent`, `--e9-bg`, `--e9-fg`, `--e9-muted`,
`--e9-border`, `--e9-surface`, and `--e9-font` as the login widget, set on
`.e9-mcp-button`. The element has `data-state` (`signed-in` / `signed-out`)
and `data-account`, and exposes `::part(button)`, `::part(email)`,
`::part(account)`, and `::part(dialog)`.

### Client id

By default your client id is your origin as a URL (`https://app.example.com/`).
The server accepts any https URL **on the same origin as the redirect URI**,
because that origin is what the consent screen shows and what receives the
code. Nothing to register.

Optionally, host a client metadata document and use its URL as `clientId`, to
give the consent screen a name and to pin your redirect URIs:

```json
// https://app.example.com/engine9-client.json  (Content-Type: application/json)
{
  "client_id": "https://app.example.com/engine9-client.json",
  "client_name": "Example Reports",
  "redirect_uris": ["https://app.example.com/reports"]
}
```

The server shows the name next to the origin ("It calls itself …"), never
instead of it. When the document lists `redirect_uris`, other redirect URIs
are refused.

## API

`connectMcp(options)` returns:

| Member | Meaning |
| --- | --- |
| `ready` | Resolves once a returning sign-in is finished |
| `callbackError` | Why that sign-in failed (`access_denied`, `sign_in_expired`, `sign_in_failed`), or `null` |
| `state()` | `{ server, signedIn, email, account }` |
| `onChange(fn)` | Called on every change; returns an unsubscribe function |
| `servers()`, `server()`, `selectServer(url)`, `addServer(url)` | The server list |
| `isSignedIn(url?)` | A token for that server (default: the current one) |
| `signIn({ server?, mode?, returnTo? })` | Start sign-in. Redirect mode leaves the page |
| `signOut(url?)` | Forget the token and revoke it |
| `user({ refresh? })` | `{ uid, email, isSuperadmin, accounts }` |
| `accounts({ refresh?, includeDisabled? })` | Enabled accounts by name |
| `account()`, `setAccount(id)` | The selected account on the current server |
| `call(tool, args?, { accountId?, server? })` | Call a tool |
| `request(method, params?)` | Any MCP JSON-RPC method |
| `getToken(url?)` | The bearer token |

`mcpButton(options)` returns `{ element, open(), close(), destroy() }`.

Both are also on `window.engine9Id` in the script-tag build, with
`isMcpSignedOut`.

## Security

- **The token is the person's engine9 access.** Until it expires, anyone
  holding it can do what that person can do in their accounts. It is kept in
  `localStorage` by default, where any script on your page can read it. Keep
  untrusted scripts off pages that connect to engine9, or use
  `storage: 'session'`.
- **The server enforces access.** Your page choosing an account, hiding a
  button, or skipping a call is not a permission. Every call is checked
  against the signed-in person.
- **The consent screen names your origin.** If your site is compromised,
  people will still be asked about your origin. Do not ask people to connect
  from pages you do not control.
- **No cookies cross sites.** The server answers your page's requests with
  CORS for the bearer token only. The server's own session cookie is never
  sent for your origin.

## The wire protocol

Everything above is standard OAuth 2.1 (authorization code with PKCE, a
public client) and MCP Streamable HTTP. Any client that speaks those works;
this is what `@engine9/id/mcp` does.

### 1. Discovery

```
GET {origin}/.well-known/oauth-protected-resource/mcp
→ { "resource": "https://data.engine9.ai/mcp",
    "authorization_servers": ["https://data.engine9.ai"], … }

GET {authorization server}/.well-known/oauth-authorization-server
→ { "authorization_endpoint": ".../oauth/authorize",
    "token_endpoint": ".../oauth/token",
    "revocation_endpoint": ".../oauth/revoke",
    "registration_endpoint": ".../register",
    "code_challenge_methods_supported": ["S256"],
    "client_id_metadata_document_supported": true, … }
```

A first `POST /mcp` without a token also answers `401` with
`WWW-Authenticate: Bearer resource_metadata="…"`.

### 2. Authorize (top-level navigation or popup)

```
GET /oauth/authorize
  ?response_type=code
  &client_id=https://app.example.com/
  &redirect_uri=https://app.example.com/reports
  &code_challenge=<base64url(SHA-256(verifier))>
  &code_challenge_method=S256
  &state=<random>
```

- `redirect_uri` must be https (or a loopback `http://localhost…` /
  `http://127.0.0.1…`). Anything else is refused with a 400 page and no
  redirect.
- For an https site that is not an engine9 host or a trusted origin,
  `client_id` must be an https URL on the redirect URI's origin, or a
  `client_id` returned by `POST /register` for that redirect URI. A made-up
  `client_id` is refused (`unauthorized_client`).
- The server sends the browser to Delegate (Identity Level 3, verified
  email), then shows its consent screen, then redirects to
  `redirect_uri?code=…&state=…` or
  `redirect_uri?error=access_denied&state=…`.

Dynamic client registration also works (`POST /register` with
`redirect_uris`). The returned `client_id` carries those redirect URIs, so
the server stores nothing.

### 3. Token

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=…&code_verifier=…
&redirect_uri=https://app.example.com/reports&client_id=https://app.example.com/

→ { "access_token": "…", "token_type": "Bearer", "expires_in": 28800 }
```

The code is good for 5 minutes. There is no refresh token: when the access
token expires, authorize again. `POST /oauth/revoke` with `token=…` ends it
early.

### 4. MCP

```
POST /mcp
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json, text/event-stream

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"app.example.com","version":"1"}}}
```

Read `mcp-session-id` from the response headers (exposed to your origin) and
send it on every later request, starting with
`{"jsonrpc":"2.0","method":"notifications/initialized"}`. Then
`tools/list` and `tools/call` with
`{"name":"report","arguments":{"account_id":"acme","command":"list"}}`.
A response may be JSON or `text/event-stream` (`data:` lines). A `404` means
the server dropped the MCP session: initialize again. A `401` means the token
ended: sign in again.

The `user` tool returns `{ uid, email, isSuperadmin, accounts }`, with
`accounts` keyed by `account_id`:
`{ name, type, parent_ids, disabled, tags, level }`.

### CORS

Any origin may call `/mcp`, `/oauth/token`, `/oauth/revoke`, `/register` and
`/.well-known/*` with a bearer token. Responses never allow credentials, so
send no cookies (`credentials: 'omit'`, the `fetch` default for another
origin). Other paths do not answer other origins.

## Troubleshooting

| What you see | Why | What to do |
| --- | --- | --- |
| `unauthorized_client: A website must use its own https URL as client_id` | A custom `clientId` that is not a URL on your origin | Leave `clientId` unset, or use a URL on the redirect URI's origin |
| `client_id origin … does not match redirect_uri origin …` | `clientId` and `redirectUri` are on different origins | Put both on the page's origin |
| `redirect_uri not allowed` | The page is plain `http` on a host other than localhost | Serve the page over https |
| `redirect_uri is not listed in the client metadata document` | Your metadata document lists other redirect URIs | Add this one, or drop `redirect_uris` from the document |
| Back on the page, nothing happened | The redirect URI page does not call `connectMcp()`, or calls it after the router removed the query | Call `connectMcp()` first, at module load |
| `access_denied` | The person chose Deny | Show the button again |
| `signed_out` after a few hours | The 8-hour sign-in ended | Sign in again |
| The account list is empty | The person is not an admin of any account on that server | Ask the server's operator; access is per account |
| `Failed to fetch` on `/mcp` | An old server without third-party CORS, or a wrong URL | Check the URL ends in `/mcp`; ask the operator to update the server |
