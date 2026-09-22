# Using `@engine9/id` with `@engine9/core`

Core is optional. When a Site embeds `@engine9/core`, the browser still
obtains an Identity Token from an identity provider (default: **delegate**).
The Site server verifies that token (JWKS, no shared secret required) and maps
`unid` / `profile_id` to a warehouse `person_id` plus **segment** Roles.

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

`createEngine9Id({ core: { apiUrl, publicApiKey } })` exposes:

- `id.core.login()` — `POST /auth/login` with the Identity Token and an
  `e9publickey_` key (`public` scope).
- `id.core.me()` — `GET /auth/me`
- `id.core.changeRole(roleId)` — `POST /auth/role`
- `id.core.fetch(path, init)` — adds the public key and session/token headers

Create the public key with `e9 create-api-key --scopes public`.

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

## Legacy handoff

Sites that still use `DELEGATE_SHARED_SECRET` and `?delegate_code=` /
`?delegate_bridge=` continue to work. Prefer Identity Tokens for new Sites.
