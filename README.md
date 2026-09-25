# `@engine9/id`

Add a **Log in** button and Level-based content gates to any website with one
script tag. No server code, no database, no framework required.

`@engine9/id` is the browser client for engine9 identity. Visitors log in
through [delegate](https://delegate.engine9.ai), pick which **Profile** to
share with your website, and come back with a signed **Identity Token**. The
library verifies that token in the browser and then shows or hides parts of
your page based on the visitor's **Identity Level** (0–4).

This works like the soft paywall on a news site: the article is in the page,
JavaScript hides it until the visitor logs in. It is **not** a security
boundary (see [What a browser-only login can and cannot do](#what-a-browser-only-login-can-and-cannot-do)).

Zero runtime dependencies. WebCrypto only. [MIT licensed](./LICENSE).

## Quick start (about ten minutes)

### 1. Register your website with delegate

Delegate only sends identity to websites it knows. Your website is identified
by its **Domain**: the host name, plus the port when it is not the default.

| Website URL                      | Domain to register    |
| -------------------------------- | --------------------- |
| `https://www.example.com/news`   | `www.example.com`     |
| `https://example.com`            | `example.com`         |
| `http://localhost:8080/`         | `localhost:8080`      |

Send the Domain to whoever runs your delegate (for the public delegate,
contact Engine9). There is no client id and no secret to keep. `www` and
non-`www` are different Domains; register each you use.

Already allowed on the public delegate for local development:
`localhost:3000`, `localhost:3001`, `localhost:3002`, `localhost:3003`.

### 2. Add the script

**Script tag** (any HTML page):

```html
<script src="https://unpkg.com/@engine9/id@1/dist/id.iife.js"></script>
<script>
  const id = engine9Id.mount();
</script>
```

**npm** (Vite, Astro, Next, React, and so on):

```bash
npm install @engine9/id
```

```js
import { mount } from '@engine9/id';

const id = mount();
```

Put the script on every page that has a login button or gated content.
`mount()` does three things: creates the client, finishes a login that is
returning to this page, and starts watching the `data-e9-*` attributes below.
Run it in browser code only (not during server rendering).

### 3. Add a login button and gate some content

```html
<header>
  <button data-e9-login>Log in</button>
  <button data-e9-logout hidden>Log out</button>
  <span data-e9-min-level="1" hidden>
    Hello, <span data-e9-profile="given_name">reader</span>
  </span>
</header>

<article>
  <h1>City council approves new transit plan</h1>
  <p>The council voted 7–2 on Tuesday to fund the first phase…</p>

  <!-- Shown to anonymous visitors (Level 0) -->
  <div data-e9-max-level="0" class="paywall">
    <p>Log in to keep reading. It's free.</p>
    <button data-e9-login>Log in</button>
  </div>

  <!-- Shown once the visitor has shared a Profile (Level 1 or higher) -->
  <div data-e9-min-level="1" hidden>
    <p>The plan adds three bus rapid transit lines by 2029…</p>
    <p>…rest of the article…</p>
  </div>
</article>
```

That is the whole integration. Serve the page over `http://` or `https://`
(not `file://`), open it, and click **Log in**.

### What the visitor sees

1. A delegate window opens. First-time visitors sign in to delegate (Google
   or email). Returning visitors are already signed in.
2. Delegate shows the visitor's Profiles and asks which one to share with
   your Domain, and which fields (name, email). They pick one and continue.
   Delegate remembers that choice as a **Grant**, so the next login on your
   Domain is instant.
3. The window closes. Your page updates: gated content appears, the login
   button hides, the logout button shows.

The login lasts until the Identity Token expires (about one hour) and carries
across tabs. Clicking **Log in** again renews it without another chooser
because the Grant is remembered.

## Content gates in HTML

Put these attributes on any element. The library toggles the element's
`hidden` attribute whenever the identity changes, and writes
`data-e9-state="allowed"` or `data-e9-state="blocked"` for CSS.

| Attribute                        | Element is shown when…                                          |
| -------------------------------- | --------------------------------------------------------------- |
| `data-e9-min-level="N"`          | the visitor's Level is `N` or higher                            |
| `data-e9-max-level="N"`          | the visitor's Level is `N` or lower (teasers, paywall prompts)  |
| `data-e9-two-factor`             | the visitor signed in with a second factor                      |
| `data-e9-login`                  | the visitor is **below** the button's Level (default 1)         |
| `data-e9-logout`                 | the visitor has shared a Profile                                |

Combine `min` and `max` for a band: `data-e9-min-level="1" data-e9-max-level="2"`.
No identity counts as Level 0.

Start gated content with the `hidden` attribute in your HTML so it does not
flash before the script runs. Start teasers visible.

Buttons and text:

| Attribute                              | What it does                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `data-e9-login`                        | Click opens the delegate chooser asking for Level 1                          |
| `data-e9-login="2"`                    | Same, asking for Level 2 (visitor must confirm an email or phone)            |
| `data-e9-fields="given_name,email"`    | Profile fields the button requests. Default: `display_name`, `email`         |
| `data-e9-prompt="select"`              | Always show the Profile chooser (lets a visitor switch Profiles)             |
| `data-e9-logout`                       | Click forgets the identity on this website                                   |
| `data-e9-logout="delegate"`            | Also signs the visitor out of delegate itself, then returns to this page     |
| `data-e9-profile="given_name"`         | Replaces the element's text with that Profile field when available           |
| `data-e9-level`                        | Replaces the text with the Level number (`0`–`4`)                            |
| `data-e9-level="name"`                 | Replaces the text with the Level name (`Provided`, `Contact Confirmed`, …)   |

Profile fields you can request and display: `display_name`, `given_name`,
`family_name`, `email`, `phone`. `email_verified` and `phone_verified` are
booleans on the identity; use them from JavaScript.

### Example: article with a soft paywall

```html
<article data-story>
  <p>First two paragraphs are free…</p>
  <div data-e9-max-level="0" class="fade-out">
    <button data-e9-login data-e9-fields="given_name,email">Log in to continue</button>
  </div>
  <div data-e9-min-level="1" hidden>
    <p>Full text…</p>
  </div>
</article>
```

### Example: comments need a confirmed email (Level 2)

```html
<section id="comments">
  <div data-e9-max-level="1">
    <p>Confirm your email to join the discussion.</p>
    <button data-e9-login="2">Confirm email</button>
  </div>
  <form data-e9-min-level="2" hidden>…</form>
</section>
```

Level 2 needs a Profile whose email or phone delegate has confirmed (visitors
do that once on their delegate Profile page, or by signing in to delegate with
a verified email). The chooser shows the Level each Profile can reach; picking
one that falls short returns `level_unavailable` to `onError`, so keep a
"why" sentence next to the button.

### Example: greeting and badge

```html
<p data-e9-min-level="1" hidden>
  Welcome back, <b data-e9-profile="display_name">friend</b>
  (<span data-e9-level="name"></span>).
</p>
```

## Content gates in JavaScript

Use `id.gate()` when hiding is not enough: blur, swap, load, or track.
Hooks run right away and again every time the identity changes.

```js
const id = engine9Id.mount(); // or: import { mount } from '@engine9/id'

const story = document.querySelector('[data-story]');

id.gate({
  minLevel: 1,
  onAllow(identity) {
    story.classList.remove('blurred');
    console.log('reader', identity.sub, 'level', identity.level);
  },
  onBlock() {
    story.classList.add('blurred');
  },
});
```

`gate()` accepts `minLevel`, `maxLevel`, and `twoFactor` (same rules as the
attributes) and any of these hooks:

| Hook                          | Runs when                                                        |
| ----------------------------- | ---------------------------------------------------------------- |
| `onAllow(identity)`           | the visitor meets the gate                                       |
| `onBlock(identity)`           | the visitor does not (`identity` is `null` when logged out)      |
| `onChange(allowed, identity)` | every evaluation                                                 |

It returns a function that stops the gate:

```js
const stop = id.gate({ minLevel: 2, onAllow: loadComments });
// later
stop();
```

Other things you will reach for:

```js
// Start login from your own button or link.
myButton.onclick = () =>
  id.requestIdentity({ minLevel: 1, mode: 'popup', fields: ['given_name', 'email'] })
    .catch((err) => console.warn(err.code)); // access_denied, login_required, …

// Read the verified identity (or null).
const identity = id.getIdentity();
identity?.level;                 // 0–4
identity?.profile?.given_name;   // only fields the visitor agreed to share
identity?.profile?.email_verified;
identity?.sub;                   // Domain UNID: stable id for this person on your Domain

// React to any change (login, logout, expiry).
id.onChange((identity) => render(identity));

// Ask for a higher Level only when the current one is too low.
await id.ensureLevel(2);

// Log out on this website only, or on delegate too.
id.logout();
id.logout({ delegate: true });

// Added new data-e9-* markup? Re-scan.
id.apply();
```

`await id.ready` resolves after a returning login has been verified, if you
need to run code after that point.

### `mount(options)`

Every option is optional.

| Option        | Default                        | Meaning                                                          |
| ------------- | ------------------------------ | ---------------------------------------------------------------- |
| `minLevel`    | `1`                            | Level a bare `data-e9-login` asks for                            |
| `fields`      | delegate default               | Profile fields login buttons request                             |
| `mode`        | `'popup'`                      | `'redirect'` sends the whole page to delegate and back           |
| `prompt`      | —                              | `'select'` always shows the chooser                              |
| `root`        | `document`                     | Where to look for `data-e9-*` elements                           |
| `onError`     | `console.warn`                 | Called when login fails or a redirect returns `error=`           |
| `storage`     | `'local'`                      | `'session'` forgets on tab close; `'memory'` on page unload      |
| `domain`      | from `location`                | Your Domain (`host` or `host:port`). Set it when testing behind a proxy |
| `delegateUrl` | `https://delegate.engine9.ai`  | Your own delegate deployment                                     |
| `core`        | —                              | `{ apiUrl, publicApiKey }` for [`@engine9/core`](#going-further) |

Popup mode falls back to a full-page redirect when the browser blocks the
popup. Either way `mount()` picks up the token on return and cleans the URL.

## Identity Levels

A Level says how confident delegate is about who the visitor is. It is a fact
about the login, not a permission you grant.

| Level | Name                                | How a visitor gets there                                    |
| ----- | ----------------------------------- | ----------------------------------------------------------- |
| 0     | Inferred                            | Opened your page. Anonymous; no Profile shared              |
| 1     | Provided                            | Shared a Profile with a name or email; nothing confirmed     |
| 2     | Contact Confirmed                   | The shared email or phone is confirmed                       |
| 3     | Trusted Provider Confirmed          | Signed in with a trusted provider (Google) recently          |
| 4     | Trusted Provider Strongly Confirmed | Level 3 plus a second factor                                 |

Levels 5–7 are reserved for real-world identity checks and are not issued
today. Names and descriptions are available from `engine9Id.describeLevel(n)`.

Pick the lowest Level that does the job. Level 1 is right for "log in to keep
reading". Level 2 is right when you will email the person. Level 3 or 4 is
right when you want a stronger sign that this is the same human each time.

## What a browser-only login can and cannot do

The token is verified in the browser (ES256 signature against delegate's
public keys, issuer, your Domain, expiry). That makes it safe to trust for
**what to show**. It does not make the page a vault.

Fine without a server:

- Hide and show content, greetings, badges, "continue reading" layouts.
- Personalize with the fields the visitor chose to share.
- Recognize the same visitor on return (`identity.sub`, the Domain UNID).
- Decide when to ask for a higher Level.

Not fine without a server:

- Keeping content secret. Gated HTML is still in the page source. Anyone
  can remove the `hidden` attribute in devtools or read the token from
  storage.
- Authorizing an action (publishing, paying, deleting, admin pages).
- Storing people in a database or assigning roles.

If you need those, keep this library in the browser and add
[`@engine9/core`](../core/docs/deploy.md) on your server. Core verifies the
same Identity Token, maps it to a `person_id`, and enforces roles with a real
403. See [Going further](#going-further).

## Troubleshooting

| Symptom                                                   | Fix                                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Delegate says the domain is not allowed (`invalid_domain`) | Register the exact Domain. `www.example.com` and `example.com` are different; so is the port  |
| Nothing happens on click                                  | The page is `file://`, or the click did not come from a user gesture. Serve over http(s)      |
| Popup opens and closes, page unchanged                    | Check the console: `onError` receives the code. `access_denied` = visitor closed the window; `level_unavailable` = they chose "Stay anonymous" or a Profile below the requested Level |
| Content flashes before hiding                             | Add `hidden` to gated elements in the HTML                                                    |
| Visitor is logged out after an hour                       | Tokens expire. Clicking **Log in** renews silently; or call `id.ensureLevel(1)` on a gesture  |
| Logged in on one page, not another                        | Every page needs the script and `mount()`. Storage is per Domain, so `www` and non-`www` differ |
| Works locally, not in production                          | Production Domain not registered, or the page is server-rendered and `mount()` never ran in the browser |

## Going further

### Custom layout with the lower-level client

`mount()` is a wrapper around `createEngine9Id()` plus `bindContent()`. Use
the pieces directly when you do not want automatic DOM binding:

```js
import { createEngine9Id } from '@engine9/id';
import { bindContent } from '@engine9/id/content';

const id = createEngine9Id({ storage: 'local' });
await id.handleCallback();
const binding = bindContent(id, { root: document.querySelector('#app') });
```

### With `@engine9/core`

Once the browser holds an Identity Token, `id.core.login()` posts it to your
core API with a public key. Core resolves `person_id` and roles and can refuse
requests server-side.

```js
const id = mount({
  core: { apiUrl: 'https://www.example.com', publicApiKey: 'e9publickey_…' },
});
await id.ready;
await id.core.login();
const me = await id.core.me();
```

Guides: [with-core](./docs/with-core.md), [declared roles](./docs/declared-roles.md)
(page-local roles that graduate to core segments), [forms](./docs/forms.md)
(person form field names).

### Full client API

`createEngine9Id({ provider?, delegateUrl?, domain?, storage?, core?, fetchImpl? })`

| Method | What it does |
| ------ | ------------ |
| `getIdentity()` | Verified, unexpired token payload, or `null` |
| `getDomainUnid()` | `identity.sub`, else the last stored Domain UNID |
| `requestIdentity({ minLevel, maxLevel?, fields?, prompt?, mode, returnTo?, responseMode? })` | Start login. `popup` opens `/identity/bridge`; `redirect` navigates to `/identity/authorize` |
| `handleCallback()` | Read `#delegate_token` or `?delegate_token` on return, verify, store, clean the URL |
| `ensureLevel(n, opts?)` | No-op if already at `n`; otherwise try silently, then interactively |
| `gate({ minLevel?, maxLevel?, twoFactor?, onAllow?, onBlock?, onChange? })` | Soft content hook; returns unsubscribe |
| `onChange(cb)` | Any identity change; returns unsubscribe |
| `logout({ delegate? })` | Clear storage; optionally end the delegate session |
| `level` / `isAnonymous` | Getters from the stored identity |
| `core.login()` / `core.me()` / `core.changeRole(id)` / `core.fetch(path, init)` | Core API helpers |

Package exports:

- `@engine9/id` — everything below plus `createEngine9Id`, `mount`, `verifyIdentityToken`
- `@engine9/id/content` — `mount`, `bindContent`, `gateFromElement`, `CONTENT_ATTRIBUTES`
- `@engine9/id/levels` — `LEVELS`, `describeLevel`, `meetsLevel`, `meetsGate`, `fieldsForLevel`
- `@engine9/id/roles` — declared roles: `meetsRequiredAuth`, `evaluateDeclaredRole`, `visibleContent`
- `@engine9/id/forms` — `createPersonForm`, `normalizePersonPayload`, `EMAIL_TYPES`
- `@engine9/id/core` — `createCoreClient`

The script tag build exposes the same functions on `window.engine9Id`.

### Protocol and security

The wire format is in [docs/protocol.md](./docs/protocol.md) (canonical).
Vocabulary: **User**, **Domain**, **Profile**, **Grant**, **UNID**,
**Domain UNID**, **Identity Level**, **Identity Token**. The JWT claim is
`aud` (RFC 7519) and its value is your Domain.

Verification: ES256 via JWKS, `iss`, `aud` equals this Domain, `exp` ±60s,
optional `nonce`. Popup messages are accepted only from the delegate origin.
Tokens travel in the URL fragment by default so they stay out of server
logs. Details: [docs/security.md](./docs/security.md), [docs/levels.md](./docs/levels.md).

A different issuer can be plugged in with `createEngine9Id({ provider })` as
long as it returns the same Identity shape. This is not OpenID Connect.

## Browser support

Needs `crypto.subtle`, `fetch`, `localStorage` or `sessionStorage`, and
popups for `mode: 'popup'` (with automatic redirect fallback). All current
browsers qualify.

## License

[MIT](./LICENSE). Use, copy, modify, and distribute this code as-is.
