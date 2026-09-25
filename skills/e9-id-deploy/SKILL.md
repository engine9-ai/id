---
name: e9-id-deploy
description: >-
  Deploy @engine9/id on any website: register the Domain with delegate,
  add the script or npm package, mount(), data-e9-* login buttons and content
  gates, id.gate() hooks, requestIdentity, render by Identity Level. Use when
  installing engine9 identity, adding delegate login to a site, building a
  soft paywall, or wiring Level 0/1 sharing without core.
---

# Deploy `@engine9/id`

Human guide (start here): [`README.md`](../../README.md) — quick start,
`data-e9-*` attribute table, `id.gate()` hooks, troubleshooting.
Deploy steps: [`docs/deploy.md`](../../docs/deploy.md).
Canonical protocol: [`docs/protocol.md`](../../docs/protocol.md).
Without-core guide: [`docs/without-core.md`](../../docs/without-core.md).

## Fastest path (no server)

```html
<script src="https://unpkg.com/@engine9/id@1/dist/id.iife.js"></script>
<script>const id = engine9Id.mount();</script>

<button data-e9-login>Log in</button>
<button data-e9-logout hidden>Log out</button>
<div data-e9-max-level="0">Log in to keep reading.</div>
<div data-e9-min-level="1" hidden>Gated content…</div>
```

`mount()` = `createEngine9Id({ storage: "local" })` + `handleCallback()` +
`bindContent()`. Hooks: `id.gate({ minLevel, onAllow, onBlock })`. Gates are
soft (hidden attribute); hard gates need core. The steps below are the
lower-level API.

## 1. Register the Domain

The consumer Domain must be allowed by delegate:

- Add to `ALLOWED_DOMAINS` (suffix `.example.com` or full origin whose
  `domainFromUrl` matches), or
- Insert into the delegate `domain` table (`domain`, `allowed = 1`).

Local demo ports already allowed: `http://localhost:3000`–`3003` (Domain
`localhost:3000`, etc.).

There is no OAuth `client_id`. The consumer is its Domain (`host` or
`host:port`).

## 2. Add the library

**npm**

```bash
npm install @engine9/id
```

```js
import { createEngine9Id } from "@engine9/id";

const id = createEngine9Id({
  delegateUrl: "https://delegate.engine9.ai",
  // domain defaults from location via domainFromUrl
  storage: "session",
});

await id.handleCallback();
```

**script tag** (after `npm run build` in this repo)

```html
<script src="/id.iife.js"></script>
<script>
  const id = engine9Id.createEngine9Id();
  id.handleCallback();
</script>
```

## 3. Request identity on a user gesture

```js
document.getElementById("signin").onclick = async () => {
  await id.requestIdentity({
    minLevel: 1,
    mode: "popup", // or "redirect"
    prompt: "consent",
  });
  render(id.getIdentity());
};
```

Redirect mode: send the user to `/identity/authorize` and call
`handleCallback()` on the return URL (`#delegate_token=` or `?delegate_token=`).

## 4. Render by level

```js
import { describeLevel, meetsLevel } from "@engine9/id/levels";

const ident = id.getIdentity();
if (!ident || ident.level === 0) showAnonymous(ident?.sub);
else if (meetsLevel(ident, 3)) showTrusted(ident.profile);
```

## 5. Errors

Redirect/query `error=`: `interaction_required`, `login_required`,
`level_unavailable`, `access_denied`, `invalid_domain`, `invalid_request`.

Popup blocked: fall back to `mode: "redirect"`.

## Framework snippets

- **Astro:** call `handleCallback()` in a client script; server callbacks
  use `responseMode: "query"` and verify the JWT on the server (or via core).
- **React:** create one `id` instance in a provider; `onChange` to re-render.
- **Next:** keep secrets off the client; use the public Identity Token only.
