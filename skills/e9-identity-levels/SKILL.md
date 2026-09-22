---
name: e9-identity-levels
description: >-
  Explains engine9 Identity Levels 0–7 (Inferred through High-Assurance):
  confidence, not authorization; digital 0–4 vs real-world 5–7; NIST/OIDC
  mapping; minLevel policy. Use when the user mentions identity level, IAL,
  Level 0/1/2/3/4, inferred vs provided vs confirmed, or step-up identity.
---

# engine9 Identity Levels

Read [README.md](./README.md) in this folder — it is the full product
vocabulary.

Wire protocol and implemented 0–4 assignment:
[`docs/protocol.md`](../../docs/protocol.md) and
[`docs/levels.md`](../../docs/levels.md).

## Rules for agents

- Levels are **identity confidence**, never Roles or permissions.
- Use **User**, **Domain**, **Profile**, **Grant**, **Identity Token**.
- Do not label a provider as a level (“Google = 4”). Google + fresh MFA can
  *qualify* for Level 4; the token `level` is computed per event.
- Levels 5–7 are reserved (real-world proofing). Do not invent endpoints.
