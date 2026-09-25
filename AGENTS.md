# Agent Guide — `@engine9/id`

Open-source browser client for engine9 identity. No backend, no runtime
dependencies. Delegate (private) issues Identity Tokens; this package verifies
them in the browser.

## License

`@engine9/id` is MIT licensed. See [LICENSE](LICENSE). Use, copy, modify, and
distribute this code as-is. No further permission is required.

`@engine9/core`, `@engine9/interfaces`, `demo-festival`, and `demo-id` are
also MIT. The private repositories `delegate` and `server` are not open
source. Do not copy code from those repositories under this license.

## Deploy

First-time browser setup: [docs/deploy.md](./docs/deploy.md).
Database + API (core, including Cloudflare D1): [`core/docs/deploy.md`](../core/docs/deploy.md).

## Canonical protocol

[docs/protocol.md](./docs/protocol.md) is the wire spec. Keep it in sync with
delegate routes (`/identity/*`, `/.well-known/*`, JWT claims). If you change
authorize query params, callback names, or `postMessage` shape, update
`protocol.md` in the same change.

## Vocabulary

Use **User**, **Domain**, **Profile**, **Grant**, **UNID**, **Domain UNID**,
**Domain Profile**, **Identity Level**, **Identity Token**, **Core Session**. Never “Account” or “Audience” in docs or
APIs. The JWT claim remains `aud`.

## Layout

- `src/index.ts` — public ESM API (`createEngine9Id` and re-exports)
- `src/content.ts` — `@engine9/id/content`: `mount()`, `bindContent()`,
  `data-e9-*` soft content gates (README quick start)
- `src/levels.ts` — `@engine9/id/levels` (incl. `meetsGate`)
- `src/roles.ts` — `@engine9/id/roles` (declared roles / soft `requiredAuth`)
- `src/forms.ts` — `@engine9/id/forms` (interface person field helpers)
- `src/provider.ts` — pluggable IdentityProvider (Delegate default)
- `src/core.ts` — `@engine9/id/core`
- `src/verify.ts` — WebCrypto ES256 + claim checks
- `src/iife.ts` — `window.engine9Id`
- `docs/` — protocol and how-to (`declared-roles.md`, `forms.md`, …)
- `skills/e9-identity-levels/` — Level 0–7 vocabulary
- `examples/` — plain HTML, core, Astro
- Sibling [`demo-id`](../demo-id) — standalone Level 0/1 soft-content demo

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build
```

Do not start a long-lived demo server unless asked.

## Tests

Vitest + jsdom. `test/verify.test.ts` runs in the `node` environment so
`crypto.subtle` is always present. Other files use jsdom; `test/setup.ts`
polyfills SubtleCrypto when jsdom lacks it.

`jose` is a **devDependency only** (sign tokens in tests). Do not add it, or
any other runtime dependency, to the published library.

## Implementation notes

- Authorize / bridge / logout URLs take query param `domain`, not `audience`.
- Popup messages: `type === 'delegate-identity'` and `event.origin` must be
  the delegate origin.
- Clock skew on `exp` / `iat` is 60 seconds.
- Default storage keys include `delegate_token` and `delegate_domain_unid`.

## Before finishing

Run `npm test` and `npm run typecheck`. Do not git commit unless asked.
