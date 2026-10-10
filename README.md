# `@engine9/id`

Add the Delegate **Login** button and Level-based content gates to any
website with one script tag. No server code, no database, no framework
required.

`@engine9/id` is the browser client for engine9 identity. Visitors log in
through [delegate](https://delegate.engine9.ai), choose which **fields** to
share with your website, and come back with a signed **Identity Token**. The
library verifies that token in the browser and then shows or hides parts of
your page based on the visitor's **Identity Level** (0–4).

The **[login widget](#the-login-widget)** is the main way visitors interact
with Delegate. It is one button that shows who is logged in (email and role)
or **Login**, and one dialog on your page for every Delegate step: log in
with Google, switch email, change role, and log out. Start there. The
lower-level pieces (`data-e9-login` buttons, `requestIdentity()`) are for
pages that need their own controls.

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

### 2. Add the script and the Login button

**Script tag** (any HTML page):

```html
<span data-e9-login-widget></span>

<script src="https://unpkg.com/@engine9/id@1/dist/id.iife.js"></script>
<script>
  const id = engine9Id.mount();
  engine9Id.loginWidget({ id });
</script>
```

**npm** (Vite, Astro, Next, React, and so on):

```bash
npm install @engine9/id
```

```js
import { mount } from '@engine9/id';
import { loginWidget } from '@engine9/id/widget';

const id = mount();
loginWidget({ id }); // goes in [data-e9-login-widget]
```

Put the script on every page, usually with the Login button in the header.
`mount()` creates the client, finishes a login that is returning to this
page, and starts watching the `data-e9-*` attributes below. `loginWidget()`
puts the Login button in the `data-e9-login-widget` element. Run both in
browser code only (not during server rendering).

### 3. Gate some content

```html
<header>
  <span data-e9-login-widget></span>
  <span data-e9-min-level="1" hidden>
    Hello, <span data-e9-field="given_name">reader</span>
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

  <!-- Shown once the visitor has shared fields (Level 1 or higher) -->
  <div data-e9-min-level="1" hidden>
    <p>The plan adds three bus rapid transit lines by 2029…</p>
    <p>…rest of the article…</p>
  </div>
</article>
```

The paywall's `data-e9-login` button starts the same login as the widget,
right where the reader is stuck.

That is the whole integration. Serve the page over `http://` or `https://`
(not `file://`), open it, and click **Login**.

### What the visitor sees

1. **Login** opens the Delegate dialog on your page. It says what your site
   asks for (for example "your name and email address").
2. **Log in with Google** opens a Delegate window. First-time visitors sign
   in with Google. (Your site can also offer an emailed sign-in link; see
   [Sign-in screens](#sign-in-screens-google-only-or-google-plus-an-email-link).)
   Returning visitors are already signed in.
3. Delegate asks which fields (name, email) to share with your Domain.
   Required fields are part of logging in; optional fields are checkboxes.
   Delegate remembers that choice as a **Grant**, so the next login on your
   Domain is instant.
4. The window closes. The button now shows the visitor's email (and role, if
   your site has roles), and gated content appears.

Clicking the button again opens the same dialog to **switch email**,
**change role**, or **log out**. Nothing navigates away from your page.

The login lasts until the Identity Token expires (about eight hours) and carries
across tabs. Logging in again renews it without another chooser because the
Grant is remembered.

## The login widget

The login widget is the main way visitors interact with Delegate: one button
and one dialog for everything. The button shows the logged-in email and
role, or **Login**. Clicking it opens a dialog on your page that:

1. **Logs in with Google** (Delegate's popup; with `loginLevel: 2`, Google or
   an emailed link).
2. **Switches email**: the address your site receives (Delegate's address
   chooser, `prompt=select`, in the same popup). The visitor can also add an
   address or use a different Google account there.
3. **Changes role** on your site, when you give it roles.
4. **Logs out**, on your site only or on Delegate too (a small popup, no
   redirect).
5. Shows **Delegate branding**, unless you turn it off.

The dialog stays open behind Delegate's popups and updates when they answer.
Use it in your header on every page instead of separate Log in, Change your
Delegate information, and Log out buttons.

The quick start above is the whole setup. Everything is configurable from
the call:

```js
import { mount } from '@engine9/id';
import { loginWidget } from '@engine9/id/widget';

const id = mount();
const widget = loginWidget({
  id,
  target: '#login',                     // default: [data-e9-login-widget], else <body>
  minLevel: 1,                          // Level a login asks for
  fields: ['given_name', 'email'],      // required fields (default: Delegate's)
  optionalFields: ['phone'],
  loginLevel: 2,                        // also offer an emailed sign-in link
  branding: false,                      // hide the Delegate mark and footer
  siteName: 'The Daily Example',
  labels: { login: 'Sign in' },
  roles: [
    { id: 'reader', name: 'Reader' },
    { id: 'editor', name: 'Editor', description: 'Publish stories', requiredAuth: { minLevel: 3 } },
  ],
  role: localStorage.getItem('role'),
  onRoleChange: (roleId) => localStorage.setItem('role', roleId),
});
```

Roles are yours. The widget lists them, locks the ones the visitor's Level
does not meet ("Needs Level 3"), and calls `onRoleChange`. Throw from it to
refuse; the message appears in the dialog. Without `roles` there is no Role
section. Page-local roles like these are
[declared roles](./docs/declared-roles.md); for enforced roles, see
[With a server session](#with-a-server-session).

| Option | Default | Meaning |
| --- | --- | --- |
| `id` | a new client (`local` storage) | The client from `mount()` or `createEngine9Id()` |
| `target` | `[data-e9-login-widget]`, else `<body>` | Element or selector for the button |
| `minLevel`, `maxLevel`, `fields`, `optionalFields`, `loginLevel` | Level 1, Delegate's fields | What every login and email switch asks Delegate for |
| `branding` | `true` | Delegate mark in the dialog and "Sign-in by Delegate" footer |
| `siteName` | `location.hostname` | Name in the dialog title |
| `labels` | English | Any button or title text. `{site}` in `title` / `signedInTitle` is replaced |
| `theme` | `'auto'` | `'light'` or `'dark'`; `auto` follows the system |
| `roles`, `role`, `onRoleChange` | none | Role section |
| `user` | from the Identity Token | Your server session's `{ email, role, level }`. Set it when your session outlives the token |
| `onLogin(identity, token)` | none | After login or an email switch. Send `token` to your server; return the new `user` |
| `onLogout()` | none | End your server session |
| `logoutDelegate` | `false` | `false` logs out of this site only; `'ask'` adds a checkbox to also end the Delegate session; `true` always ends it |
| `onError` | `console.warn` | Every error the dialog shows |

The widget returns `{ element, id, open(), close(), update({ user?, role? }), destroy() }`.
Call `widget.open()` from your own link to show the dialog, and
`widget.update({ role })` when your page changes the role some other way.

Styling: set `--e9-accent`, `--e9-bg`, `--e9-fg`, `--e9-muted`, `--e9-border`,
`--e9-surface`, and `--e9-font` on `.e9-login-widget`. The element has
`data-state` (`signed-in` / `signed-out`) and `data-role`, and exposes
`::part(button)`, `::part(email)`, `::part(role)`, and `::part(dialog)`.

### With a server session

A site that mints its own session (like `@engine9/core`) passes the server's
view as `user`, and posts the token in `onLogin`. The server is then the one
that enforces roles; the widget just offers them.

```js
loginWidget({
  user: JSON.parse(document.body.dataset.user || 'null'),
  roles,
  async onLogin(identity, token) {
    const res = await fetch('/auth/delegate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delegate_token: token }),
    });
    return (await res.json()).user; // { email, role, level }
  },
  async onRoleChange(roleId) {
    await fetch('/auth/role', { method: 'POST', body: new URLSearchParams({ role: roleId }) });
  },
  async onLogout() {
    await fetch('/auth/logout', { method: 'POST', keepalive: true });
  },
});
```

The festival demo ([`demo-festival`](../demo-festival)) does exactly this.

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
| `data-e9-logout`                 | the visitor is signed in (Level 1 or higher)                    |
| `data-e9-change-delegate`        | the visitor is signed in (Level 1 or higher)                    |

Combine `min` and `max` for a band: `data-e9-min-level="1" data-e9-max-level="2"`.
No identity counts as Level 0.

Start gated content with the `hidden` attribute in your HTML so it does not
flash before the script runs. Start teasers visible.

Buttons and text. The [login widget](#the-login-widget) already covers log
in, switch email, and log out for the whole site; use these buttons inside
your content, where a reader needs one specific step ("Log in to keep
reading", "Confirm your email to comment"):

| Attribute                              | What it does                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `data-e9-login`                        | Click opens delegate asking for Level 1                                       |
| `data-e9-login="2"`                    | Same, asking for Level 2 (visitor must confirm an email or phone)            |
| `data-e9-fields="given_name,email"`    | Required fields the button requests. Default: `display_name`, `email`        |
| `data-e9-optional-fields="phone"`      | Optional fields. Declining one does not drop the visitor to Level 0          |
| `data-e9-prompt="select"`              | Always show the field form again                                              |
| `data-e9-login-level="2"`              | Delegate's sign-in screen also offers an emailed sign-in link (default: Google only). See [Sign-in screens](#sign-in-screens-google-only-or-google-plus-an-email-link) |
| `data-e9-logout`                       | Click forgets the identity on this website                                   |
| `data-e9-logout="delegate"`            | Also signs the visitor out of delegate itself, then returns to this page     |
| `data-e9-change-delegate`              | "Change your Delegate information": reopens delegate to pick another email address or change what is shared. Value is the minimum Level (default 1) |
| `data-e9-field="given_name"`         | Replaces the element's text with that shared field when available            |
| `data-e9-level`                        | Replaces the text with the Level number (`0`–`4`)                            |
| `data-e9-level="name"`                 | Replaces the text with the Level name (`Provided`, `Contact Confirmed`, …)   |

Fields you can request and display: `display_name`, `given_name`,
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

Level 2 needs an email or phone delegate has confirmed (visitors do that once
on their delegate details page, or by signing in to delegate with a verified
email). Declining a required field returns `level_unavailable` to `onError`,
so keep a "why" sentence next to the button.

Signing in with Google already counts as Level 3, which is more than Level 2.
To let people without Google in too, add `data-e9-login-level="2"`. Delegate
then also offers "Email me a sign-in link":

```html
<button data-e9-login="2" data-e9-login-level="2">Confirm email</button>
```

### Example: the site does not know that address

A person can sign in with an address your site does not have on file (a
personal Gmail instead of the address on your member list). They are signed
in to delegate, so a second "Sign in with Google" does nothing new. **Switch
email** in the [login widget](#the-login-widget) is the fix: Delegate shows
the share page again with their email addresses. They can pick another one,
add one, or use a different Google account. Your page then gets a new token.

Next to the message itself, a **Change your Delegate information** button does
the same thing in one click:

```html
<div data-e9-min-level="1" hidden>
  <p>That address isn't on our list. Use the address we have for you.</p>
  <button data-e9-change-delegate>Change your Delegate information</button>
</div>
```

From JavaScript: `id.changeDelegateInfo()`. It repeats the fields the
current Grant asked for.

### Example: greeting and badge

```html
<p data-e9-min-level="1" hidden>
  Welcome back, <b data-e9-field="display_name">friend</b>
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
// Open the login widget's dialog from your own link.
document.querySelector('#account-link').onclick = () => widget.open();

// Start login directly from your own button (no dialog).
myButton.onclick = () =>
  id.requestIdentity({ minLevel: 1, mode: 'popup', fields: ['given_name', 'email'] })
    .catch((err) => console.warn(err.code)); // access_denied, login_required, …

// Read the verified identity (or null).
const identity = id.getIdentity();
identity?.level;                 // 0–4
identity?.fields?.given_name;   // only fields the visitor agreed to share
identity?.fields?.email_verified;
identity?.sub;                   // Domain UNID: stable id for this person on your Domain

// React to any change (login, logout, expiry).
id.onChange((identity) => render(identity));

// Ask for a higher Level only when the current one is too low.
await id.ensureLevel(2);

// Log out on this website only, or on delegate too (redirect, or a popup).
id.logout();
id.logout({ delegate: true });
await id.logout({ delegate: true, mode: 'popup' });

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
| `fields`      | delegate default               | Required fields login buttons request                            |
| `mode`        | `'popup'`                      | `'redirect'` sends the whole page to delegate and back           |
| `prompt`      | —                              | `'select'` always shows the chooser                              |
| `loginLevel`  | `3` (Google only)              | `2` also offers an emailed sign-in link. See [Sign-in screens](#sign-in-screens-google-only-or-google-plus-an-email-link) |
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
| 0     | Inferred                            | Opened your page. Anonymous; no fields shared                |
| 1     | Provided                            | Shared a name or email; nothing confirmed                    |
| 2     | Contact Confirmed                   | The shared email or phone is confirmed                       |
| 3     | Trusted Provider Confirmed          | Signed in with a trusted provider (Google) recently          |
| 4     | Trusted Provider Strongly Confirmed | Level 3 plus a second factor                                 |

Levels 5–7 are reserved for real-world identity checks and are not issued
today. Names and descriptions are available from `engine9Id.describeLevel(n)`.

Pick the lowest Level that does the job. Level 1 is right for "log in to keep
reading". Level 2 is right when you will email the person. Level 3 or 4 is
right when you want a stronger sign that this is the same human each time.

## Sign-in screens: Google only, or Google plus an email link

When a visitor is not signed in to delegate yet, delegate shows one of two
sign-in screens. Your site picks which one with `loginLevel`.

| `loginLevel`        | The visitor sees                                      | Use it when                                                |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `3` (default) or `4` | **Sign in with Google** only                         | You need Level 3 or 4, or have no reason to change it       |
| `2`                 | **Sign in with Google**, or **Email me a sign-in link** | Level 0–2 is enough and you want people without Google too |

**Why Google only is the default.** An emailed link proves the person can
read that inbox. That is Level 2 (Contact Confirmed) and never more. If your
site asks for Level 3 or 4 and the visitor signs in with an email link,
delegate still cannot issue the Level you need, and the login ends in
`level_unavailable`. Showing only trusted providers avoids that dead end.

**Turn on the email link for the whole site:**

```js
const id = engine9Id.mount({ loginLevel: 2 });
// or: createEngine9Id({ loginLevel: 2 })
```

**Only for one button:**

```html
<button data-e9-login data-e9-login-level="2">Get the newsletter</button>
```

**Only for one call** (overrides the site-wide setting either way):

```js
await id.requestIdentity({ minLevel: 2, mode: 'popup', loginLevel: 2 });
await id.ensureLevel(3, { loginLevel: 3 }); // members area: Google only
```

What `loginLevel` does **not** do:

- It does not set the Level on the token. `minLevel` / `maxLevel` and how
  the visitor actually signed in decide that. A visitor on the `2` screen who
  picks Google still gets Level 3.
- It cannot lower a requirement. With `minLevel: 3` or higher, delegate
  shows Google only even when you pass `loginLevel: 2`.
- It does nothing for visitors who are already signed in to delegate. They
  skip the sign-in screen entirely.
- It is a soft browser setting, like every other option here. Your server
  (or `@engine9/core` roles) still decides what a Level is allowed to do.

On the wire this is `login_level=2` on `/identity/authorize` and
`/identity/bridge` ([protocol](./docs/protocol.md#sign-in-screen-login_level)).
Server-side sites using `@engine9/core` pass `loginLevel: 2` to
`auth.identityUrl()`.

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
| "Login is not available on http://… because the connection is not secure" (`insecure_domain`) | The page is plain `http://`. Login works only on `https://`, or `http://localhost` / `127.0.0.1` for development |
| Nothing happens on click                                  | The page is `file://`, or the click did not come from a user gesture. Serve over http(s)      |
| Popup opens and closes, page unchanged                    | Check the console: `onError` receives the code. `access_denied` = visitor closed the window, or the window lost its link to this page (`error.details.reason === 'popup_closed'`; a Cloudflare bot check on Delegate causes this); `level_unavailable` = they chose "Stay anonymous" or declined a required field |
| You need to see each login step                           | `createEngine9Id({ debug: true })` logs every step to the console with the prefix `[engine9-id]` |
| Content flashes before hiding                             | Add `hidden` to gated elements in the HTML                                                    |
| Visitor is logged out after an hour                       | Tokens expire. **Login** → **Log in with Google** renews silently; or call `id.ensureLevel(1)` on a gesture |
| Logged in on one page, not another                        | Every page needs the script, `mount()`, and `loginWidget()`. Storage is per Domain, so `www` and non-`www` differ |
| Login button does not appear                              | `loginWidget()` found no `[data-e9-login-widget]` and went to the end of `<body>`. Add the element, or pass `target` |
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
requests server-side. Call it from the login widget's `onLogin`:

```js
const id = mount({
  core: { apiUrl: 'https://www.example.com', publicApiKey: 'e9publickey_…' },
});
loginWidget({
  id,
  async onLogin() {
    const { session } = await id.core.login();
    return { email: session.fields?.email, level: session.level };
  },
});
const me = await id.core.me();
```

Guides: [with-core](./docs/with-core.md), [declared roles](./docs/declared-roles.md)
(page-local roles that graduate to core segments), [forms](./docs/forms.md)
(person form field names).

### Full client API

`createEngine9Id({ provider?, delegateUrl?, domain?, storage?, core?, fetchImpl?, loginLevel? })`

| Method | What it does |
| ------ | ------------ |
| `getIdentity()` | Verified, unexpired token payload, or `null` |
| `getDomainUnid()` | `identity.sub`, else the last stored Domain UNID |
| `requestIdentity({ minLevel, maxLevel?, fields?, prompt?, loginLevel?, expiresIn?, mode, returnTo?, responseMode? })` | Start login. `popup` opens `/identity/bridge`; `redirect` navigates to `/identity/authorize`. `loginLevel: 2` adds the email sign-in link. `expiresIn` sets Identity Token lifetime in seconds (delegate default 28800 / 8 hours, max 30 days) |
| `handleCallback()` | Read `#delegate_token` or `?delegate_token` on return, verify, store, clean the URL |
| `ensureLevel(n, opts?)` | No-op if already at `n`; otherwise try silently, then interactively |
| `changeDelegateInfo(opts?)` | "Change your Delegate information": `prompt=select` with the current Grant's fields, so the visitor can pick another email address. Options as `requestIdentity`, all optional (default Level 1, popup) |
| `gate({ minLevel?, maxLevel?, twoFactor?, onAllow?, onBlock?, onChange? })` | Soft content hook; returns unsubscribe |
| `onChange(cb)` | Any identity change; returns unsubscribe |
| `getToken()` | The stored Identity Token (JWT) to send to your server, or `null` |
| `logout({ delegate?, mode? })` | Clear storage; optionally end the delegate session. `mode: 'popup'` uses `/identity/logout/bridge` and stays on the page (redirect if the popup is blocked) |
| `level` / `isAnonymous` | Getters from the stored identity |
| `core.login()` / `core.me()` / `core.changeRole(id)` / `core.fetch(path, init)` | Core API helpers |

Package exports:

- `@engine9/id` — everything below plus `createEngine9Id`, `mount`, `loginWidget`, `verifyIdentityToken`
- `@engine9/id/widget` — `loginWidget` (the main way to log in; see [The login widget](#the-login-widget))
- `@engine9/id/content` — `mount`, `bindContent`, `gateFromElement`, `CONTENT_ATTRIBUTES`
- `@engine9/id/levels` — `LEVELS`, `describeLevel`, `meetsLevel`, `meetsGate`, `fieldsForLevel`
- `@engine9/id/roles` — declared roles: `meetsRequiredAuth`, `evaluateDeclaredRole`, `visibleContent`
- `@engine9/id/forms` — `createPersonForm`, `normalizePersonPayload`, `EMAIL_TYPES`
- `@engine9/id/core` — `createCoreClient`

The script tag build exposes the same functions on `window.engine9Id`.

### Protocol and security

The wire format is in [docs/protocol.md](./docs/protocol.md) (canonical).
Vocabulary: **User**, **Domain**, **Grant**, **UNID**,
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
