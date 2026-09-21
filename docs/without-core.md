# Using `@engine9/id` without core

A Site can run identity without an engine9 core database. The browser talks
only to an identity provider (default: **delegate**), verifies Identity Tokens
via JWKS, and uses the payload for personalization and step-up. It cannot learn
`person_id` or **segment** Roles.

See [protocol.md](./protocol.md) for the wire format. Soft content roles:
[declared-roles.md](./declared-roles.md). Form field names: [forms.md](./forms.md).
Working example: [`id-demo`](../../id-demo).
First-time steps: [deploy.md](./deploy.md).

## What you can do client-only

- Obtain a UNID (Level 0) and know whether this browser already has a delegate
  User session.
- Request identity at a minimum Identity Level; receive and verify a token.
- Read Profile fields the User consented to share (Levels 1–4).
- Store the token (sessionStorage by default), refresh with `prompt=none`,
  log out locally.
- Declare **page-local roles** with `requiredAuth.minLevel` and soft-show
  content (never a hard gate).
- Submit self-asserted Level 1 data with interface field names
  (`given_name`, `family_name`, `email`, `email_type`, …) to *your* backend if
  you have one.
- Swap the default Delegate provider via `createEngine9Id({ provider })` when
  another issuer can produce the same Identity shape.

## What you must not do client-only

- Authorize privileged actions from the token alone. Levels are confidence,
  not Roles. Anyone who can run JavaScript on the page can read a stored
  token.
- Treat declared-role visibility as membership in a warehouse segment.
- Treat `email` as proven unless `email_verified` is true and `level >= 2`.
- Skip `aud` / `iss` / `exp` / `nonce` checks.

## Minimal flow

1. Register the Site origin with delegate (`ALLOWED_RETURN_ORIGINS` or the
   `site` table).
2. On load, `handleCallback()` in case the user is returning from authorize.
3. On a user gesture, `requestIdentity({ minLevel, mode: "popup" })`.
4. Render UI from `getIdentity()` — Level badge, display name, email.
5. Optionally evaluate declared roles with `evaluateDeclaredRole` /
   `visibleContent` for soft sections.
6. When the token is near expiry, `ensureLevel(n)` (silent, then interactive).

Level 0 is always available: a UNID with no Profile shared. Use it for
anonymous analytics and “continue as anonymous” affordances.
