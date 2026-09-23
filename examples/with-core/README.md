# Example: `@engine9/id` with `@engine9/core`

The browser still obtains an Identity Token from delegate. Core (on the Site
server) verifies that token and maps `pseudonym` / `sub` to `person_id` plus
Roles. A Core Session is an optional cache of those Site-only facts.

## 1. Public API key

```bash
npx e9 create-api-key --db sqlite://./engine9.db --name site-public --scopes public
```

The plaintext value starts with `e9publickey_`. It is safe to embed in the
browser. It is not an `admin` key.

## 2. Client

```js
import { createEngine9Id } from '@engine9/id';

const id = createEngine9Id({
  core: {
    apiUrl: 'https://www.example.com',
    publicApiKey: 'e9publickey_…',
  },
});

await id.handleCallback();
await id.requestIdentity({ minLevel: 1, mode: 'popup' });
const { session, token } = await id.core.login();
const me = await id.core.me();
await id.core.changeRole('<segment-uuid>');
const res = await id.core.fetch('/read/content');
```

`login()` sends `POST /auth/login` with `{ delegate_token }` and both
`Authorization: Bearer e9publickey_…` and `X-API-Key`. Later calls add
`X-Engine9-Session` when a session token is stored.

## 3. Roles

Roles live in core (`role_id === segment_id`). They may declare
`requiredAuth.minLevel` and `requiredAuth.twoFactor`. Identity Levels are not
Roles — a Level 4 visitor still needs a Role to pass a gated read.

See [docs/with-core.md](../../docs/with-core.md).
