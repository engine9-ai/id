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
  each contact with a verified flag). A User may hold several email
  addresses; one is the default. Not core's warehouse `person_id`,
  and not an admin "user" on the engine9 server. The Firebase uid is never
  sent to a Domain.
- **Grant** — Remembered decision: share fields S with Domain D at Level L.
  Also stores what D requested, split into required fields R and optional
  fields O, and which of the User's email addresses D receives. Keyed by
  (`firebase_uid`, `domain`). Created by the consent page; revocable. A
  declined field was requested and is not in S.
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
  "logout_bridge_endpoint": "https://delegate.engine9.ai/identity/logout/bridge",
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
| `iat`, `exp` | Unix seconds. Default TTL 28800s (8 hours); Domains may request longer via `expires_in` (max 30 days) |
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
that contact). `email` is the address the User chose for this Domain, and
`email_verified` is that address's flag:

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
- `prompt` — `none` \| `select` \| `consent` \| `login`. `select` and
  `consent` always show the consent page, even when the Grant already
  covers the request (see [Change your Delegate information](#change-your-delegate-information)).
  `login` sends a signed-out browser to sign in first.
- `login_level` — `2` or `3` (default `3`). Which sign-in screen a
  signed-out browser sees. `3` offers Google only; `2` adds an email sign-in
  link. Ignored (treated as `3`) when `min_level` is 3 or more. See
  [Sign-in screen](#sign-in-screen-login_level).
- `nonce`, `state` — opaque client values
- `response_mode` — `fragment` (default) or `query`
- `expires_in` — Identity Token lifetime in seconds (default `28800`, 8 hours).
  Values above `2592000` (30 days) are clamped to that max. Missing,
  empty, zero, negative, or non-numeric values use the default.

Rules:

- `domainFromUrl(return_to)` must equal `domain`.
- `return_to` must be `https:`, or `http:` on `localhost` / `127.0.0.1`.
  Any other `http:` page gets a `400` HTML page that tells the visitor the
  connection is not secure (`insecure_domain`). Delegate does not redirect
  back to that page.
- `domain` must pass `ALLOWED_DOMAINS` or be listed in the `domain` table
  with `allowed = 1`.
- `return_to` on `/login`, `POST /auth/session`, `/identity/logout`, and
  `/whoami/bridge` uses that same allow rule.

Behavior:

1. Resolve UNID and the User session. Find the active Grant for (User, Domain).
2. If `prompt` is `none` or unset, and the Grant already covers this request
   (every requested field was answered before, every required field is shared
   and has a value, and the email address it chose is still on the User) at
   `min_level`, issue a token silently. A previously declined optional field
   does not re-prompt.
3. If `prompt=none` and that is not possible, redirect with
   `error=interaction_required` (or `login_required`).
4. Otherwise show consent: required fields locked, optional fields as
   checkboxes, the User's email addresses to pick from (the Grant's choice,
   else the default, preselected), a link to add another address, a link to
   use a different Google account, "Stay anonymous (Level 0)", and login when
   required. On Share, `requested` is the union of the old list and this
   request, `required` is this request's required list, `shared` is what the
   User checked, and the picked address is stored on the Grant. A picked
   address that is not on the User is `invalid_request`. Declining a required
   field is the anonymous outcome (`level_unavailable` when `min_level > 0`).
   Staying anonymous does not revoke an existing Grant.

Success:

- Default: `return_to#delegate_token=<jwt>&state=<state>` (fragment so the
  token does not appear in server access logs).
- `response_mode=query`: `return_to?delegate_token=<jwt>&state=<state>`
  (server-side callbacks such as demo `/auth/delegate`).

Error: `return_to?error=<code>&state=<state>`

Codes: `interaction_required`, `login_required`, `level_unavailable`,
`access_denied`, `invalid_domain`, `invalid_request`.

`insecure_domain` is never sent to `return_to`. Delegate shows it as a page
(above). `@engine9/id` raises it itself before it opens a popup or
redirects. Its `requestIdentity` rejects with `insecure_domain` on any plain
`http:` page other than `localhost` / `127.0.0.1`.

## Sign-in screen (`login_level`)

When a request needs a signed-in User and the browser has no Delegate
session, `/identity/authorize` and `/identity/bridge` redirect to
`/login?return_to=<the same request>`. Delegate has two sign-in screens.

| `login_level` | Screen | Sign-in methods | Highest Level that sign-in can reach |
| --- | --- | --- | --- |
| omitted, `3`, or `4` (default) | Trusted provider | Sign in with Google | 4 (3, plus a second factor) |
| `2` | Contact confirmation | Sign in with Google, **or** "Email me a sign-in link" | 2 for the email link; 3–4 for Google |

Why the default has no email link: a link in an inbox proves the person
controls that address. That is Level 2 (Contact Confirmed), never Level 3.
A site that needs Level 3 or 4 would accept the email-link sign-in and then
still fail with `level_unavailable`. So the email link is offered only when
the Domain asks for it.

Rules:

- The Domain chooses with `login_level` on `/identity/authorize` or
  `/identity/bridge`. Delegate carries it to `/login` as `login_level=2`.
  Any value other than `2` means the default screen.
- `min_level` of 3 or more always gets the default screen, even with
  `login_level=2`.
- The screen only limits which buttons are shown. It does not set or cap
  the token's `level`. Level assignment ([below](#level-assignment)) and
  `min_level` / `max_level` still decide it. A User who already has a
  Delegate session (from either screen) is not shown a sign-in screen.
- An email link opened later finishes on whichever screen it lands on. The
  link returns to the `/login` URL that sent it, including `login_level=2`.
- Sites that link to `/login` directly (not through authorize) can add
  `login_level=2` themselves.

Typical choices:

| The site needs | Send |
| --- | --- |
| Level 0–1 (a name, a newsletter signup) and wants the fewest steps for people without Google | `min_level=1&login_level=2` |
| Level 2: an email address the person really receives | `min_level=2&login_level=2` |
| Level 3–4: a trusted provider (members' areas, admin, payments) | `min_level=3` (no `login_level`) |
| No preference | nothing: Google only |

`@engine9/id`: `createEngine9Id({ loginLevel: 2 })` or `mount({ loginLevel: 2 })`
for every login, `requestIdentity({ …, loginLevel: 2 })` for one request, or
`data-e9-login-level="2"` on a login button. `@engine9/core`:
`auth.identityUrl({ …, loginLevel: 2 })`.

## Bridge (popup)

`GET /identity/bridge?domain=<host[:port]>&min_level=&prompt=&login_level=&expires_in=&nonce=&state=`

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

Without `return_to`, that origin is `https://<domain>` (`http://` for
`localhost` / `127.0.0.1`). A plain `http:` opener would never receive the
message. When the `Referer` is a plain `http:` page on the same Domain, the
bridge shows the `insecure_domain` refusal page (`400`) and issues no token.

`GET /whoami` returns `{ unid, isNew, loggedIn, email, signInProvider }` for this browser, without an Identity Token. `GET /whoami/bridge?origin=` is the top-level popup that posts `{ "type": "delegate-whoami", unid, isNew, loggedIn, email, signInProvider }`.

## Change your Delegate information

A signed-in person can land on a Domain with the wrong address. For
example, a site accepts only the address it has on file, and the person
shared a different one. Show a **Change your Delegate information** button.
It repeats the Domain's usual request with `prompt=select`
(`/identity/authorize` or `/identity/bridge`). Delegate shows the consent
page with the current Grant preselected. The person picks another address,
adds one, or changes what is shared. Share updates the Grant and issues a
new Identity Token. `sub` does not change because the User is the same.

"Use a different Google account" on that page signs in as another User.
That User has a different UNID, so the Domain receives a different `sub`.
Adding an address keeps one User and one `sub` per Domain.

`@engine9/id`: `id.changeDelegateInfo()` or a `data-e9-change-delegate`
element. A server-side Site adds `prompt=select` to its usual authorize URL
(`auth.identityUrl({ …, prompt: 'select' })` in `@engine9/core`).

Sites should show this button to signed-in people unless they request no
fields. Without it, a person with the wrong address has no way out: logging
in again goes straight through with the remembered Grant. Put it next to Log
out and on any access-denied message. Delegate needs no per-Domain setting
for it.

## Fields and Grants (same-origin, User session required)

- `GET /user/fields`
- `PATCH /user/fields` — setting `email` adds that address and makes it the default
- `GET /user/emails` — `{ emails: [{ email, verified, default }] }`
- `POST /user/emails` — body `{ idToken }`: a Firebase ID token for the new
  address (another Google account or an email sign-in link) with
  `email_verified: true`. Adds the address as verified. The session stays on
  the current User. Errors: `invalid_id_token`, `missing_email`,
  `email_unverified`
- `DELETE /user/emails/:email` — remove an address. Grants that chose it
  show consent on next use
- `GET /grants` — each Grant includes `email` (its chosen address, or null
  for the default)
- `PATCH /grants/:id` — body `{ shared, email? }`. `email` must be one of the
  User's addresses (`invalid_request` otherwise)
- `DELETE /grants/:id` — revoke a Domain
- `POST /user/verify/email` — start Level 2 email confirmation
- `POST /user/verify/phone` — start Level 2 phone confirmation
- `POST /user/verify/confirm` — `{ channel, code }`

Human page: `GET /user/emails/add?return_to=<path>` adds an address, then
returns to a path on delegate (the consent page links here).

## Logout

- `POST /auth/logout` — ends the User session on delegate (existing).
- `GET /identity/logout?domain=&return_to=` — redirect-style logout so a Domain
  can end the delegate session and return. Redirects only when `return_to` is
  on that `domain` and the domain is allowed (`ALLOWED_DOMAINS` or
  `domain.allowed = 1`).
- `GET /identity/logout/bridge?domain=&return_to=` — popup logout. Ends the
  User session like `/identity/logout`, then posts
  `{ "type": "delegate-logout", "loggedOut": true }` to `window.opener` and
  closes. `targetOrigin` is the `return_to` origin (default
  `https://<domain>`), checked with the same rules as `/identity/bridge`. A
  Domain that is not allowed gets `400 { "error": "invalid_domain" }`.
  `@engine9/id`: `id.logout({ delegate: true, mode: 'popup' })`.

## Level assignment

Implemented in delegate `src/lib/levels.ts`.

- **0 Inferred** — No Grant. No `fields` claim.
- **1 Provided** — The User shared fields, and none of those contacts are verified.
- **2 Contact Confirmed** — The User has `email_verified` or
  `phone_verified`, or the User signed in with Firebase `password` /
  `emailLink` and the email is verified. Email-link sign-in is offered only
  on the `login_level=2` screen ([Sign-in screen](#sign-in-screen-login_level)).
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
