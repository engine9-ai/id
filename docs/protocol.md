# Delegate identity protocol

Canonical wire protocol for engine9 identity. Implementations:

- `delegate` (private) — issues Identity Tokens
- `@engine9/id` (open source) — browser client
- `@engine9/core` (open source) — optional Site server

Keep this file in sync with delegate routes. Vocabulary below is the only allowed
product language in docs and APIs (except the JWT claim `aud`, which is RFC 7519).

## Vocabulary

- **UNID** — Browser-scoped anonymous identifier minted by delegate (UUIDv8,
  `unid` cookie). Level 0 evidence. Never contains PII.
- **User** — The authenticated person on delegate (today: a Firebase user,
  `firebaseUid`). Owns one or more Profiles. Never exposed to Domains as an id.
  Not core's warehouse `person_id`, and not an admin "user" on the engine9
  server.
- **Profile** — A persona the User chooses to present to a Domain. Stable
  `profile_id`, optional display name and contact fields (each with a verified
  flag). Every User has at least one Profile (created on first login). The
  **Anonymous Profile** is the implicit UNID-only profile (Level 0).
- **Grant** — Remembered decision: share Profile P with Domain D at Level L
  (fields F). Keyed by (`profile_id`, `domain`). Created by the chooser;
  revocable.
- **Domain** — The login consumer, identified by `host` or `host:port` when the
  port is not the default for the scheme (443 for https, empty for default http).
  Examples: `festival.engine9.ai`, `localhost:3000`. Query params and client
  APIs use `domain`. The JWT claim is still `aud` (RFC 7519) because verifiers
  check that name; `aud` equals the Domain string (not a full origin URL).
- **Identity Level** (0–7) — Confidence ladder. Delegate implements 0–4;
  5–7 reserved. Levels are not authorization.
- **Identity Token** — Delegate-signed JWT (ES256) asserting `unid`,
  `profile`, `level`, `auth` for one `aud`. Short-lived. Verifiable via JWKS.
- **Core Session** — Optional HMAC token a core Site mints after verifying an
  Identity Token. Holds `personId`, `roles`, `unid`, `level`, `auth`. A cache
  of verified identity plus Site-only facts. Never required for authentication.
- **Role** — Core authorization (`role_id === segment_id`). Not an identity
  concept. Roles may require `minLevel` and/or `twoFactor`.
- **Session Bridge** — HMAC carrier of Firebase tokens to engine9 API hosts
  (MCP). Used by conductor-ui. Not this protocol.

## Discovery

`GET /.well-known/delegate-configuration`

```json
{
  "issuer": "https://delegate.engine9.ai",
  "jwks_uri": "https://delegate.engine9.ai/.well-known/jwks.json",
  "identity_authorize_endpoint": "https://delegate.engine9.ai/identity/authorize",
  "identity_bridge_endpoint": "https://delegate.engine9.ai/identity/bridge",
  "logout_endpoint": "https://delegate.engine9.ai/identity/logout",
  "profile_endpoint": "https://delegate.engine9.ai/profiles",
  "levels_supported": [0, 1, 2, 3, 4],
  "token_signing_alg_values_supported": ["ES256"]
}
```

`GET /.well-known/jwks.json` — current + previous public keys, each with a
distinct `kid`. `Content-Type: application/jwk-set+json`.
`Cache-Control: public, max-age=3600`. A previous key with the same `kid` as
the current key is omitted.

## Standards

Identity Tokens are JSON Web Tokens. Issuance and verification follow:

- **RFC 7519** — JWT. Header `typ` is `JWT`. Registered claims in use: `iss`,
  `sub`, `aud`, `iat`, `exp`, `jti`. Other claims (`unid`, `level`, `profile`,
  `auth`, `grant`, `nonce`) are private claims agreed by this protocol.
- **RFC 7515** — compact JWS serialization.
- **RFC 7518** — `alg` is `ES256` only (ECDSA using P-256 and SHA-256).
- **RFC 7517** — public keys are a JWK Set (`{"keys":[...]}`) at the URL in
  `jwks_uri`. Response media type is `application/jwk-set+json`. Each key
  publishes `kty`, `crv`, `x`, `y`, `kid`, `use` (`sig`), and `alg`. Private
  `d` is never published. `use` and `key_ops` are not sent together.
- **RFC 8725** — verifiers pin `alg` to ES256, require `kid` when more than
  one key is published, and check `iss`, `aud`, and `exp`.

This protocol is **not OAuth 2.0** (RFC 6749) and **not OpenID Connect**.
There is no client registration, authorization code, token endpoint, or
`grant_type`. Discovery is `/.well-known/delegate-configuration`, not
`/.well-known/oauth-authorization-server` (RFC 8414) or
`/.well-known/openid-configuration`. The delivered parameter is
`delegate_token`, not `access_token` or `id_token`. `jwks_uri` is the same
field name those specs use; here it only locates the JWK Set.

## Identity Token (JWT, ES256)

Header: `{ "alg": "ES256", "kid": "<key id>", "typ": "JWT" }`

Claims:

| Claim | Meaning |
| ----- | ------- |
| `iss` | Issuer, e.g. `https://delegate.engine9.ai` |
| `sub` | `profile_id`, or `unid:<unid>` for the Anonymous Profile |
| `aud` | Domain (`host` or `host:port`; product term is Domain) |
| `iat`, `exp` | Unix seconds. Default TTL 3600s |
| `jti` | Unique token id |
| `nonce` | Echo of client nonce when supplied |
| `unid` | Browser UNID |
| `level` | Integer 0–4 achieved for this token |
| `profile` | Present when `level >= 1`. Fields filtered by Grant |
| `auth` | `{ provider?, amr, auth_time?, two_factor }` |
| `grant` | `{ id, granted_at, fields }` when a Grant exists |
| `verified_claims` | Reserved for Levels 5–7 (OpenID IDA). Not emitted now |

`profile` shape:

```json
{
  "id": "<profile_id>",
  "display_name": "Alex",
  "given_name": "Alex",
  "family_name": "Rivera",
  "email": "alex@example.com",
  "email_verified": true,
  "phone": "+15555550100",
  "phone_verified": false,
  "attributes": {}
}
```

`amr` values: `pwd`, `otp`, `mfa`, `swk` (and Firebase provider strings as
needed).

## Authorize (redirect)

`GET /identity/authorize`

Query:

- `domain` — consumer Domain (required)
- `return_to` — absolute URL on that Domain (required)
- `min_level` — 0–4 (default 0)
- `max_level` — 0–4 (optional cap)
- `fields` — comma-separated profile field names
- `prompt` — `none` \| `select` \| `consent` \| `login`
- `nonce`, `state` — opaque client values
- `response_mode` — `fragment` (default) or `query`

Rules:

- `domainFromUrl(return_to)` must equal `domain`.
- `domain` must pass `ALLOWED_DOMAINS` or be listed in the `domain` table
  with `allowed = 1`.

Behavior:

1. Resolve UNID; resolve User session; find Grant for (chosen Profile, Domain).
2. If a Grant already satisfies `min_level` and `prompt` is `none` or unset,
   issue a token silently.
3. If `prompt=none` and that is not possible, redirect with
   `error=interaction_required` (or `login_required`).
4. Otherwise show the chooser: Profiles (fields + level each would share),
   "Stay anonymous (Level 0)", "Add profile", and login / step-up when
   required. Persist a Grant on continue.

Success:

- Default: `return_to#delegate_token=<jwt>&state=<state>` (fragment so the
  token does not appear in server access logs).
- `response_mode=query`: `return_to?delegate_token=<jwt>&state=<state>`
  (server-side callbacks such as demo `/auth/delegate`).

Error: `return_to?error=<code>&state=<state>`

Codes: `interaction_required`, `login_required`, `level_unavailable`,
`access_denied`, `invalid_domain`, `invalid_request`.

## Bridge (popup)

`GET /identity/bridge?domain=<host[:port]>&min_level=&prompt=&nonce=&state=`

Top-level popup so SameSite=Lax cookies apply. Same chooser logic as authorize.
On success, `postMessage` to `window.opener`:

```json
{ "type": "delegate-identity", "token": "<jwt>", "state": "<state>" }
```

`targetOrigin` is the Domain’s page origin (`return_to` origin). Then the popup closes.

Deprecated alias: `GET /profile/bridge` still posts
`{ "type": "delegate-profile", unid, isNew, loggedIn, email, signInProvider }`.

## Profiles and Grants (same-origin, User session required)

- `GET /profiles` — list
- `POST /profiles` — create
- `PATCH /profiles/:id`
- `DELETE /profiles/:id`
- `GET /profiles/:id/grants`
- `DELETE /grants/:id` — revoke a Domain
- `POST /profiles/:id/verify/email` — start Level 2 email confirmation
- `POST /profiles/:id/verify/phone` — start Level 2 phone confirmation
- `POST /profiles/:id/verify/confirm` — `{ channel, code }`

Human page: `GET /user` — manage Profiles and connected Domains.

## Logout

- `POST /auth/logout` — ends the User session on delegate (existing).
- `GET /identity/logout?domain=&return_to=` — redirect-style logout so a Domain
  can end the delegate session and return.

## Level assignment

Implemented in delegate `src/lib/levels.ts`.

- **0 Inferred** — UNID present, no Profile shared.
- **1 Provided** — Profile shared with at least one self-asserted field, none
  of those contacts verified.
- **2 Contact Confirmed** — Shared Profile has `email_verified` or
  `phone_verified`, or the User signed in with Firebase `password` /
  `emailLink` and the email is verified.
- **3 Trusted Provider Confirmed** — User authenticated via a provider in
  `TRUSTED_PROVIDERS` (default `google.com`), and `auth_time` is within
  `MAX_AUTH_AGE_SECONDS` (default 86400).
- **4 Trusted Provider Strongly Confirmed** — Level 3 plus Firebase
  `sign_in_second_factor` or `amr` includes `mfa` / `swk`. Freshness default
  3600s.

Achieved level is `min(evidence, max_level)`. If still `< min_level` after
interaction, `level_unavailable`.

## Trust

- Browser (`@engine9/id`): verify ES256 via JWKS, `iss`, `aud` = own Domain,
  `exp` (±60s skew), `nonce`. Safe for personalization and step-up. Cannot
  learn `person_id` or Roles.
- Core Site: same JWT verification (no shared secret). Maps `unid` /
  `profile_id` → `person_id`, loads Roles, optionally mints a Core Session.
- Delegate: verifies Firebase ID tokens; assigns Levels; stores Profiles and
  Grants; signs Identity Tokens.
