# Example: Astro + `@engine9/id`

Use the library from a client script. SSR must not treat a stored token as
authorization.

The login widget is the main way visitors interact with Delegate: one
**Login** button whose dialog logs in with Google, switches email, changes
role, and logs out.

```astro
---
// src/layouts/Layout.astro
---
<header>
  <span data-e9-login-widget></span>
</header>
<slot />

<script>
  import { mount } from '@engine9/id';
  import { loginWidget } from '@engine9/id/widget';

  const id = mount();
  loginWidget({ id, fields: ['given_name', 'email'] });
</script>
```

Gate content on any page with `data-e9-min-level` / `data-e9-max-level`
(see the [README](../../README.md#content-gates-in-html)).

## With a server session

When an Astro route verifies the Identity Token and sets its own cookie,
render the current session into the page and pass it as `user`. The widget
then reflects the server, and its hooks post to your routes:

```astro
---
const session = Astro.locals.session; // your session
const widget = session ? { email: session.email, role: session.role, level: session.level } : null;
---
<span data-e9-login-widget data-user={JSON.stringify(widget)}></span>

<script>
  import { createEngine9Id } from '@engine9/id';
  import { loginWidget } from '@engine9/id/widget';

  const el = document.querySelector('[data-e9-login-widget]');
  loginWidget({
    id: createEngine9Id(),
    target: el,
    user: JSON.parse(el.dataset.user || 'null'),
    async onLogin(_identity, token) {
      const res = await fetch('/auth/delegate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegate_token: token }),
      });
      return (await res.json()).user; // { email, role, level }
    },
    async onLogout() {
      await fetch('/auth/logout', { method: 'POST', keepalive: true });
    },
  });
</script>
```

Server routes should verify the JWT with JWKS. If a route also accepts
`response_mode=query` (`?delegate_token=`), do not log the query string.

[`demo-festival`](../../../demo-festival) is the full Astro + core reference
(`src/layouts/Layout.astro`).
