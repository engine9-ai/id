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

`issuer` is the origin of the Delegate that answered. `https://delegate.network`
is the default.

```json
{
  "issuer": "https://delegate.network",
  "jwks_uri": "https://delegate.network/.well-known/jwks.json",
  "identity_authorize_endpoint": "https://delegate.network/identity/authorize",
  "identity_bridge_endpoint": "https://delegate.network/identity/bridge",
  "logout_endpoint": "https://delegate.network/identity/logout",
  "logout_bridge_endpoint": "https://delegate.network/identity/logout/bridge",
  "fields_endpoint": "https://delegate.network/user/fields",
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
| `iss` | Issuer: the Delegate origin that signed the token, e.g. `https://delegate.network`. Verify against the one Delegate URL you configured; do not accept more than one issuer |
| `sub` | Domain UNID: `aud ":" hex` (formula below). Every token, every Level |
| `aud` | Domain (`host` or `host:port`; product term is Domain). Also the HMAC namespace |
| `iat`, `exp` | Unix seconds. Default TTL 28800s (8 hours), or 300s (5 minutes) with `response_mode=query`; Domains may request another lifetime via `expires_in` (max 30 days) |
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
  signed-out browser sees. `3` offers trusted providers only; `2` adds an
  email sign-in link. Ignored (treated as `3`) when `min_level` is 3 or more.
  See [Sign-in screen](#sign-in-screen-login_level).
- `login_providers` — comma-separated provider names in button order, from
  `google` and `facebook` (default `google`). Which provider buttons a
  signed-out browser sees. Delegate only offers providers its operator has
  enabled. See [Sign-in providers](#sign-in-providers-login_providers).
- `brand_name`, `brand_color`, `brand_logo`, `brand_wordmark`,
  `brand_background`, `brand_text`, `brand_card`, `brand_card_text`,
  `brand_font`, `brand_google` — optional sign-in branding.
  See [Branding](#branding).
- `login_hint` — optional email address of the person signing in, when the
  Domain already knows it. Delegate passes it to Google as `login_hint` so
  Google can skip its account chooser. It is ignored unless it looks like an
  email address, ignored with Facebook, and never changes who is signed in.
  Without it Delegate uses the Google address this browser last signed in
  with (kept in Delegate's `localStorage`, cleared by Delegate's own Sign
  out).
- `nonce`, `state` — opaque client values
- `response_mode` — `fragment` (default) or `query`
- `expires_in` — Identity Token lifetime in seconds. Default `28800`
  (8 hours), or `300` (5 minutes) with `response_mode=query`, where the
  token rides in the return URL and the server it reaches exchanges it at
  once. Values above `2592000` (30 days) are clamped to that max. Missing,
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
4. Otherwise show the share screen: required fields locked, optional fields
   as checkboxes, the User's email addresses to pick from (the Grant's
   choice, else the default, preselected), a link to add another address, and
   "Use a different account" (`/login?switch=1`, which opens the provider
   chooser or the single provider with `select_account`). A signed-out
   visitor is sent to `/login` first; the share screen never signs anyone
   in. Share stays disabled until every required field has a value. On
   Share, `requested` is the union of the old list and this
   request, `required` is this request's required list, `shared` is what the
   User checked, and the picked address is stored on the Grant. A picked
   address that is not on the User is `invalid_request`. Declining a required
   field is the anonymous outcome (`level_unavailable` when `min_level > 0`).

Success:

- Default: `return_to#delegate_token=<jwt>&state=<state>` (fragment so the
  token does not appear in server access logs).
- `response_mode=query`: `return_to?delegate_token=<jwt>&state=<state>`
  (server-side callbacks such as demo `/auth/delegate`). The URL reaches
  server logs, history, and `Referer`, so the default lifetime is 5 minutes.
  A server callback binds the return to the browser that started it: keep
  `state` and `nonce` in a short-lived HttpOnly cookie, sign nobody in
  unless the returned `state` matches it, and pass the `nonce` to the token
  check. `@engine9/core`'s `beginLogin()` / `finishLogin()` do this.

Error: `return_to?error=<code>&state=<state>`

Codes: `interaction_required`, `login_required`, `level_unavailable`,
`access_denied`, `invalid_domain`, `invalid_request`.

`insecure_domain` is never sent to `return_to`. Delegate shows it as a page
(above). `@engine9/id` raises it itself before it opens a popup or
redirects. Its `requestIdentity` rejects with `insecure_domain` on any plain
`http:` page other than `localhost` / `127.0.0.1`.

## When a Delegate screen appears

Sign-in has five steps. Delegate owns 2–4. The Domain owns 1 and 5.

1. **The Button** — the Domain's Login control (`@engine9/id` `loginWidget`,
   or a link to `/api/auth/start`). Signed in, it shows the role; signed out,
   it starts this flow.
2. **Provider Selector** (`/login`) — Google, Facebook, email link. Skipped
   when there is exactly one provider, or the visitor is already signed in
   to Delegate.
3. **The Provider** — Google, Facebook, or the emailed link. Skipped when
   that provider already has a session (`login_hint` helps Google pick).
4. **Share screen** (the consent page on `/identity/authorize`) — which
   fields, and which email, to send this Domain. The email may differ from
   the provider's. Skipped only when an active Grant already covers the
   request (`grantCoversRequest`).
5. **The Domain** — receives the Identity Token. Roles and the rest of The
   Button take over.

A first-time visitor to a Domain always sees step 4. That is Delegate's
value: they confirm what to share.

**Provider Selector (`/login`)** appears when the browser has no Delegate
session and `min_level` is above 0 (a signed-out Level 0 request is answered
silently), or `prompt=login` or `switch=1` was sent. It then stays on
screen, with its buttons, when any of these holds:

| Reason | Why |
| --- | --- |
| The request is a popup (`/identity/bridge`) | A browser blocks a window opened without a click, and the provider cannot run in the popup. |
| `login_providers` lists more than one provider | The person has to pick. |
| `login_level=2` (and `min_level` below 3) | The email-link field is on the screen. |
| `prompt=consent` | The person asked to review; the screen offers Continue or another account. |
| The Domain is not allowed | Delegate's own look, Google only. |
| The provider was cancelled or failed less than 10 minutes ago in this tab | The button returns so a cancel is not a loop. |
| Firebase could not load or start (blocked script, blocked helper page) | There is nothing to redirect with; the page explains why. |
| The page is an email-link landing | The link finishes the sign-in. |

**The Provider** is skipped when this browser is already signed in to that
provider. `login_hint` (the Domain's, else the last Google address in this
tab) lets Google skip its account chooser. "Use a different account" on the
share screen goes to `/login?switch=1`, which does not bounce a signed-in
visitor back and opens the single provider with `select_account` (or shows
the buttons when there are several).

**Share screen** appears after the visitor is signed in to Delegate when any
of these holds. A first visit always shows it.

| Reason | Why |
| --- | --- |
| No active Grant for this User and Domain | First visit: nothing has been shared yet. |
| The request asks for a field the Grant never saw | `fields` or `optional_fields` grew since the person last answered. |
| A required field is not shared, or has no value | For example `email` is required and the User has none. |
| The email address the Grant chose was removed | Delegate asks rather than send another one. |
| `prompt=select` or `prompt=consent` | The Domain asked for the screen. |

`prompt=none` never shows a screen: it answers with a token or an error
(`login_required` / `interaction_required`). A request with `min_level=0`
and no Delegate session returns an anonymous token and shows nothing.

## Sign-in screen (`login_level`)

When a request needs a signed-in User and the browser has no Delegate
session, `/identity/authorize` and `/identity/bridge` redirect to
`/login?return_to=<the same request>`. Delegate has two sign-in screens.

| `login_level` | Screen | Sign-in methods | Highest Level that sign-in can reach |
| --- | --- | --- | --- |
| omitted, `3`, or `4` (default) | Trusted provider | Sign in with Google (and Facebook when asked, see [Sign-in providers](#sign-in-providers-login_providers)) | 4 (3, plus a second factor) |
| `2` | Contact confirmation | The provider buttons, **or** "Email me a sign-in link" | 2 for the email link; 3–4 for a trusted provider |

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

Email links and other browsers:

- Delegate mails the link itself, branded for the Domain ("Sign in to
  {name}", from "{name} via Delegate"). The link works once.
- Opened in another tab of the browser that asked, it hands the sign-in to
  the tab that asked, which continues the original request (popup or
  redirect) as if Google had finished.
- Opened in a different browser or app (a phone's mail app, an in-app
  browser), the person confirms the address in the page and that browser is
  signed in to Delegate. Delegate does **not** replay the original
  `/identity/authorize` or `/identity/bridge` request there, because the
  site's `state` and `nonce` live in the browser that asked. It offers
  "Continue to {name}", which goes to the Domain's origin (`return_to`
  origin, else `https://<domain>`). The site's next request is answered
  from the new session.
- Sites must treat a callback whose `state` they do not recognize as "start
  sign-in again", not "your link expired". `@engine9/id` rejects it as
  `state_mismatch` and `mount()` / `loginWidget()` drop it quietly. A server
  callback with its own `state` restarts the login once.

## Sign-in providers (`login_providers`)

Optional, on `/identity/authorize` and `/identity/bridge`. Delegate stores
none of it: it is read from each request and carried to `/login` inside
`return_to`, like `login_level`.

| Value | Button | Firebase provider |
| --- | --- | --- |
| `google` (default) | Sign in with Google | `google.com` |
| `facebook` | Continue with Facebook | `facebook.com` |

Rules:

- A comma list in button order: `login_providers=google,facebook`. Unknown
  values and duplicates are dropped. An empty or unrecognized list means
  `google`.
- Delegate's operator limits the list with `ENABLED_PROVIDERS` (default
  `google.com`). A request can choose among enabled providers; it cannot turn
  one on. At the default screen (`login_level` 3, and always when `min_level`
  is 3 or more) the list is also limited to `TRUSTED_PROVIDERS`.
- Facebook is always shown with Google, when Google is enabled, so a person
  whose address already belongs to a Google User can finish (see below).
- A Domain that does not pass the allow rule gets Google only.
- One provider on a full-page login opens that provider by itself (the
  selector is skipped). A popup still shows the button: a browser blocks a
  window opened without a click.
- The Identity Token's `auth.provider` is the Firebase provider that signed
  the person in (`google.com` or `facebook.com`). Sites that check it must
  accept both when they ask for Facebook.
- Facebook may return no email, or one Facebook has not confirmed. Delegate
  does not mark a Facebook email verified. A Facebook sign-in can reach
  Level 3 (a trusted provider) while `fields.email_verified` is `false`.

One account per email: when a Facebook sign-in's address already belongs to
a Google User, Firebase refuses the second account. `/login` keeps the
Facebook credential for 10 minutes in this browser, tells the person
"<masked address> already signs in with Google. Continue with Google to add
Facebook.", highlights the Google button, and passes the address to Google as
`login_hint`. After the Google sign-in, if the Google address matches, it adds
Facebook to that User. A later Facebook sign-in then reaches the same User
and the same `sub`. A failure to add Facebook never stops the sign-in.

`@engine9/id`: `createEngine9Id({ loginProviders: ['google', 'facebook'] })`
or `mount({ loginProviders: [...] })` for every login,
`requestIdentity({ …, loginProviders })` for one request, or
`data-e9-login-providers="google,facebook"` on a login button.
`@engine9/core`: `auth.identityUrl({ …, loginProviders: ['google', 'facebook'] })`.

## Branding

Optional, on `/identity/authorize` and `/identity/bridge`. Delegate stores
none of it: it is read from each request and carried to `/login`. The
sign-in email takes the name, color, and logo; the rest style `/login`
only. Delegate's name stays in the footer and the email sender.

The consent page (choosing which fields to share) is never branded: it keeps
Delegate's neutral look whatever `brand_*` a request carries. This is an
explicit decision, so the page where a person decides what to share looks
like Delegate and not like the Domain asking.

| Param | Rule |
| --- | --- |
| `brand_name` | Display name, 1–60 characters, no `://` or `www.`. The Domain is always shown under it. Default: the Domain. |
| `brand_color` | `#rgb` or `#rrggbb`, for buttons and the monogram. Delegate picks white or near-black text on it. Default `#1a73e8`. |
| `brand_logo` | `https` image URL on the Domain's host or one of its subdomains (any scheme on `localhost`), up to 512 characters. Shown about 48px tall. Default: a monogram of the name's first letter. |
| `brand_wordmark` | A wide logo, same URL rule as `brand_logo`. Shown at the top of the card up to 240px wide and 120px tall, in place of the logo or monogram. Sign-in page only; the email keeps `brand_logo`. |
| `brand_background` | `#rgb` or `#rrggbb` for the page; the card is tinted from it unless `brand_card` is set. Default: Delegate's light gray page and white card. |
| `brand_text` | `#rgb` or `#rrggbb` for text on the background (on the white card when there is no `brand_background`). Ignored below 4.5:1 contrast. Default with a background: white or near-black, whichever reads. |
| `brand_card` | `#rgb` or `#rrggbb` for the card, in place of the tint, so it can contrast with the page. |
| `brand_card_text` | `#rgb` or `#rrggbb` for text on `brand_card`. Ignored below 4.5:1 contrast, and ignored without `brand_card`. Default: `brand_text` when it reaches 4.5:1 on the card, else white or near-black, whichever reads. |
| `brand_font` | `system`, `sans`, `serif`, `rounded`, `mono`, or a Google Fonts family name: letters, digits, and spaces, up to 40 characters (`IBM Plex Sans`). A family loads from `fonts.googleapis.com` at weights 400, 600, and 700, with the system font as fallback. Default `system`. |
| `brand_google` | `standard`, `brand`, or `skip`. See below. Default `standard`. |

`brand_google` sets the Google button's look on the Provider Selector:

- `standard`: Google's white "Sign in with Google" button.
- `brand`: the button takes `brand_color` and reads "Continue with
  Google", so it looks like the next step after the site's own Log in
  button rather than a second sign-in.
- `skip`: accepted; it does nothing extra. One provider already opens
  itself on a full-page login (see [When a Delegate screen appears](#when-a-delegate-screen-appears)).
  A popup still shows the button: a browser blocks a window opened without
  a click, and the provider cannot run inside the popup (its
  Cross-Origin-Opener-Policy cuts it off from the site). If the person
  comes back from the provider without signing in, that tab shows the
  button for the next 10 minutes instead of sending them back.

Values that break a rule are ignored. A Domain that does not pass the
allow rule gets Delegate's own look.

`@engine9/id`: `createEngine9Id({ brand: { name, color, logo, wordmark,
background, text, card, cardText, font, google } })`, or `requestIdentity({ …, brand })` for one
request. `@engine9/core`: `auth.identityUrl({ …, brand })`.

Typical choices:

| The site needs | Send |
| --- | --- |
| Level 0–1 (a name, a newsletter signup) and wants the fewest steps for people without Google | `min_level=1&login_level=2` |
| Level 2: an email address the person really receives | `min_level=2&login_level=2` |
| Level 3–4: a trusted provider (members' areas, admin, payments) | `min_level=3` (no `login_level`) |
| Facebook as well as Google | `login_providers=google,facebook` (works with any `login_level`) |
| No preference | nothing: Google only |

`@engine9/id`: `createEngine9Id({ loginLevel: 2 })` or `mount({ loginLevel: 2 })`
for every login, `requestIdentity({ …, loginLevel: 2 })` for one request, or
`data-e9-login-level="2"` on a login button. `@engine9/core`:
`auth.identityUrl({ …, loginLevel: 2 })`.

## Bridge (popup)

`GET /identity/bridge?domain=<host[:port]>&min_level=&prompt=&login_level=&login_providers=&brand_name=&brand_color=&brand_logo=&brand_wordmark=&brand_background=&brand_text=&brand_card=&brand_card_text=&brand_font=&brand_google=&expires_in=&nonce=&state=`

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

With no `window.opener` (the site's window closed, or the bridge opened in a
new tab), nothing is posted. The page says the person is signed in and links
to the Domain's origin.

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
- Core Site: same JWT verification (no shared secret), plus `nonce` when
  the server started the sign-in. Maps `sub` (and `merged_from`, when
  present) → `person_id`, loads Roles gated by `level`, optionally mints a
  Core Session.
- Delegate: verifies Firebase ID tokens; assigns Levels; stores User fields and
  Grants; signs Identity Tokens.
