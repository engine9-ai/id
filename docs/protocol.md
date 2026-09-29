# Delegate identity protocol

Canonical wire protocol for engine9 identity. Implementations:

- `delegate` (private) — issues Identity Tokens
- `@engine9/id` (open source) — browser client
- `@engine9/core` (open source) — optional Site server

Keep this file in sync with delegate routes. Vocabulary below is the only allowed
product language in docs and APIs (except the JWT claim `aud`, which is RFC 7519).

## Vocabulary

- **UNID** — The person's identifier on delegate (UUIDv8, `unid` cookie).
  Minted per browser on first visit, then merged across browsers when the
  person signs in (see [UNID merge](#unid-merge)). Stays on delegate. Never
  sent to a Domain. Never contains PII.
- **Domain UNID** — This Domain's id for the person: `aud ":" hex`, an HMAC
  of the UNID under one delegate pepper. The JWT claim is `sub`. Stable on one
  Domain; another Domain receives a different value. The Domain stores it to
  recognize the person on return.
- **User** — The authenticated person on delegate (today: a Firebase user,
  `firebaseUid`). Holds one set of fields (name, email, phone, attributes,
  each contact with a verified flag). Not core's warehouse `person_id`,
  and not an admin "user" on the engine9 server. The Firebase uid is never
  sent to a Domain.
- **Grant** — Remembered decision: share fields S with Domain D at Level L.
  Also stores what D requested, split into required fields R and optional
  fields O. Keyed by (`firebase_uid`, `domain`). Created by the consent
  page; revocable. A declined field was requested and is not in S.
- **Domain** — The login consumer, identified by `host` or `host:port` when the
  port is not the default for the scheme (443 for https, empty for default http).
  Examples: `festival.engine9.ai`, `localhost:3000`. Query params and client
  APIs use `domain`. The JWT claim is still `aud` (RFC 7519) because verifiers
  check that name; `aud` equals the Domain string (not a full origin URL).
- **Identity Level** (0–7) — Confidence ladder. Delegate implements 0–4;
  5–7 reserved. Levels are not authorization.
- **Identity Token** — Delegate-signed JWT (ES256) asserting `sub` (Domain
  UNID), `fields`, `level`, `auth` for one `aud`.
  Short-lived. Verifiable via JWKS. Does not contain the UNID.
- **Core Session** — Optional HMAC token a core Site mints after verifying an
  Identity Token. Holds `personId`, `roles`, `domainUnid`,
  `level`, `auth`. A
  cache of verified identity plus Site-only facts. Never required for
  authentication.
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
  "fields_endpoint": "https://delegate.engine9.ai/user/fields",
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
  `sub`, `aud`, `iat`, `exp`, `jti`. Other claims (`merged_from`, `level`,
  `fields`, `auth`, `grant`, `nonce`) are private claims agreed by this
  protocol. `fields` is the values the User shared with this Domain.
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
| `sub` | Domain UNID: `aud ":" hex` (formula below). Every token, every Level |
| `aud` | Domain (`host` or `host:port`; product term is Domain). Also the HMAC namespace |
| `iat`, `exp` | Unix seconds. Default TTL 3600s |
| `jti` | Unique token id |
| `nonce` | Echo of client nonce when supplied |
| `merged_from` | Optional. An earlier Domain UNID for the same person (see [UNID merge](#unid-merge)) |
| `level` | Integer 0–4 achieved for this token |
| `fields` | Present when `level >= 1` and at least one shared field has a value |
| `auth` | `{ provider?, amr, auth_time?, two_factor }` |
| `grant` | `{ id, granted_at, requested, required, shared }` when a Grant exists |
| `verified_claims` | Reserved for Levels 5–7 (OpenID IDA). Not emitted now |

Both ids use one Worker secret, `UNID_PEPPER`. The Domain string (`aud`) is
the namespace and the prefix. There is no per-domain salt in the `domain`
table, and minting a token does not read D1 or `DOMAINS_KV` to compute these
values. The hex part is lowercase (64 characters):

```text
sub = aud ":" hex(HMAC-SHA256(UNID_PEPPER, "unid" ‖ 0x00 ‖ aud ‖ 0x00 ‖ unid))
```

`0x00` is a single zero byte. Verifiers reject a `sub` that does not start
with `aud ":"`.

`fields` shape (only fields the User shared; verified flags only with
that contact):

```json
{
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

The Firebase uid is never on a token. An Engine9 API host keys operator
accounts by the Domain UNID for its own Domain.

`amr` values: `pwd`, `otp`, `mfa`, `swk` (and Firebase provider strings as
needed).

## UNID merge

A new browser gets its own UNID. When the person signs in, delegate makes the
UNID paired first to that Firebase user canonical:

1. The Firebase user has no UNID yet: this browser's UNID becomes canonical.
2. The Firebase user already has a canonical UNID and this browser's UNID is
   unpaired: delegate rewrites the `unid` cookie to the canonical UNID and
   keeps `unid_alias:<old>` → canonical for 90 days. The browser also gets a
   `unid_merged` cookie naming the old UNID.
3. This browser's UNID belongs to a different Firebase user (a shared
   browser): the browser switches to the signed-in user's canonical UNID, or a
   fresh one, with no merge.

While the alias is live, each token for that browser carries
`merged_from`: the Domain UNID the old UNID had on that Domain. A Domain links
`merged_from` to the person it already knows under `sub`. Sending it again is
harmless.

## Authorize (redirect)

`GET /identity/authorize`

Query:

- `domain` — consumer Domain (required)
- `return_to` — absolute URL on that Domain (required)
- `min_level` — 0–4 (default 0)
- `max_level` — 0–4 (optional cap)
- `fields` — comma-separated required field names. When both this and `optional_fields` are empty, required defaults to `display_name,email`. A logged-out Level 0 request returns before that default.
- `optional_fields` — comma-separated optional field names
- `prompt` — `none` \| `select` \| `consent` \| `login`
- `nonce`, `state` — opaque client values
- `response_mode` — `fragment` (default) or `query`

Rules:

- `domainFromUrl(return_to)` must equal `domain`.
- `domain` must pass `ALLOWED_DOMAINS` or be listed in the `domain` table
  with `allowed = 1`.
- `return_to` on `/login`, `POST /auth/session`, `/identity/logout`, and
  `/whoami/bridge` uses that same allow rule.

Behavior:

1. Resolve UNID and the User session. Find the active Grant for (User, Domain).
2. If `prompt` is `none` or unset, and the Grant already covers this request
   (every requested field was answered before, every required field is shared
   and has a value) at `min_level`, issue a token silently. A previously
   declined optional field does not re-prompt.
3. If `prompt=none` and that is not possible, redirect with
   `error=interaction_required` (or `login_required`).
4. Otherwise show consent: required fields locked, optional fields as
   checkboxes, "Stay anonymous (Level 0)", and login when required. On Share,
   `requested` is the union of the old list and this request, `required` is
   this request's required list, and `shared` is what the User checked.
   Declining a required field is the anonymous outcome (`level_unavailable`
   when `min_level > 0`). Staying anonymous does not revoke an existing Grant.

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

Top-level popup so SameSite=Lax cookies apply. Same consent logic as authorize.
On success, `postMessage` to `window.opener`:

```json
{ "type": "delegate-identity", "token": "<jwt>", "state": "<state>" }
```

On failure (`prompt=none` not satisfiable, or the User declined a required
field while `min_level > 0`) the same message carries an error
code instead of a token, then the popup closes:

```json
{ "type": "delegate-identity", "error": "level_unavailable", "state": "<state>" }
```

Codes are the same as the authorize `error=` codes. `@engine9/id` rejects
`requestIdentity` with that code; a popup closed by the User without a
message rejects with `access_denied`.

`targetOrigin` is the Domain’s page origin (`return_to` origin). Then the popup closes.

`GET /whoami` returns `{ unid, isNew, loggedIn, email, signInProvider }` for this browser, without an Identity Token. `GET /whoami/bridge?origin=` is the top-level popup that posts `{ "type": "delegate-whoami", unid, isNew, loggedIn, email, signInProvider }`.

## Fields and Grants (same-origin, User session required)

- `GET /user/fields`
- `PATCH /user/fields`
- `GET /grants`
- `PATCH /grants/:id` — body `{ shared }`
- `DELETE /grants/:id` — revoke a Domain
- `POST /user/verify/email` — start Level 2 email confirmation
- `POST /user/verify/phone` — start Level 2 phone confirmation
- `POST /user/verify/confirm` — `{ channel, code }`

Human page: `GET /user` — manage fields and connected Domains. The page posts `POST /grants/:id/fields` to change what is shared.

## Logout

- `POST /auth/logout` — ends the User session on delegate (existing).
- `GET /identity/logout?domain=&return_to=` — redirect-style logout so a Domain
  can end the delegate session and return. Redirects only when `return_to` is
  on that `domain` and the domain is allowed (`ALLOWED_DOMAINS` or
  `domain.allowed = 1`).

## Level assignment

Implemented in delegate `src/lib/levels.ts`.

- **0 Inferred** — No Grant. No `fields` claim.
- **1 Provided** — The User shared fields, and none of those contacts are verified.
- **2 Contact Confirmed** — The User has `email_verified` or
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
- Core Site: same JWT verification (no shared secret). Maps `sub` (and
  `merged_from`, when present) → `person_id`, loads Roles gated by `level`,
  optionally mints a Core Session.
- Delegate: verifies Firebase ID tokens; assigns Levels; stores User fields and
  Grants; signs Identity Tokens.
