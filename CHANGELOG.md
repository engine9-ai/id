# Release notes: @engine9/id

This file lists what changed in each release, what was retired, and what a
site should change. The current way to do things is in [README.md](README.md).

Only releases from the last week are listed. Pin the version you install
(`@engine9/id@1.13.1`); a copy of `id.iife.js` you saved earlier is the
version it was saved from.

## 1.13.1: Retirement date

Documentation only; no code change. 1.13.0 said `delegate.engine9.ai` would
stop working "no later than 2026-10-23". That date was wrong. The old host is
retired on **2026-10-30**. Everything in 1.13.0 below still applies.

## 1.13.0: Delegate moves to delegate.network

<!-- REMOVE-AFTER 2026-11-06: the retirement notice and the migration table below.
     One week after delegate.engine9.ai is retired (2026-10-30), delete everything from here
     to the matching "END REMOVE-AFTER" comment, and keep the "What changed" list. -->

> **`https://delegate.engine9.ai` is being retired. It will stop working on
> 2026-10-30. Move every site to `https://delegate.network` now.**

### What to change in your site

A site that does not set `delegateUrl` gets the new host by upgrading to
1.13.0. A site that names the old host anywhere must change that text. Find
every place:

```bash
rg -n "delegate\.engine9\.ai" . -g '!node_modules' -g '!dist'
```

| Where | Find | Change to |
| --- | --- | --- |
| `createEngine9Id({ ... })` | `delegateUrl: 'https://delegate.engine9.ai'` | Delete the line (the default is `https://delegate.network`), or `delegateUrl: 'https://delegate.network'` |
| `loginWidget({ ... })`, `mount({ ... })` | `delegateUrl: 'https://delegate.engine9.ai'` | Same |
| `createDelegateProvider({ delegateUrl })`, `requestIdentity`, `bridgeUrl`, `authorizeUrl`, `logoutUrl` | `delegateUrl` naming the old host | Same |
| `window.engine9Id` (script tag) | `engine9Id.createEngine9Id({ delegateUrl: 'https://delegate.engine9.ai' })` | Same |
| Script tag or CDN pin | `https://unpkg.com/@engine9/id@1.12.1/dist/id.iife.js` (any version below 1.13.0) | `https://unpkg.com/@engine9/id@1.13.0/dist/id.iife.js` |
| A saved copy of `id.iife.js` or `dist/` in your repo (a vendored file) | A copy older than 1.13.0 hard-codes the old host as its default | Replace it with the 1.13.0 file. If you cannot yet, pass `delegateUrl: 'https://delegate.network'` |
| Your own `postMessage` origin check | `event.origin === 'https://delegate.engine9.ai'` | `'https://delegate.network'` |
| Hard-coded links and fetches | `https://delegate.engine9.ai/identity/authorize`, `/identity/bridge`, `/identity/logout`, `/identity/logout/bridge`, `/user`, `/.well-known/jwks.json`, `/.well-known/delegate-configuration` | Same paths on `https://delegate.network` |
| A server (any language) that verifies the token your browser sends it | `iss` expected to be `https://delegate.engine9.ai`, JWKS from that host | `iss` `https://delegate.network`, JWKS `https://delegate.network/.well-known/jwks.json`. With `@engine9/core`, see its [CHANGELOG](https://github.com/engine9-ai/core/blob/main/CHANGELOG.md) |
| Content-Security-Policy (`frame-src`, `connect-src`, `form-action`, `script-src`), firewall and proxy allowlists | `delegate.engine9.ai` | `delegate.network` (add it before you remove the old entry) |
| Tests and fixtures that sign tokens | `iss: 'https://delegate.engine9.ai'` | `iss: 'https://delegate.network'` |

Rules:

- **Change the browser and the server in one deploy.** The browser checks the
  token's `iss` against `delegateUrl`, and a server that verifies the same token
  checks it against its own setting. Different hosts reject each other's tokens.
- **Do not accept both issuers.** `@engine9/id` verifies `iss` against the one
  `delegateUrl` you configure. There is no "either issuer" option, and none was
  added.
- **Registered Domains need nothing.** A Domain registered with Delegate works
  on the new host. Do not ask for a new registration.

What your visitors see: each signs in once more, because the new host does not
have their Delegate session and the token saved in the browser
(`delegate_token`) names the old issuer and is dropped. Delegate recognizes the
same account, so it is the same User and the same Domain UNID.

<!-- END REMOVE-AFTER 2026-11-06 -->

### What changed

- The default Delegate URL is `https://delegate.network` (was
  `https://delegate.engine9.ai`).
- Docs, examples, and tests use the new host.

## Site steps for the last week's releases

### 1.12.1 (2026-10-23): "Logging in…" state

| Where | Change |
| --- | --- |
| `loginWidget({ labels })` | Add `loggingIn` to a custom `labels` object, or the button shows the English default while a login is in flight |
| Your `onLogin` handler | Keep it to the login: verify, find or create the person, set the cookie, and return `{ email, role, level }`. Load profile and history after the button updates |
| Server login code | Do not install or migrate during the login request. Install at deploy time and check "already set up?" with one query ([core docs](https://github.com/engine9-ai/core/blob/main/docs/identityProviders/delegate.md#keep-the-return-from-delegate-fast)) |

### 1.12.0 (2026-10-23): Login is a full-page trip

| Where | Change |
| --- | --- |
| `loginWidget({ ... })` | `mode` now defaults to `'redirect'`: signed out, **Login** sends the page to Delegate and back. To keep the old dialog and Delegate window, pass `mode: 'popup'` |
| Page load | Call `mount()` or `finishSignIn()` on every page, in browser code. A redirect return reaches the page from Delegate, and nothing finishes it unless one of them runs |
| A plain button | Replace hand-written `requestIdentity({ mode: 'redirect' })` plus `handleCallback()` with `await id.signIn({ fields: ['email'] })` on click and `await id.finishSignIn({ onSignedIn })` on load |
| `brand: { google: 'skip' }` | Delete it. It is accepted and does nothing extra; one provider on a full-page login opens by itself |
| A popup login | A browser blocks a window opened without a click, and Delegate shows its provider screen. Use a full-page login |
| First-time visitors | They now see Delegate's share screen, where they pick which email and fields to send. Do not rely on skipping it |
| New, optional | `loginProviders: ['google', 'facebook']`, `loginHint: 'ada@example.com'`, `warn: true` and `debug: true` (console reasons why Delegate shows a screen) |

### 1.11.0 (2026-10-16): short-lived tokens in a return URL

| Where | Change |
| --- | --- |
| A server callback that receives `?delegate_token=` (`response_mode=query`) | The token now lives 5 minutes by default (it was 8 hours). Exchange it at once. If you need longer, ask with `expiresIn` |
| That same callback | Keep `state` and `nonce` in a short-lived `HttpOnly` cookie and accept nothing whose `state` does not match. With `@engine9/core` use `beginLogin()` and `finishLogin()` |
| Server logs | Do not log the full callback query string; it carries the token |
