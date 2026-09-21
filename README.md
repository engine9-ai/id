# `@engine9/id`

Browser client for engine9 identity. It talks to [delegate](https://delegate.engine9.ai),
verifies short-lived **Identity Tokens** (JWT, ES256) with the public JWKS, and
exposes a small API for UNID, Identity Levels, and optional `@engine9/core`.

The wire format lives in [docs/protocol.md](./docs/protocol.md). That file is
canonical. Vocabulary: **User**, **Site**, **Profile**, **Grant**, **UNID**,
**Identity Level**. The JWT claim is still `aud` (RFC 7519).

Zero runtime dependencies. WebCrypto only.

**First deploy:** [docs/deploy.md](./docs/deploy.md) — add the script, allow
your website origin on delegate, show Level 0 / Level 1 content. No database.
If you need saved people or locked pages, deploy
[`@engine9/core`](../core/docs/deploy.md) as well.

## Install

### npm (ESM)

```bash
npm install @engine9/id
```

```js
import { createEngine9Id } from '@engine9/id';
import { describeLevel } from '@engine9/id/levels';

const id = createEngine9Id();
await id.handleCallback();
```

### Script tag (IIFE)

```html
<script src="https://unpkg.com/@engine9/id/dist/id.iife.js"></script>
<script>
  const id = engine9Id.createEngine9Id();
  id.handleCallback();
</script>
```

The IIFE assigns `window.engine9Id` (`createEngine9Id`, `LEVELS`,
`describeLevel`, `meetsLevel`, `fieldsForLevel`, `verifyIdentityToken`).

## Two modes

### Without core

The Site never sees `person_id` or Roles. Use the verified token for
personalization, a Level badge, and step-up. See [docs/without-core.md](./docs/without-core.md).

```js
const id = createEngine9Id(); // site defaults to location.origin
await id.handleCallback();
if (!id.getIdentity()) {
  await id.requestIdentity({ minLevel: 1, mode: 'popup' });
}
```

### With `@engine9/core`

After the browser holds an Identity Token, `id.core.login()` posts it to the
Site's core API with an `e9publickey_` key. Core maps `unid` / `profile_id` to
`person_id` and Roles. See [docs/with-core.md](./docs/with-core.md).

```js
const id = createEngine9Id({
  core: {
    apiUrl: 'https://www.example.com',
    publicApiKey: 'e9publickey_…',
  },
});
await id.requestIdentity({ minLevel: 1, mode: 'popup' });
await id.core.login();
const me = await id.core.me();
```

Register the Site origin with delegate (`ALLOWED_RETURN_ORIGINS` or the `site`
table) before `requestIdentity` will succeed in production.

## API

`createEngine9Id({ provider?, delegateUrl?, site?, storage?, core?, fetchImpl? })`

Delegate is the default provider (`createDelegateProvider`). Pass `provider` to
use another issuer that returns the same Identity shape — this is **not** OIDC.

| Method | What it does |
| ------ | ------------ |
| `getUnid()` | Cached `identity.unid`, else stored `delegate_unid` |
| `getIdentity()` | Verified, unexpired token payload, or `null` |
| `requestIdentity({ minLevel, maxLevel?, fields?, prompt?, mode, returnTo?, responseMode? })` | Redirect assigns `location` to `/identity/authorize`. Popup opens `/identity/bridge` and listens for `postMessage` type `delegate-identity` |
| `handleCallback()` | Parse `#delegate_token` or `?delegate_token` + `state`, verify, store, `history.replaceState` |
| `ensureLevel(n, opts?)` | Return if `meetsLevel`; otherwise silent `prompt=none`, then interactive |
| `logout({ delegate? })` | Clear storage; with `delegate: true` navigate to `/identity/logout` |
| `onChange(cb)` | Subscribe to identity updates; returns unsubscribe |
| `level` / `isAnonymous` | Getters from the stored identity |
| `core.login()` | `POST {apiUrl}/auth/login` with `{ delegate_token }` and `Authorization: Bearer e9publickey_…` / `X-API-Key` |
| `core.me()` | `GET /auth/me` |
| `core.changeRole(roleId)` | `POST /auth/role` |
| `core.fetch(path, init)` | Adds the public key and session headers |

Storage is `session` (default), `local`, or `memory`. Query builders use
`site=`, never `audience=`.

Exports:

- `@engine9/id/levels` — `LEVELS`, `describeLevel`, `meetsLevel`, `fieldsForLevel`
- `@engine9/id/core` — `createCoreClient`
- `@engine9/id/roles` — declared roles / `meetsRequiredAuth` / `evaluateDeclaredRole`
- `@engine9/id/forms` — `normalizePersonPayload`, `createPersonForm`, `EMAIL_TYPES`

Docs: [without-core](./docs/without-core.md), [with-core](./docs/with-core.md),
[declared-roles](./docs/declared-roles.md), [forms](./docs/forms.md).

## Security

After verification (ES256 via JWKS, `iss`, `aud ===` this Site origin, `exp`
±60s, optional `nonce`):

- Safe: personalization, UI, deciding to step up.
- Not safe: authorizing privileged actions from the token alone. Anyone who can
  run JavaScript on the page can read storage.
- Levels are confidence, not Roles.
- Accept popup `postMessage` only from the delegate origin.
- Default `response_mode=fragment` so the token stays out of Site server logs.

Full model: [docs/security.md](./docs/security.md). Levels: [docs/levels.md](./docs/levels.md).

## Browser support

Needs `crypto.subtle` (ES256), `fetch`, `sessionStorage` or `localStorage`,
and popups for `mode: 'popup'`. SameSite=Lax cookies on delegate require the
bridge to open as a top-level window (this library does that).

## License

[GPL-2.0](./LICENSE)
