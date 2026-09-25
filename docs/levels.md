# Identity Levels 0–4 (implemented)

Full vocabulary: [skills/e9-identity-levels/README.md](../skills/e9-identity-levels/README.md).
Assignment rules: [protocol.md](./protocol.md#level-assignment).

Levels describe **identity confidence**, not authorization.

| Level | Name | Evidence on an Identity Token |
| ----- | ---- | ----------------------------- |
| 0 | Inferred | `domain_profile` is `aud:anonymous`; no `profile` |
| 1 | Provided | `profile` with at least one self-asserted field; contacts not verified |
| 2 | Contact Confirmed | `profile.email_verified` or `phone_verified`, or email-link / password with verified email |
| 3 | Trusted Provider Confirmed | `auth.provider` in the Site/delegate trust policy (default `google.com`); fresh `auth_time` |
| 4 | Trusted Provider Strongly Confirmed | Level 3 plus `auth.two_factor` / `amr` includes `mfa` or `swk` |

Levels 5–7 (real-world proofing) are reserved. Tokens do not emit
`verified_claims` yet.

Use `describeLevel(n)` and `meetsLevel(identity, n)` from `@engine9/id/levels`.
Sites should set `minimum_identity_level` per feature and call
`ensureLevel(n)` to step up.
