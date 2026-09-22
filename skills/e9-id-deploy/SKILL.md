---
name: e9-id-deploy
description: >-
  Deploy @engine9/id on any website: register the Site origin with delegate,
  add the script or npm package, handleCallback, requestIdentity, render by
  Identity Level. Use when installing engine9 identity, adding delegate login
  to a site, or wiring Level 0/1 sharing without core.
---

# Deploy `@engine9/id` on a Site

Human deploy guide (start here): [`docs/deploy.md`](../../docs/deploy.md).
Canonical protocol: [`docs/protocol.md`](../../docs/protocol.md).
Without-core guide: [`docs/without-core.md`](../../docs/without-core.md).

## 1. Register the Site

The Site origin must be allowed by delegate:

- Add to `ALLOWED_RETURN_ORIGINS` (suffix `.example.com` or full origin), or
- Insert into the delegate `site` table (`origin`, `allowed = 1`).

Local demo ports already allowed: `http://localhost:3000`–`3003`.

There is no OAuth `client_id`. The Site is its origin.

## 2. Add the library

**npm**

```bash
npm install @engine9/id
```

```js
import { createEngine9Id } from "@engine9/id";

const id = createEngine9Id({
  delegateUrl: "https://delegate.engine9.ai",
  site: location.origin, // default
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
if (!ident || ident.level === 0) showAnonymous(ident?.unid);
else if (meetsLevel(ident, 3)) showTrusted(ident.profile);
```

## 5. Errors

Redirect/query `error=`: `interaction_required`, `login_required`,
`level_unavailable`, `access_denied`, `invalid_site`, `invalid_request`.

Popup blocked: fall back to `mode: "redirect"`.

## Framework snippets

- **Astro:** call `handleCallback()` in a client script; server callbacks
  use `responseMode: "query"` and verify the JWT on the server (or via core).
- **React:** create one `id` instance in a provider; `onChange` to re-render.
- **Next:** keep secrets off the client; use the public Identity Token only.
