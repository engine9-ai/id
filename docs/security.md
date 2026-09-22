# Security model

## What the browser can trust

After `@engine9/id` verifies an Identity Token (ES256 via JWKS, `iss`, `aud`
= this Domain, `exp` ±60s, optional `nonce`):

- The token was minted by delegate for this Domain.
- `level` and `profile` fields are what the User granted.
- Safe uses: personalization, UI, deciding to step up.

The browser cannot learn core `person_id` or Roles.

## What a core Site server can trust

The same JWT, verified the same way (or via `jose` + JWKS). Plus warehouse
facts (`person_id`, Roles) after mapping `unid` / `profile_id`.

## Threats and mitigations

- **Token in server logs.** Default `response_mode=fragment` puts
  `delegate_token` in the URL hash. Use `query` only for server callbacks
  (demo `/auth/delegate`) and do not log the full query string.
- **Popup spoofing.** Accept `postMessage` only from the delegate origin;
  type must be `delegate-identity`; verify the JWT before storing.
- **CSRF / mix-up.** Send `state` and `nonce`; echo-check on callback.
- **JWKS swap.** Fetch JWKS from the discovered `jwks_uri` on the same
  issuer; cache by `kid`; pin `iss`.
- **Clock skew.** 60 second leeway on `exp` / `iat`.
- **Logout.** Clearing Site storage does not end the delegate User session.
  Call `/identity/logout` when the product should sign the User out of
  delegate as well.
- **Level 0 UNID.** A cookie identifier, not a person. Do not treat it as
  login.
- **Self-asserted email.** Level 1 `profile.email` is a claim the User typed.
  Do not merge it into warehouse identity until Level ≥ 2.

## Session Bridge (not this library)

conductor-ui stores Firebase ID tokens from an HMAC session-bridge that the
SPA does **not** verify. That is a different, higher-trust-host pattern.
See conductor-ui `docs/auth.md`.
