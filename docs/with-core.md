# Using `@engine9/id` with `@engine9/core`

Core is optional. When a Site embeds `@engine9/core`, the browser still
obtains an Identity Token from an identity provider (default: **delegate**).
The Site server verifies that token (JWKS, no shared secret required) and maps
the Domain UNID (`sub`, plus `merged_from` when present) to a warehouse
`person_id` plus **segment** Roles.

A **Core Session** is an optional HMAC cache of those Site-only facts. It is
never required for authentication. Core routes accept either
`X-Engine9-Session` or `Authorization: Bearer <Identity Token>`.

Deploy core first: [core deploy guide](../../core/docs/deploy.md).
On-ramp without a database: [without-core.md](./without-core.md),
[declared-roles.md](./declared-roles.md), [forms.md](./forms.md),
[`demo-id`](../../demo-id). Festival Site with core: [`demo-festival`](../../demo-festival).

## When you need core

Anything involving `person_id`, `person_segment` Roles, gated reads
(`GET /read/:name`), role changes, or `admin` / `people:write` scopes.

## Client helpers

`createEngine9Id({ core: { apiUrl, publicApiKey } })` — or
`mount({ core: { apiUrl, publicApiKey } })` for the attribute-driven setup —
exposes:

- `id.core.login()` — `POST /auth/login` with the Identity Token and an
  `e9publickey_` key (`public` scope). Core replies `{ session, token }`.
- `id.core.me()` — `GET /auth/me`
- `id.core.changeRole(roleId)` — `POST /auth/role`
- `id.core.fetch(path, init)` — adds the public key and session/token headers

The public key is the `E9_PUBLIC_API_KEY` line that `npx e9core setup` writes
to `.env` (`e9publickey_…`). It is safe in page JavaScript: it can add people
and log in, nothing else.

```html
<script src="https://unpkg.com/@engine9/id@1/dist/id.iife.js"></script>
<script>
  const id = engine9Id.mount({
    core: { apiUrl: '/api', publicApiKey: 'e9publickey_…' },
  });
  id.onChange(async (identity) => {
    if (identity && identity.level >= 1) await id.core.login();
  });
</script>
<button data-e9-login>Log in</button>
<div data-e9-min-level="1" hidden>Logged-in content (soft gate)</div>
```

Core's `/api/auth/*` routes are on whenever the host has `SESSION_SECRET`
(setup writes it). Core takes the JWT `aud` from the page `Origin` header, so
no Domain configuration is needed when the pages and `/api` share a host.

## Roles and `minLevel`

**Segment roles** live in core (`role_id === segment_id`). Example from the
festival demo:

- VIP: scopes `data:read`, `requiredAuth.minLevel = 1`
- Admin: scopes `admin`, `requiredAuth.minLevel = 3`

`requiredAuth.twoFactor` still applies on top of the Identity Level.

**Declared roles** in `@engine9/id` use the same `requiredAuth` shape for soft
UI before `person_segment` exists. Graduate by setting `segment_id` + `scopes`
and enforcing in core — see [declared-roles.md](./declared-roles.md).

## People form fields

Public register / `POST /people` payloads should use interface names:
`given_name`, `family_name`, `email`, `email_type` (and optionally `phone`,
`phone_type`). See [forms.md](./forms.md).

## Email on `person`

Core copies Profile email onto the person record only when
`email_verified` is true (Level ≥ 2). Self-asserted emails stay on the token
for display; they do not pollute warehouse identity.
