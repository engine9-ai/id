---
name: e9-id-with-core
description: >-
  Wire @engine9/id to an @engine9/core Site: public API key, POST /auth/login,
  GET /auth/me, Roles with minLevel, cookie vs X-Engine9-Session. Use when a
  site has core, person_id, person_segment roles, or VIP/Admin gating.
---

# `@engine9/id` with `@engine9/core`

Deploy the database first: [`core/docs/deploy.md`](../../../core/docs/deploy.md)
(Cloudflare + D1 is the main path).
Then read [`docs/with-core.md`](../../docs/with-core.md) and
[`docs/protocol.md`](../../docs/protocol.md).

## 1. Public API key

```bash
e9 create-api-key --scopes public
```

Use the `e9publickey_` value only in the browser. Private `e9key_` keys stay
on the server.

## 2. The Login button

The login widget is the default way to use Delegate. Put it in the header of
every page instead of separate Log in / Change / Log out buttons, and call
core from its hooks:

```js
import { mount } from "@engine9/id";
import { loginWidget } from "@engine9/id/widget";

const id = mount({
  core: {
    apiUrl: "/api",
    publicApiKey: "e9publickey_…",
  },
});

loginWidget({
  id,
  roles: [{ id: "<vip-segment-uuid>", name: "VIP", requiredAuth: { minLevel: 1 } }],
  async onLogin() {
    const { session } = await id.core.login();
    return { email: session.fields?.email, role: session.roles?.[0] ?? null, level: session.level };
  },
  async onRoleChange(roleId) {
    await id.core.changeRole(roleId);
  },
});
```

`onLogin` also runs after **Switch email**, so core re-reads roles for the
new address. Core enforces roles; the widget only offers them. The page
needs `<span data-e9-login-widget></span>` where the button goes.

Underneath (for reads after login, or a page with its own controls):

```js
await id.requestIdentity({ minLevel: 1, mode: "popup" }); // what the widget's Login does
const session = await id.core.login();
const me = await id.core.me();
```

`login()` POSTs `{ delegate_token }` to `/auth/login`. The host may also set
an HttpOnly cookie from the returned `token` (HMAC Core Session).

## 3. Roles

`role_id === segment_id` (UUID). Example (festival demo):

```js
roles: {
  "<admin-segment-uuid>": {
    name: "Admin",
    scopes: ["admin"],
    requiredAuth: { minLevel: 3 },
  },
  "<vip-segment-uuid>": {
    name: "VIP",
    scopes: ["data:read"],
    requiredAuth: { minLevel: 1 },
  },
}
```

A Core Session is a cache. Routes should accept `X-Engine9-Session` **or**
`Authorization: Bearer <Identity Token>`.

## 4. Cookie vs header

Core never sets cookies. The host app should:

```
Set-Cookie: session=<HMAC token>; HttpOnly; Secure; SameSite=Lax
```

and/or send `X-Engine9-Session` from JS. `createSessionCookieHeaders` in
`@engine9/core/auth/delegate` builds the header value.
