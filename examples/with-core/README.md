# Example: `@engine9/id` with `@engine9/core`

The browser still obtains an Identity Token from delegate. Core (on the Site
server) verifies that token and maps the Domain UNID (`sub`) to `person_id` plus
Roles. A Core Session is an optional cache of those Site-only facts.

## 1. Public API key

```bash
npx e9 create-api-key --db sqlite://./engine9.db --name site-public --scopes public
```

The plaintext value starts with `e9publickey_`. It is safe to embed in the
browser. It is not an `admin` key.

## 2. The Login button

The login widget is the default way to use Delegate. Its dialog logs in with
Google, switches email, changes role, and logs out, and its hooks call core:

```js
import { mount } from '@engine9/id';
import { loginWidget } from '@engine9/id/widget';

const id = mount({
  core: {
    apiUrl: 'https://www.example.com',
    publicApiKey: 'e9publickey_…',
  },
});

loginWidget({
  id,
  roles: [{ id: '<segment-uuid>', name: 'VIP', requiredAuth: { minLevel: 1 } }],
  async onLogin() {
    const { session } = await id.core.login();
    return { email: session.fields?.email, role: session.roles?.[0] ?? null, level: session.level };
  },
  async onRoleChange(roleId) {
    await id.core.changeRole(roleId);
  },
});
```

The page needs `<span data-e9-login-widget></span>` where the button goes.

## 3. The core calls underneath

The widget's hooks use these. Call them yourself for reads after login, or
when a page builds its own controls instead of the widget:

```js
await id.requestIdentity({ minLevel: 1, mode: 'popup' }); // what the widget's Login does
const { session, token } = await id.core.login();
const me = await id.core.me();
await id.core.changeRole('<segment-uuid>');
const res = await id.core.fetch('/read/content');
```

`login()` sends `POST /auth/login` with `{ delegate_token }` and both
`Authorization: Bearer e9publickey_…` and `X-API-Key`. Later calls add
`X-Engine9-Session` when a session token is stored.

## 4. Roles

Roles live in core (`role_id === segment_id`). They may declare
`requiredAuth.minLevel` and `requiredAuth.twoFactor`. Identity Levels are not
Roles — a Level 4 visitor still needs a Role to pass a gated read.

See [docs/with-core.md](../../docs/with-core.md).
