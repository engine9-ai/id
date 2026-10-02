# Identity Levels 0–4 (implemented)

Full vocabulary: [skills/e9-identity-levels/README.md](../skills/e9-identity-levels/README.md).
Assignment rules: [protocol.md](./protocol.md#level-assignment).

Levels describe **identity confidence**, not authorization.

| Level | Name | Evidence on an Identity Token |
| ----- | ---- | ----------------------------- |
| 0 | Inferred | No Grant. No `fields` claim |
| 1 | Provided | `profile` with at least one self-asserted field; contacts not verified |
| 2 | Contact Confirmed | `profile.email_verified` or `phone_verified`, or email-link / password with verified email |
| 3 | Trusted Provider Confirmed | `auth.provider` in the Site/delegate trust policy (default `google.com`); fresh `auth_time` |
| 4 | Trusted Provider Strongly Confirmed | Level 3 plus `auth.two_factor` / `amr` includes `mfa` or `swk` |

Levels 5–7 (real-world proofing) are reserved. Tokens do not emit
`verified_claims` yet.

Use `describeLevel(n)` and `meetsLevel(identity, n)` from `@engine9/id/levels`.
Sites should set `minimum_identity_level` per feature and call
`ensureLevel(n)` to step up.

## Sign-in screen

Delegate's sign-in screen offers Google only by default, because Google
sign-in is what reaches Level 3–4. An emailed sign-in link reaches Level 2
at most, so delegate shows it only when the site sends `loginLevel: 2`
(`login_level=2`), and never when `minLevel` is 3 or more. The screen does
not change the Level a sign-in earns.

| Site option | Screen |
| --- | --- |
| none, `loginLevel: 3`, or `loginLevel: 4` | Google |
| `loginLevel: 2` (with `minLevel` 0–2) | Google, or email me a sign-in link |

Details: [README](../README.md#sign-in-screens-google-only-or-google-plus-an-email-link),
[protocol](./protocol.md#sign-in-screen-login_level).
