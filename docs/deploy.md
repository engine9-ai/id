# Deploy `@engine9/id`

`@engine9/id` is a **browser library**. You do not deploy a server for it.
You add a script to your website and tell **delegate** which website address
is allowed to receive identity.

If you also need a people database, signups stored as rows, or pages that
**refuse** access, use [`@engine9/core`](../../core/docs/deploy.md) as well.
`id` still runs in the browser; core runs on your site.

Working example with no database: [`demo-id`](../../demo-id).

## Which package?

| You want…                                                                  | Use                                                         |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| “Who is this visitor?” and different **copy** for Level 0 vs Level 1       | **id only**                                                 |
| A form that uses engine9 field names (`given_name`, `email`, `email_type`) | **id** form helpers; POST to your own URL, or to core later |
| Save people, emails, and roles in a database                               | **core** (and usually **id** in the browser)                |
| Block `/admin` unless the person is in a segment                           | **core**                                                    |

**id** never writes `person_id`. **core** does.

## Words used below

| Word               | Meaning                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| **Domain**       | Host (and port when not default). Examples: `www.example.com`, `localhost:3000` |
| **User**           | The person delegate knows                                                                           |
| **UNID**           | Delegate’s id for that User in this browser                                                         |
| **Identity Level** | How confident we are (0 = inferred, 1 = they typed something). Not a permission                     |
| **Declared role**  | A label **you** define in page JavaScript to show or hide content. Soft only                        |
| **delegate**       | The identity service. Default: `https://delegate.engine9.ai`                                        |

We do not use the words Account or Audience. The token still has a standard
JWT field named `aud`; it must equal your Domain string.

## Before you start

You need:

1. The **exact URL** visitors will use (`https://www.example.com`, or
   `http://localhost:4173` while testing), so delegate can derive the Domain.
2. That Domain **allowed on delegate**. There is no OAuth client id. The
   consumer _is_ its Domain.
   - Production: ask whoever runs delegate to allow the Domain
     (`ALLOWED_DOMAINS`, or a row in delegate’s `domain` table).
   - Local: `http://localhost:3000`, `3001`, `3002`, and `3003` are already
     allowed on the public delegate.
3. The page served over **http or https**, not opened as a file
   (`file://` breaks the login popup).

You do **not** need a database, an API key, Cloudflare, or `@engine9/core`.

## Step 1 — Add the script and the Login button

The **login widget** is how visitors interact with Delegate: one **Login**
button that opens a dialog on your page to log in with Google, switch email,
change role, and log out. Put it in your header on every page.

**Plain HTML** (fastest):

```html
<span data-e9-login-widget></span>

<script src="https://unpkg.com/@engine9/id@1/dist/id.iife.js"></script>
<script>
  const id = engine9Id.mount();
  engine9Id.loginWidget({ id, fields: ["given_name", "family_name", "email"] });
</script>
```

**npm** (React, Astro, Vite, and so on):

```bash
npm install @engine9/id
```

```js
import { mount } from "@engine9/id";
import { loginWidget } from "@engine9/id/widget";

const id = mount();
loginWidget({ id, fields: ["given_name", "family_name", "email"] });
```

`mount()` creates the client, finishes a login that is returning to this
page, and keeps `data-e9-*` elements (Step 3) in sync. `loginWidget()` puts
the Login button in the `data-e9-login-widget` element. Call both once on
every page, in browser code.

Delegate is the default identity provider. You only set `delegateUrl` (on
both calls) if you are not using `https://delegate.engine9.ai`. Another
provider is possible later; it must return the same identity shape. See
[without-core.md](./without-core.md).

## Step 2 — Configure the widget

Every option is in the [README](../README.md#the-login-widget). The ones most
sites set:

| Option | What it changes |
| --- | --- |
| `minLevel` | Level a login asks for. `1` (default): share a name and email. `2`: an email or phone delegate has confirmed |
| `fields`, `optionalFields` | What the site asks delegate to share |
| `loginLevel: 2` | Delegate also offers an emailed sign-in link, for people without Google |
| `roles`, `role`, `onRoleChange` | Adds a Role section to the dialog |
| `branding: false` | Hides the Delegate mark and footer |
| `siteName`, `labels`, `theme` | Wording and look |

Keep **Switch email** available (it always is in the widget). Delegate
remembers which email address a person shares with your Domain, so logging
in again returns the same one. If they shared the wrong address, Switch email
reopens delegate's share page so they can pick another, add one, or use a
different Google account.

For a single step inside your content (a paywall's "Log in to continue", a
"Confirm your email" before comments), add a `data-e9-login` button there:

```html
<button data-e9-login="2" data-e9-fields="email">Confirm email</button>
```

From JavaScript: `widget.open()` shows the dialog, and
`id.requestIdentity({ minLevel: 1, mode: "popup", fields })` starts a login
directly.

## Step 3 — Show different content (soft)

This does **not** protect a secret. Anyone can edit the page in devtools.
It is for greetings, teasers, and “you’re signed in” layouts.

```html
<div data-e9-max-level="0">Log in to keep reading.</div>
<div data-e9-min-level="1" hidden>
  Welcome, <span data-e9-field="given_name">reader</span>. Full article…
</div>
```

Or with hooks:

```js
id.gate({
  minLevel: 1,
  onAllow: (identity) => article.classList.remove("locked"),
  onBlock: () => article.classList.add("locked"),
});
```

Every attribute and hook is listed in the [README](../README.md#content-gates-in-html).

For “Activists at Level 1 see this section”, define a **declared role** on
the page. Full pattern: [declared-roles.md](./declared-roles.md). The
[`demo-id`](../../demo-id) page is a complete example.

## Step 4 — Forms

If you collect a name and email, use these field names so the same form can
later post to core:

- `given_name`
- `family_name`
- `email`
- `email_type` — `Personal`, `Work`, or `Other`

Details: [forms.md](./forms.md).

## Where it runs

| Environment                       | What to do                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| Static host (Pages, S3, any HTML) | Upload the page. Allow the Domain on delegate. Done                                 |
| Astro / Next / any SPA            | Run `mount` and `loginWidget` in **browser** code, not during server render          |
| Cloudflare Workers                | Still just a script in the HTML the Worker returns. Workers are not required for id |
| Local                             | `npx serve` (or your dev server). Use an allowed localhost origin                   |

## Check that it works

1. Open the site in a normal browser window (not `file://`).
2. Click **Login**. The Delegate dialog opens on your page.
3. Click **Log in with Google**. A delegate window opens.
4. After you finish, the window closes and the button shows your email.
5. If delegate says the domain is not allowed, the Domain does not match
   (including `www`, `http` vs `https`, or the port).
6. Click the button again, then **Switch email**. Delegate shows the share
   page with your email addresses even though you already shared.
7. **Log out**. The button reads **Login** again.

## What id will not do

- Store people in a database
- Issue API keys
- Enforce “you may not open this URL”
- Replace core segment roles

Next, if you need those: [Deploy core](../../core/docs/deploy.md).
