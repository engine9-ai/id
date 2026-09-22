---
name: e9-id-troubleshoot
description: >-
  Diagnose @engine9/id and delegate identity failures: popup blocked,
  interaction_required, invalid_domain, JWKS fetch, SameSite, Bot Fight on
  localhost, fragment vs query tokens. Use when login redirect fails or
  identity tokens will not verify.
---

# Troubleshoot identity

## Popup blocked

`requestIdentity({ mode: "popup" })` needs a user gesture. If `window.open`
returns null, retry with `mode: "redirect"`.

## `error=invalid_domain`

The consumer Domain is not on `ALLOWED_RETURN_ORIGINS` and not in the `domain`
table. `domainFromUrl(return_to)` must equal `domain=`.

## `error=interaction_required` / `login_required`

`prompt=none` cannot complete silently (no Grant, or User session expired).
Retry without `prompt=none` so the chooser or `/login` can run.

## `error=level_unavailable`

Evidence after interaction is still below `min_level` (e.g. asked for 4 but
the User has no MFA). Lower `min_level` or send them to step-up (Google MFA).

## JWT will not verify

- `aud` must equal the configured Domain (`domainFromUrl(location.href)` by default).
- `iss` must equal the delegate origin from discovery.
- Fetch JWKS from `/.well-known/jwks.json`; match `kid`.
- Clock skew: 60s. Expired tokens need `ensureLevel` / re-authorize.
- Do not accept `postMessage` from any origin except delegate.

## SameSite / `/profile` fetch

`credentials: "include"` to `delegate.engine9.ai` from another origin will
**not** send Lax cookies. Use `/identity/bridge` (or deprecated
`/profile/bridge`) in a top-level popup.

## Localhost callbacks

Server callbacks on localhost use `response_mode=query` and
`?delegate_token=`. Verify that JWT with Delegate JWKS. There is no
server-to-server code exchange.

## Fragment vs query

Default success URL uses `#delegate_token=` (not in server logs). Server
callbacks (Astro `/auth/delegate`) must request `response_mode=query`.
If `handleCallback()` sees nothing, check hash vs search.
