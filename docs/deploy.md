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
     (`ALLOWED_RETURN_ORIGINS`, or a row in delegate’s `domain` table).
   - Local: `http://localhost:3000`, `3001`, `3002`, and `3003` are already
     allowed on the public delegate.
3. The page served over **http or https**, not opened as a file
   (`file://` breaks the login popup).

You do **not** need a database, an API key, Cloudflare, or `@engine9/core`.

## Step 1 — Add the script

**Plain HTML** (fastest):

```html
<script src="https://unpkg.com/@engine9/id/dist/id.iife.js"></script>
<script type="module">
  const id = engine9Id.createEngine9Id();
  await id.handleCallback();
</script>
```

**npm** (React, Astro, Vite, and so on):

```bash
npm install @engine9/id
```

```js
import { createEngine9Id } from "@engine9/id";

const id = createEngine9Id();
await id.handleCallback();
```

`handleCallback()` must run on the page people return to after login.
Call it once when the page loads.

Delegate is the default identity provider. You only set `delegateUrl` if you
are not using `https://delegate.engine9.ai`. Another provider is possible
later; it must return the same identity shape. See
[without-core.md](./without-core.md).

## Step 2 — Ask for identity on a button click

Login has to start from a click or keypress (browsers block popups otherwise).

```js
document.querySelector("#continue").onclick = async () => {
  await id.requestIdentity({
    minLevel: 1,
    mode: "popup",
    fields: ["given_name", "family_name", "email"],
  });
};
```

| `minLevel` | What the visitor does                                 |
| ---------- | ----------------------------------------------------- |
| `0`        | Continue with a UNID only. No name or email           |
| `1`        | They can type name and email. Nothing is verified yet |

`mode: 'redirect'` sends the whole window to delegate and back. Use it if
popups are blocked. On the return page, `handleCallback()` reads the token.

## Step 3 — Show different content (soft)

This does **not** protect a secret. Anyone can edit the page in devtools.
It is for greetings, teasers, and “you’re signed in” layouts.

```js
const ident = id.getIdentity();
const level = ident?.level ?? 0;

if (level < 1) {
  // Public copy + a button to continue
} else {
  // Use ident.profile.given_name, ident.profile.email
}
```

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
| Astro / Next / any SPA            | Run `createEngine9Id` in **browser** code, not during server render                 |
| Cloudflare Workers                | Still just a script in the HTML the Worker returns. Workers are not required for id |
| Local                             | `npx serve` (or your dev server). Use an allowed localhost origin                   |

## Check that it works

1. Open the site in a normal browser window (not `file://`).
2. Click the button. A delegate window opens.
3. After you finish, the page shows a Level and a UNID.
4. If delegate says the domain is not allowed, the Domain does not match
   (including `www`, `http` vs `https`, or the port).

## What id will not do

- Store people in a database
- Issue API keys
- Enforce “you may not open this URL”
- Replace core segment roles

Next, if you need those: [Deploy core](../../core/docs/deploy.md).
