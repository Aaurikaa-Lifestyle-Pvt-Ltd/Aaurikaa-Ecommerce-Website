# AAURIKAA AI Development Workflow

Engineering operating document for autonomous multi-agent work in this repository.

## Purpose

Enable large implementation intents to be planned and executed through a **lead orchestrator** plus specialist agents — without manually decomposing every task into tiny prompts, and without inventing parallel commerce engines.

This document describes **orchestration only**. It does not authorize a specific feature mission.

## Repository layout

```text
aaurikaa-ecommerce/
├── AGENTS.md                 # Global AI context
├── .cursor/rules/            # Always-on architectural guardrails
├── .cursor/agents/           # Specialist subagents
├── .cursor/skills/           # Repeatable workflows (e.g. verify-project)
├── backend/                  # Express + Mongoose (ANBAZAR-derived)
├── admin/                    # Next.js Admin
├── frontend/                 # Next.js storefront
└── docs/                     # SRS, audits, stage reports
```

Sources of truth: **code** for implementation; **SRS** for functional requirements. Audits/reports aid planning but must be verified against the repo.

## Available agents

| Agent | Role |
|---|---|
| `lead-orchestrator` | Inspect, classify, plan, delegate, integrate, final report |
| `catalogue-agent` | Catalogue domain (taxonomy, product, variant, SKU, media, SEO, import/export) |
| `frontend-agent` | Admin/storefront UI and API integration UX |
| `backend-contract-agent` | Read-first contracts/gaps; backend edits only when truly required |
| `qa-agent` | Independent verification (tests, builds, leakage, HOLDs) |

Invoke via Cursor custom agents / Task delegation using these names. Prefer starting large work with **lead-orchestrator**.

## Rules (guardrails)

| Rule file | Enforces |
|---|---|
| `architecture.mdc` | Reuse-first, service ownership, inspect before build |
| `aaurika-single-store.mdc` | No marketplace UX / seller picker / commissions UI |
| `financial-safety.mdc` | Server authority; no invented refund/financial policy |
| `frontend.mdc` | API-driven UI, contracts, a11y, loading/error/empty |

## Skills

| Skill | When |
|---|---|
| `verify-project` | After implementation or during QA — run affected `npm test` / `npm run build` |

## Delegation rules (orchestrator)

1. **Inspect first** — no implementation delegation before repo understanding  
2. **Reuse first** — classify REUSE / ADAPT / BUILD / CONFIGURE / HOLD  
3. **No overlapping ownership** — one owner per core file surface  
4. **Parallel only when safe** — independent file sets only  
5. **Integration is mandatory** — orchestrator owns completion  
6. **Tests are part of implementation** — not a follow-up wish  
7. **No fake completion** — BLOCKED/HOLD/CONFIGURE when decisions/data/credentials are missing  

## Specialist handoff format

Every specialist returns:

- **Completed**
- **Files changed**
- **Backend/API contracts used**
- **Tests**
- **Known issues**
- **Blockers**
- **Integration notes**

## Expected execution lifecycle

```text
User Intent
    → Lead Orchestrator
    → Repository Inspection
    → SRS / Architecture Analysis
    → REUSE / ADAPT / BUILD / CONFIGURE / HOLD
    → Task Decomposition (minimal, safe)
    → Specialist Agents
    → Integration (orchestrator)
    → Independent QA
    → Tests + Builds
    → Completion Report
```

## How to request a large mission

Address the **lead orchestrator** with a clear intent, constraints, and definition of done. Example shape (do not treat as an active mission):

> Make AAURIKAA Catalogue Administration fully operational using the existing ANBAZAR backend. Reuse existing APIs. No seller picker. No invented catalogue data. Include tests and builds. Report HOLD/BLOCKED items explicitly.

Include:

- Scope boundaries (what not to touch)
- Any known HOLD decisions
- Whether backend changes are allowed
- Verification expectations

## Architectural guardrails (summary)

- REUSE > ADAPT > BUILD  
- Single-store: Seller is internal compatibility only  
- Backend engines authoritative for money, tax, stock, coupons, order/payment state  
- HOLD stays HOLD (especially refund policy)  
- No Git unless explicitly requested  

## Related docs

- `AGENTS.md`
- `docs/SRS_Aaurikaa_Ecommerce_Website.md`
- `docs/AAURIKAA_BACKEND_CAPABILITY_MATRIX.md`
- `docs/AAURIKAA_SECURITY_BASELINE_AUDIT.md`
- `docs/AAURIKAA_SELLER_DEPENDENCY_SPIKE.md`
- `docs/TECHNICAL_DEBT_REGISTRY.md`
