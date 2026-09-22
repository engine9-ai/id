# Declared roles (soft personalization)

**Declared roles** live in the browser (page config). They use the same
`requiredAuth` shape as **segment roles** in `@engine9/core`, but they are
**not** authorization and they do **not** require a `person_id`.

| Concept | Package | Key | Membership | Enforcement |
| --- | --- | --- | --- | --- |
| Declared role | `@engine9/id` | string id (`activist`) | Claimed on the page and/or Profile `attributes` | Soft UI only |
| Segment role | `@engine9/core` | `role_id === segment_id` (UUID) | `person_segment` | Hard scopes + 403 |

Do **not** call declared roles “anonymous roles”. Level 0 visitors are
anonymous; Level 1+ are identified. Soft personalization applies to both.

Levels are **confidence**, never Roles. See [levels.md](./levels.md) and
[`skills/e9-identity-levels`](../skills/e9-identity-levels/README.md).

## Shared shape

```js
{
  id: 'activist',
  name: 'Activist',
  requiredAuth: { minLevel: 1 },
  // optional soft match without a claim:
  match: { attributes: { interest: 'activist' } },
  // when graduating to core:
  segment_id: '…uuid…',
  scopes: ['data:read'],
}
```

Core’s registry is keyed by segment UUID and omits page-local `match`. See
[`core/auth/README.md`](../../core/auth/README.md) and the festival demo
[`demo-festival/src/lib/roles.ts`](../../demo-festival/src/lib/roles.ts).

## Soft evaluation

```js
import {
  createRoleRegistry,
  evaluateDeclaredRole,
  visibleContent,
} from '@engine9/id/roles';

const roles = createRoleRegistry({
  activist: {
    id: 'activist',
    name: 'Activist',
    requiredAuth: { minLevel: 1 },
  },
});

const evaluation = evaluateDeclaredRole(roles.activist, {
  identity: id.getIdentity(),
  claimedIds: ['activist'],
});
// evaluation.visible === claimed/matched && meetsRequiredAuth
```

`meetsRequiredAuth` mirrors core policy: `minLevel` against `identity.level`,
`twoFactor` against `identity.auth.two_factor`.

Anyone who can run JavaScript on the page can forge claims or read a stored
token. Soft visibility is for **content customization**, not privileged
actions. Hard gates belong in core.

## Graduation path

1. Start with declared roles in `@engine9/id` / [demo-id](../../demo-id).
2. Add `@engine9/core`, map each declared `id` → `segment_id`, store membership
   in `person_segment`.
3. Keep the same `requiredAuth` / `name`; add `scopes` and enforce on API
   routes.

See [with-core.md](./with-core.md) and [without-core.md](./without-core.md).
