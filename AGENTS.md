# AAURIKAA — Agent Development Context

## Project identity

AAURIKAA is a **single-business jewellery e-commerce** website built on the existing **ANBAZAR** commerce engine.

This repository is an independent assembly (`frontend/`, `admin/`, `backend/`, `docs/`). It is not a marketplace product.

| Layer | Stack | Path |
|---|---|---|
| Backend | Express + MongoDB/Mongoose | `backend/` |
| Admin | Next.js 16 | `admin/` |
| Storefront | Next.js 16 | `frontend/` |

Sources of truth:

- **Implementation:** the repository code
- **Functional requirements:** `docs/SRS_Aaurikaa_Ecommerce_Website.md`
- Docs may lag code; inspect code before trusting any audit report

Key references (use actual filenames):

- `docs/AAURIKAA_BASELINE.md`
- `docs/AAURIKAA_BACKEND_CAPABILITY_MATRIX.md`
- `docs/AAURIKAA_SECURITY_BASELINE_AUDIT.md`
- `docs/AAURIKAA_SELLER_DEPENDENCY_SPIKE.md`
- `docs/TECHNICAL_DEBT_REGISTRY.md`
- Stage/WS reports under `docs/AAURIKAA_*.md`

Nested `admin/AGENTS.md` and `frontend/AGENTS.md` are Next.js runtime notices — keep them.

## Core principle

**REUSE > ADAPT > BUILD.**

Before creating anything new: search existing routes, controllers, services, models, Admin/storefront components, and tests. Prefer existing ANBAZAR business engines whenever they satisfy the requirement.

Classify every requirement as: **REUSE | ADAPT | BUILD | CONFIGURE | HOLD**. Only BUILD when capability genuinely does not exist.

## Single-store boundary

AAURIKAA is **NOT** a marketplace.

- `Seller` remains an **internal compatibility entity** where the backend requires it (e.g. product ownership, GST origin, Shiprocket grouping).
- Do **not** expose marketplace concepts to AAURIKAA customers or Admin unless explicitly required.
- Do **not** introduce seller selection into AAURIKAA Admin workflows.

Do not expose (unless explicitly requested):

- seller marketplace browsing / storefronts / onboarding
- seller selection / picker
- commissions / payouts / marketplace financial UI

## Backend authority

Never trust frontend calculations for: price, variant price, tax, shipping, coupon, inventory, payment status, order state, refund state.

Existing backend engines remain authoritative. Frontends consume APIs; they do not invent commerce math.

## Financial safety

Do not casually modify: payment, refund, coupon, tax, inventory, commission, wallet, or order-state logic.

Inspect existing services and tests first. Preserve security invariants from `docs/AAURIKAA_SECURITY_BASELINE_AUDIT.md`.

**Do not invent refund policy.**

## HOLD discipline

Business decisions marked HOLD in the SRS/audits must remain HOLD. Do not invent:

- refund destination, timelines, or jewellery-specific return policy
- jewellery catalogue seed data, collection/occasion marketing copy, or client business rules

Mark blocked work as **BLOCKED / HOLD / CONFIGURE**. Do not fake completion.

## Architecture habits

- Backend: `routes/` → controllers → `services/` → `models/`
- Do not create parallel engines (second catalogue, second pricing, second inventory, etc.)
- Preserve API contracts unless the task explicitly changes them
- Import/export and variant logic are sensitive — inspect before changing product schema

## Testing

Every implementation must include appropriate tests and must run affected suites/builds:

| App | Tests | Build |
|---|---|---|
| Backend | `cd backend && npm test` (or scoped jest) | n/a (Node) |
| Admin | `cd admin && npm test` | `cd admin && npm run build` |
| Storefront | `cd frontend && npm test` | `cd frontend && npm run build` |

Use `.cursor/skills/verify-project` for verification workflow.

## Git

Do **not** perform Git operations unless explicitly instructed.

## Multi-agent orchestration

Large intents go to the **lead-orchestrator** agent. See `docs/AI_DEVELOPMENT_WORKFLOW.md` and `.cursor/agents/`.
