# Person forms (interface field names)

`@engine9/id` does not write a database. It standardizes **field names** and
optional HTTP submit so Sites can grow into `@engine9/core` without renaming
forms.

Canonical columns live in `@engine9/interfaces`:

| Package | Fields |
| --- | --- |
| `person` | `given_name`, `family_name` |
| `person_email` | `email`, `email_type` (`Personal` \| `Work` \| `Other`) |
| `person_phone` | `phone`, `phone_type` (`Personal` \| `Cell` \| `Home` \| `Work` \| `Fax` \| `Other`) |

Identity Profile tokens may also include `display_name` (display only — not a
`person` column).

## Rules

- Use snake_case interface names in HTML `name` attributes and JSON.
- Do **not** use a single `name` field (split client-side). Prefer
  `given_name` / `family_name`.
- Do **not** use `type` for email category — use `email_type`.
- When `email` is present and `email_type` is omitted, default to `Personal`.
- When `phone` is present and `phone_type` is omitted, default to `Personal`.

## API

```js
import {
  normalizePersonPayload,
  createPersonForm,
  EMAIL_TYPES,
  PERSON_FORM_FIELDS,
} from '@engine9/id/forms';

const payload = normalizePersonPayload({
  given_name: 'Alex',
  family_name: 'Rivera',
  email: 'alex@example.com',
  email_type: 'Work',
});
// → ready for { people: [payload] }

createPersonForm({
  mount: '#signup',
  fields: ['given_name', 'family_name', 'email', 'email_type'],
  endpoint: 'https://www.example.com/api/people',
  headers: { Authorization: 'Bearer e9publickey_…' },
});
```

Payload shape matches core `POST /people` / public form ingest. See
[with-core.md](./with-core.md).

Profile Grants from delegate use contact fields without warehouse types
(`email`, `given_name`, …). Keep `email_type` on the **site** people payload.

## Demos

- Standalone (no core): [id-demo](../../id-demo) — local echo of the same payload.
- With core: [demo](../../demo) register form → `POST /api/people`.
