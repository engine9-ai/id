# Example: Astro + `@engine9/id`

Use the library from a client script. SSR must not treat a stored token as
authorization.

```astro
---
// src/pages/index.astro
---
<button id="identify">Continue</button>
<p id="level"></p>

<script>
  import { createEngine9Id } from '@engine9/id';
  import { describeLevel } from '@engine9/id/levels';

  const id = createEngine9Id();
  await id.handleCallback();

  const paint = () => {
    document.getElementById('level').textContent = describeLevel(id.level).name;
  };
  id.onChange(paint);
  paint();

  document.getElementById('identify').onclick = () =>
    id.requestIdentity({ minLevel: 1, mode: 'popup' });
</script>
```

For a core Site, pass `core: { apiUrl, publicApiKey }` and call `id.core.login()`
after `requestIdentity`. Server routes such as `/auth/delegate` should accept
`response_mode=query` (`?delegate_token=`) and verify the JWT with JWKS — do
not log the query string.

The festival demo (`/Users/clundberg/engine9/demo-festival`) is the full Astro + core
reference once it adopts this package.
