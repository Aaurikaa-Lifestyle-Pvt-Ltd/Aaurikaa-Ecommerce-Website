---
name: verify-project
description: Identify affected AAURIKAA apps (backend, admin, frontend), run the relevant npm test and build commands, and report failures accurately. Use after implementation, before claiming completion, or when QA verifies a change.
---

# Verify Project

Repeatable test/build verification for this monorepo-style layout. Do **not** invent shell wrappers that hide app logic — run the package scripts directly.

## 1. Identify affected apps

| Change area | Apps to verify |
|---|---|
| `backend/**` | Backend tests (scoped if possible) |
| `admin/**` | Admin `test` + `build` when UI/integration changed |
| `frontend/**` | Storefront `test` + `build` when UI/integration changed |
| Shared docs/agents only | No app tests required |

If unsure, verify every touched app.

## 2. Commands

Run from repo root with `cd` into the app:

**Backend**

```bash
cd backend && npm test
```

Scoped (preferred when you know the files):

```bash
cd backend && npx jest path/to/test.js --runInBand
```

**Admin**

```bash
cd admin && npm test
cd admin && npm run build
```

**Storefront**

```bash
cd frontend && npm test
cd frontend && npm run build
```

## 3. Report accurately

For each command record:

- Working directory
- Exact command
- Exit code
- Pass/fail summary (counts if available)
- First failing assertion / build error (truncate long logs)

Never claim green without running. If env/DB/credentials block a suite, report **BLOCKED** with the error — do not skip silently.

## 4. Safety

- Do not modify application code inside this skill’s workflow unless the user/orchestrator asked for fixes
- Do not run Git commands
- Do not hit live PhonePe/Shiprocket/production APIs for “verification”
