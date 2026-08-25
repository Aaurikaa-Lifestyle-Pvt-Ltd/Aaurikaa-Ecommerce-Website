# ANBAZAR Multi-Vendor E-Commerce Platform

## Technical Debt & Risk Registry

Long-Term Engineering Governance & Regression Intelligence  
Project Type: Multi-Vendor E-Commerce Marketplace (Next.js + Express + MongoDB)  
Document Type: Living registry — not a bug log, not a changelog

**Canonical location:** `docs/governance/TECHNICAL_DEBT_REGISTRY.md` (sole Technical Debt Registry; do not maintain a second copy at repository root)

**Last updated:** 2026-08-15 (Scope 5 technical-debt reconciliation; duplicate root copy removed)  
**Related plan:** `refined_shopper_order_execution_blueprint.md`  
**Related Scope 5 sources:** `SCOPE_5_IMPLEMENTATION_BASELINE.md`, `SCOPE_5_COMPLETION_REPORT.md`, `docs/governance/MASTER_DOCUMENT.md` §27

This registry records **architectural debt**, **regression risk**, **security and operational weaknesses**, and **governance requirements** identified from the repository and structured architecture review. Items are evidence-based; where the implementation cannot be fully verified, uncertainty is called out explicitly.

### Resolution status legend

| Status | Meaning |
| ------ | ------- |
| **OPEN** | Not addressed |
| **PARTIAL** | Mitigated but follow-up required |
| **RESOLVED** | Addressed per stated scope; verify in production |

---

## 1. Purpose of This Document

### Why technical debt tracking matters

Unrecorded debt compounds: changes that appear local can break distant workflows (checkout, tax, shipping, payouts). A shared registry makes trade-offs visible and prevents repeated rediscovery of the same failure modes.

### Why architectural risk visibility matters

This platform couples **monetary flows**, **logistics**, **tax compliance**, and **multi-actor auth** (admin, seller, shopper). Risks in one layer (e.g. route ordering, public APIs) propagate as financial or customer-trust issues.

### Why regression intelligence matters

Regressions here are not only “bugs” but **workflow integrity** failures: wrong totals, duplicate commissions, unreachable dispute paths, or fulfillment gaps. Documenting *where* the system is fragile reduces the cost of every change.

### Why AI-assisted development requires structured debt governance

AI tools optimize for local diffs. Without a debt registry, generated changes can violate route order, skip server-side authority, or alter financial paths. This document is a **pre-flight checklist** for human and AI authors alike.

### This document must be reviewed before

- Major refactors of order, product, or payment modules  
- **Checkout** or cart pipeline changes  
- **Financial workflow** changes (commission, ledger, payout, coupon, After-Sales refund, Shopper Wallet)  
- **After-Sales** or return-request workflow changes  
- **Shipping** or Shiprocket-related changes  
- **Scaling** or multi-instance deployment plans  
- **Security** hardening (auth, rate limits, public APIs)  
- **Infrastructure migration** (DB topology, process model, caching)

---

## 2. Technical Debt Classification System

### Severity scale

| Severity   | Meaning |
| ---------- | ------- |
| **LOW**    | Minor maintainability or clarity issue; limited blast radius. |
| **MEDIUM** | Moderate operational, debugging, or scalability concern; can cause incident under load or bad config. |
| **HIGH**   | Significant architectural, security, or maintainability concern; can cause data or trust issues. |
| **CRITICAL** | Immediate risk to correctness, security, or financial workflow integrity. |

### Debt categories

| Category | Scope |
| -------- | ----- |
| **Architecture Debt** | Layering, coupling, route design, service boundaries. |
| **Security Debt** | AuthZ/AuthN, token handling, exposure of endpoints, input abuse. |
| **Performance Debt** | Hot paths, N+1 patterns, heavy synchronous work. |
| **Workflow Debt** | Order/payment/fulfillment state machines and handoffs. |
| **Scalability Debt** | Multi-instance behavior, shared state, job execution. |
| **Maintainability Debt** | File size, duplication, unclear ownership. |
| **Operational Debt** | Cron, sync jobs, third-party failure handling, observability. |
| **Financial Workflow Debt** | Tax, commission, ledger, payout consistency. |
| **API Governance Debt** | Public vs protected routes, rate limits, contract discipline. |

---

## 3. Critical Technical Debt Registry

Structured entries for prioritized issues. Identifiers (TD-xxx) are stable for cross-referencing in PRs and audits.

---

## TD-001 — Commission Route Shadowing

### Status

**RESOLVED** (repository verification 2026-08-15; production runtime **Unable to verify from the current repository evidence**)

**Scope 5 classification:** Resolved in current code (not claimed as a Scope 5 feature deliverable). Admin RBAC work left a single admin dispute route.

### Severity

**CRITICAL** (historical, while dual registration existed)  
**Current residual:** none for Express shadowing. Seller-initiated dispute on this path is **not registered**; that is a product/API surface choice, not remaining route-shadowing debt.

### Category

Architecture Debt, Financial Workflow Debt, API Governance Debt

### Affected Areas

- `backend/routes/commissionRoutes.js` (current: single `PATCH /:id/dispute` after `verifyAdmin` + `loadAdminContext` + `requirePermission("finance", "manage")`)  
- `backend/controllers/commissionController.js` (dispute handler)  
- Historical: any client expecting **seller** `PATCH /api/commissions/:id/dispute`

### Problem Description (historical)

`commissionRoutes.js` previously registered **two** routes with the **same path and method** (admin then seller). Express matched the first; the seller registration was unreachable.

### Resolution evidence (2026-08-15)

Current `commissionRoutes.js` applies `router.use(verifyAdmin, loadAdminContext)` and registers **one** `PATCH /:id/dispute` gated by finance **manage**. No `verifySeller` duplicate on this path. The original shadowing defect is gone.

### Remaining note (not this TD)

If product still requires a seller-owned commission dispute API, that would be a **new capability**, not a reopening of route shadowing.

### Priority Recommendation

**Closed** — do not re-register the same path twice for different roles.

---

## TD-002 — Public Pricing API Exposure

### Status

**OPEN** — **Not Affected by Scope 5**

### Severity

**HIGH**

### Category

Security Debt, API Governance Debt, Performance Debt (abuse)

### Affected Areas

- `backend/routes/pricingRoutes.js`  
- `backend/controllers/pricingController.js` (handlers referenced by the router)  
- Callers: e.g. `frontend/utils/pricing.js` and any other clients

### Problem Description

`pricingRoutes.js` wires **POST** endpoints for cart pricing, coupon validation, tax/shipping calculation, and related operations **without** an authentication or rate-limit middleware in the router file. A **GET** `/health` route is also public (expected for health checks).

### Root Cause

Pricing surfaced as a reusable calculation API without an API gateway layer or uniform **auth / throttle** policy at the router.

### Business Impact

- **Coupon probing** and scraping of pricing rules behavior.  
- **Abuse / DoS amplification** via CPU-heavy tax/shipping calculations.  
- Competitive intelligence leakage depending on controller responses.

### Regression Risk

“Fixing” pricing logic becomes harder when unauthorized traffic skews metrics or load tests.

### Recommended Resolution

- Require appropriate tokens or signed checkout sessions for sensitive endpoints where feasible; alternatively **strict rate limiting** (IP + user), API keys for server-side callers, or moving heavy calculation behind authenticated checkout steps.  
- Treat `/health` separately from business POST routes.

### Priority Recommendation

**Short-Term**

---

## TD-003 — Dual OTP Architecture

### Status

**OPEN** — **Not Affected by Scope 5**

### Severity

**HIGH**

### Category

Architecture Debt, Workflow Debt, Maintainability Debt

### Affected Areas

- `backend/utils/otpService.js` (Mongo `OTP` model + email flow)  
- `backend/models/Shopper.js` (`otp`, `otpExpiry` fields on shopper document)  
- Shopper auth controllers (`backend/controllers/shopperController.js` — referenced by `shopperRoutes.js` for `send-otp` / `verify-otp`)

### Problem Description

The codebase shows **at least two** OTP-related persistence strategies: a dedicated **`OTP` collection** used by `otpService`, and **fields on `Shopper`** for OTP storage. Admin and seller flows also use `otpService` patterns per route wiring.

### Root Cause

Evolution of auth flows without consolidating on a single OTP store and invalidation policy.

### Business Impact

Inconsistent lockout, expiry, and audit behavior between flows; higher support burden and harder security review.

### Regression Risk

A fix in one path may not apply to another; testers may validate only one flow.

### Recommended Resolution

Consolidate OTP storage, expiry, rate limits, and audit logging under **one service + one schema strategy**, with migration for legacy fields.

### Priority Recommendation

**Mid-Term**

**Uncertainty:** Full parity across admin/seller/shopper OTP paths — **Unable to determine from current codebase** without reading every auth controller method.

---

## TD-004 — In-Memory Cache Architecture

### Status

**OPEN** — **Not Affected by Scope 5** (homepage/slider caches still use in-process cache where applicable)

### Severity

**MEDIUM**

### Category

Scalability Debt, Operational Debt

### Affected Areas

- `backend/utils/cache.js` (`node-cache`, TTL defaults)

### Problem Description

Caching uses **in-process** `node-cache`. Each Node process has its **own** memory space; entries are not shared across instances.

### Root Cause

Lightweight caching without Redis or another shared store.

### Business Impact

Under horizontal scaling, behavior becomes **non-deterministic** across instances (stale vs fresh depending on which instance serves traffic).

### Regression Risk

Features that “work on one server” fail under load-balanced deployment.

### Recommended Resolution

Move shared cache to **Redis** (or equivalent) for production multi-instance topologies; keep `node-cache` only for single-instance dev or strictly local non-critical data.

### Priority Recommendation

**Mid-Term**

---
## TD-005 — localStorage JWT Strategy

### Status

**OPEN** — **Not Affected by Scope 5**

### Severity

**HIGH**

### Category

Security Debt, Architecture Debt

### Affected Areas

- `frontend/utils/axiosInstance.js` (tokens read from `localStorage` by route prefix)  
- `frontend/pages/_app.js` (`adminToken` for maintenance bypass checks)  
- Any page storing `shopperToken`, `sellerToken`, `adminToken`

### Problem Description

JWTs stored in **browser localStorage** are readable by any script executing in the origin context. **XSS** (cross-site scripting) remains a primary theft vector.

### Root Cause

SPA-friendly token storage without HttpOnly cookie strategy or BFF (backend-for-frontend) token handling.

### Business Impact

Session theft can lead to unauthorized orders, admin actions, or account abuse.

### Regression Risk

New UI libraries or third-party scripts increase XSS surface; security reviews must repeat per release.

### Recommended Resolution

Evaluate **HttpOnly**, **Secure**, **SameSite** cookies or a dedicated auth service; tighten CSP and XSS defenses regardless of token migration.

### Priority Recommendation

**Mid-Term** (defense-in-depth); **Short-Term** for CSP/input sanitization reviews.

---

## TD-006 — Oversized Route Files

### Status

**OPEN** — **Not Affected by Scope 5** as a resolution. After-Sales logic was extracted into dedicated services (does not split `blogRoutes.js` or fully decompose `sellerOrderController.js`).

### Severity

**HIGH**

### Category

Maintainability Debt, Regression Risk

### Affected Areas

- `backend/routes/blogRoutes.js` — very large file with many inline handlers (grep shows dozens of routes).  
- `backend/routes/pricingRoutes.js` — fewer routes but delegates to complex calculations (risk when combined with TD-002).  
- `backend/controllers/sellerOrderController.js` — commission, ledger, Shiprocket hooks, transactions (high semantic density).

### Problem Description

Large route files mix routing with substantial inline logic. Large controllers concentrate financial and fulfillment side effects.

### Root Cause

Incremental feature growth without extraction into dedicated controllers/services per subdomain.

### Business Impact

Slower reviews, higher probability of **wrong merge conflict resolution**, and accidental route ordering bugs.

### Regression Risk

Small edits can have non-local effects; tests may not cover all branches.

### Recommended Resolution

Split **blog** routes by concern (public vs admin vs engagement); extract seller order **commission/ledger** paths into a dedicated service module with tests.

### Priority Recommendation

**Short-Term** (blog routes); **Mid-Term** (seller order controller decomposition).

---

## TD-007 — Duplicate Shopper Order Route Systems

### Status

**PARTIAL** (Phase 1, 2026-05-27; **Partially Mitigated** — listing unified; dual/triple mount remains)

**Scope 5 classification:** Not resolved. Scope 5 **added** `shopperReturnRoutes` on the same `/api/shopper/orders` prefix.

### Severity

**MEDIUM** (was HIGH confusion risk; listing behavior now unified)

### Category

Architecture Debt, Maintainability Debt, API Governance Debt

### Affected Areas

- `backend/server.js` — mounts `/api/shopper`, then `/api/shopper/orders` (`shopperOrderRoutes` **and** `shopperReturnRoutes`)  
- `backend/routes/shopperRoutes.js` — `GET /orders` → `listShopperOrders`  
- `backend/routes/shopperOrderRoutes.js` — `GET /` listing, `GET /:id` detail, `POST /:id/buy-again` (Phases 2, 5)  
- `backend/routes/shopperReturnRoutes.js` — After-Sales eligibility / Need Help / evidence / appeal (Scope 5)  
- `backend/controllers/shopperOrderController.js` — listing, detail, Buy Again orchestration  
- `backend/services/shopperOrderListService.js` — `shopperOrderListDTO`  
- `backend/services/shopperOrderDetailService.js` — `shopperOrderDetailDTO` (Phase 2+)

### Problem Description

Two routers both expose **`GET /api/shopper/orders`** (same effective URL). Express handles the request with the **first** matching mounted router (`/api/shopper`), so the second mount was **redundant** for that path. Historically, `shopperOrderRoutes.js` returned a **raw Order array** while `shopperController.getShopperOrders` returned `{ orders }` with different populate fields — fixes could land on the wrong file.

### Phase 1 resolution (completed scope)

- Single handler: `shopperOrderController.listShopperOrders` wired from **both** route files.  
- Normalized paginated DTO response (`orders` + `pagination`); no raw Order documents on listing.  
- Integration tests: listing, detail, Buy Again under `backend/tests/controllers/` and `backend/tests/unit/`.
- Frontend cancel URL corrected to `PUT /api/orders/:id/cancel` (was incorrectly calling `/api/shopper/orders/:id/cancel`).

### Remaining work

- **Collapse dual Express mount** in `server.js` once all consumers verified (optional backward-compat period).  
- Remove dead legacy handler body from `shopperController` re-export pattern if desired.  
- Keep After-Sales routes on a **single** shopper-order router (or a clearly nested sub-router) so a third overlapping mount is not required.

### Root Cause

Overlapping route design during evolution of shopper APIs.

### Business Impact

Reduced listing inconsistency and frontend/API contract drift; developer confusion on **which file to edit** remains until mount is collapsed.

### Regression Risk

Low for listing if changes go through `shopperOrderController` + `shopperOrderListService` only. Re-introducing a second listing implementation would regress TD-007.

### Recommended Resolution

Remove redundant router mount or namespace sub-routes under one router; keep **one** listing handler and DTO module documented in blueprint Phase 1 record.

### Priority Recommendation

**Short-Term** (mount collapse only)

---

## TD-011 — Shopper Order Listing Returned Raw Mongoose Documents

### Status

**RESOLVED** (Phase 1, 2026-05-27) — **Not Affected by Scope 5** (listing remains DTO-based; After-Sales summary fields may be added to the DTO without reopening raw-document exposure)

### Severity

**MEDIUM**

### Category

API Governance Debt, Maintainability Debt

### Affected Areas

- Former `shopperOrderRoutes.js` inline handler (raw array)  
- Now: `shopperOrderListService.shopperOrderListDTO`

### Problem Description

Shopper listing previously exposed full Order documents (payment fields, Shiprocket internals, inconsistent populate). Frontend derived display from raw schema shapes.

### Resolution

Listing API returns `shopperOrderListDTO` only: safe fields, `paymentVisibility` via `paymentVisibilityService`, read-only `trackingSummary`, `cancelEligibility`, `invoiceAvailable`, `itemsPreview`.

### Priority Recommendation

**Closed** — detail DTO pattern extended in Phase 2 via `shopperOrderDetailService.shopperOrderDetailDTO`.

---

## TD-012 — Commission Not Created When Order Reaches Delivered via Shiprocket Polling

### Status

**OPEN** — **Not Affected by Scope 5** (After-Sales refund/commission reversal is a separate financial path and does not close this delivered-commission gap)

### Severity

**HIGH**

### Category

Financial Workflow Debt, Workflow Debt, Operational Debt

### Affected Areas

- `backend/services/orderFulfillmentService.js` — `updateStatusFromShiprocket` / `pollTrackingUpdates`  
- `backend/controllers/sellerOrderController.js` — commission + ledger on seller `delivered` status update only

### Problem Description

Commission and `SellerLedger` entries are created in `sellerOrderController.updateOrderStatus` when status is set to **`delivered`**. Shiprocket polling can set order status to **`delivered`** directly on the Order document **without** invoking that controller path.

### Root Cause

Dual writers to order status: manual seller/admin transitions vs automated logistics polling.

### Business Impact

Seller payouts and commission records may be **missing** for orders that reach delivered state only through tracking sync.

### Regression Risk

Any enhancement to polling or status mapping can widen the commission gap.

### Recommended Resolution

Extract shared `onOrderDelivered(orderId)` idempotent handler (commission + ledger) invoked from **both** seller status API and fulfillment polling; guard with existing duplicate commission checks.

### Priority Recommendation

**Short-Term** (separate governance ticket — see blueprint “Separate technical debt items”)

---

## TD-013 — Review verifiedPurchase Query Uses Wrong Order Schema Fields

### Status

**RESOLVED** (Phase 4, 2026-05-27) — **Not Affected by Scope 5**

### Severity

**MEDIUM**

### Category

Workflow Debt, Maintainability Debt

### Affected Areas

- `backend/controllers/reviewController.js` — `createCustomerReview`  
- `backend/models/Order.js` — `buyer` field (not `user.id`)  
- `backend/services/reviewEligibilityService.js` — authoritative eligibility for order detail

### Problem Description

Verified-purchase lookup used `"user.id": shopperId` and status `"completed"` (not in Order enum). Query effectively never matched; `verifiedPurchase` stayed false.

### Resolution (Phase 4)

- Query corrected to `{ buyer: shopperId, "items.product": productId, status: "delivered" }`.  
- `reviewEligibilityService` exposes per-item eligibility on order detail DTO.  
- Frontend review CTAs on order detail use backend eligibility only.

### Remaining follow-up (optional)

API-level gate blocking review submission when no delivered order exists — deferred; query fix restores `verifiedPurchase` on create.

### Priority Recommendation

**Closed** (Phase 4)

---

## TD-014 — Missing Shopper Order Read APIs (Detail, Tracking, Shipping)

### Status

**PARTIAL** (Phases 1–3 complete; Scope 5 Point N redirected `/order-tracking` → `/orders`; legacy `ShopperShipping` consumer still open)

**Scope 5 classification:** **Partially Mitigated** — canonical shopper tracking is `/orders`. Mock tracking page is no longer the live path (`order-tracking.js` redirects; `next.config.js` 308). Remaining: `frontend/pages/shipping.js` → `ShopperShipping.js` still calls `GET /api/shopper/orders/shipping`, which is **not** established as implemented.

### Severity

**MEDIUM**

### Category

Architecture Debt, API Governance Debt

### Affected Areas

- `frontend/components/ShopperShipping.js` — calls `GET /api/shopper/orders/shipping` (not established as an implemented route)  
- `frontend/pages/shipping.js` — still mounts `ShopperShipping`  
- `frontend/pages/order-tracking.js` — **redirects to `/orders`** (Scope 5 Point N); leftover mock markup may remain unmounted  
- `GET /api/shopper/orders/:id` — **implemented** (Phase 2)  
- `shopperOrderDetailService.buildShipmentSummary` — **enhanced** read-only tracking on detail DTO (Phase 3)  
- Shopper list tracking summary / After-Sales badges — list-level status visibility exists on `/orders`

### Problem Description

Post-purchase read layer was fragmented: listing existed in multiple shapes; detail, tracking, and shipping endpoints missing or broken. Mock UIs masked contract gaps.

### Phase resolutions (completed scope)

| Phase | Delivered |
| ----- | --------- |
| **1** | Authoritative paginated listing with DTO at `GET /api/shopper/orders`. |
| **2** | Order detail DTO + `GET /api/shopper/orders/:id`; frontend `/orders/[id]`. |
| **3** | Read-only `shipmentSummary` on detail DTO (shopper-friendly labels, partial fulfillment); no Shiprocket mutation. |
| **4** | Per-item `reviewEligibility` on detail DTO (related read surface, not shipping). |
| **5** | `POST /api/shopper/orders/:id/buy-again` orchestration (write path adjacent to read layer). |

### Remaining work

- Implement or remove `GET /api/shopper/orders/shipping` consumed by `ShopperShipping.js` / `/shipping`.  
- Optional cleanup of unmounted mock markup in `order-tracking.js`.

### Priority Recommendation

**Short-Term** (shipping endpoint / dead consumer cleanup)

---

## TD-015 — Shopper Cancellation Lacks Fulfillment Guards

### Status

**OPEN** (read-only `cancelEligibility` flag added Phase 1; governance not implemented) — **Not Affected by Scope 5**

### Severity

**HIGH**

### Category

Workflow Debt, Financial Workflow Debt, Operational Debt

### Affected Areas

- `backend/routes/orderRoutes.js` — `PUT /:id/cancel`  
- `frontend/pages/orders.js` / `ShopperOrderListView` — cancel UI respects `cancelEligibility` from API

### Problem Description

Shopper cancel allows only `pending` / `pending_verification` by status, but does **not** check `shiprocketShipments`, AWB, or `trackingNumber`. Paid orders cannot be cancelled via API even if shipment not yet created. COD moves to `processing` immediately — shopper cancel path unavailable. No inventory rollback on cancel.

### Phase 1 mitigation

Listing DTO exposes **`cancelEligibility`** mirroring **current** route rules only (not full governance). Frontend uses correct cancel endpoint.

### Recommended Resolution

Blueprint **Phase 6:** block cancel after shipment creation, AWB, dispatch; audit logging; optional reason codes; no refund/payout changes in same ticket.

### Priority Recommendation

**Mid-Term** (Phase 6 — HIGH risk)

---

## TD-016 — No Inventory Decrement on Order Creation

### Status

**OPEN** — **Not Affected by Scope 5**

### Severity

**HIGH**

### Category

Financial Workflow Debt, Workflow Debt

### Affected Areas

- `backend/services/orderProcessingService.js` — stock validation only  
- `backend/routes/orderRoutes.js` — `salesCount` increment only

### Problem Description

Checkout validates stock at order time but **does not decrement** `product.stock` or `variantStock` on save. Cancellation rollback therefore has nothing to restore.

### Business Impact

Overselling under concurrency; cancel/archive flows cannot restore inventory accurately.

### Recommended Resolution

Separate architecture audit ticket; define reservation vs decrement-at-pay vs decrement-at-order policy before Phase 6 cancellation work.

### Priority Recommendation

**Long-Term** (governance ticket — blueprint item #2)

---

## TD-008 — Cron Duplication Risk

### Status

**OPEN** — **Not resolved by Scope 5.** Scope 5 **expanded** the same pattern: After-Sales SLA jobs also run in-process.

### Severity

**MEDIUM**

### Category

Operational Debt, Scalability Debt

### Affected Areas

- `backend/server.js` — `node-cron` for payment verification; `setInterval` for Shiprocket polling; After-Sales SLA cron (`afterSalesSlaService.runAfterSalesSlaJobs`, `AFTER_SALES_SLA_CRON` / `DISABLE_AFTER_SALES_SLA_CRON`)  
- `backend/jobs/paymentVerificationJob.js`  
- `backend/services/afterSalesSlaService.js`

### Problem Description

Scheduled work runs **inside the API process**. Multiple instances (horizontal scaling) each run the same cron and interval timers unless externally coordinated. After-Sales seller reminders and admin escalations inherit this duplication (duplicate emails possible under multi-instance deploy).

### Root Cause

No distributed lock or dedicated worker tier.

### Business Impact

Duplicate reconciliation attempts against gateways or duplicate polling load; harder reasoning about “exactly-once” semantics.

### Regression Risk

Deploying more replicas increases background job duplication linearly.

### Recommended Resolution

Dedicated worker process(es), distributed locks (Redis), or leader election; move cron off every API replica.

### Priority Recommendation

**Mid-Term**

---

## TD-009 — Heavy Checkout Dependency Coupling

### Status

**OPEN** — **Not Affected by Scope 5** (Shopper Wallet is not in the checkout pipeline)

### Severity

**HIGH**

### Category

Architecture Debt, Workflow Debt, Financial Workflow Debt

### Affected Areas

- `backend/services/orderProcessingService.js`  
- `backend/services/gstEngineService.js`  
- `backend/services/shippingEngineService.js`  
- `backend/controllers/paymentController.js`  
- `backend/services/orderFulfillmentService.js`

### Problem Description

Order creation chains **coupon validation**, **shipping calculation**, **GST calculation**, and persistence in one conceptual pipeline; payment and fulfillment then depend on order state. Failures or inconsistencies in one stage cascade.

### Root Cause

Monolithic orchestration without compensating transactions across external systems (MongoDB vs Shiprocket vs PhonePe).

### Business Impact

Partial failures (e.g. paid order but weak fulfillment sync) require operational intervention.

### Regression Risk

Any refactor of tax or shipping math affects **declared totals** and downstream commission bases.

### Recommended Resolution

Explicit **state machine**, idempotent external calls, structured saga/compensation policies documented per integration.

**Phase 5 note:** `cartAddService` extracted shared cart-add path for manual add and Buy Again; **checkout pipeline (`orderProcessingService`) unchanged** — reduces duplication without decoupling checkout orchestration.

### Priority Recommendation

**Short-Term** (documentation + tests); **Mid-Term** (structural).

---

## TD-010 — Variant Engine Synchronization Dependency

### Status

**OPEN** — **Not Affected by Scope 5**

### Severity

**HIGH**

### Category

Maintainability Debt, Financial Workflow Debt

### Affected Areas

- `backend/utils/variantUtils.js`  
- `frontend/utils/variantUtils.js`  
- `backend/routes/orderRoutes.js` (variant validation on checkout)  
- `frontend/pages/product/[slug].js` (variant UX)

### Problem Description

Variant combination validation and pricing logic exist on **both** backend and frontend. The backend must remain authoritative; divergence causes rejected checkouts or incorrect display.

### Root Cause

Shared business rules implemented twice for UX responsiveness.

### Business Impact

Cart abandonment, mismatch errors, and support tickets when rules drift.

### Regression Risk

Updating only one copy of `variantUtils` breaks end-to-end consistency.

### Recommended Resolution

Single source of truth: generated/shared package, contract tests, or server-first preview API for variant price.

**Phase 5 note:** Buy Again reuses backend variant/stock authority via `cartAddService.addItemToShopperCart` — historical order snapshots are never trusted for cart writes.

### Priority Recommendation

**Mid-Term**

---

## TD-017 — After-Sales Evidence Upload Not Bound to Eligibility or Case Lifecycle

### Status

**OPEN** (identified 2026-08-15 from repository evidence)

### Severity

**MEDIUM**

### Category

Operational Debt, Security Debt

### Affected Areas

- `backend/controllers/shopperReturnController.js` — `uploadReturnEvidence`  
- `backend/middleware/returnEvidenceUpload.js`  
- `backend/routes/shopperReturnRoutes.js` — `POST /:id/return-evidence`

### Problem Description

Need Help evidence is uploaded to R2 after `verifyShopper` and **order ownership** checks only. The handler does **not** re-run return-window / eligibility checks used by `createReturnRequest`. Uploaded objects are returned as URLs; there is no established bind-to-case or orphan cleanup if the shopper never submits Need Help.

MIME/type/size filters exist (`returnEvidenceUpload.js`). This is not an unauthenticated public upload.

### Root Cause

Upload is a pre-submit step decoupled from eligibility and `ReturnRequest` persistence.

### Business Impact

Authenticated shoppers can store evidence for ineligible orders; orphaned R2 objects accumulate; storage cost/abuse within auth+ownership limits.

### Recommended Resolution

Gate upload on the same eligibility used for Need Help create, and/or attach uploads to a draft case with TTL/cleanup.

### Priority Recommendation

**Short-Term** (eligibility gate); **Mid-Term** (orphan cleanup)

---

## TD-018 — Dual ReturnRequest Lifecycles (Legacy Refund + After-Sales)

### Status

**OPEN** (identified 2026-08-15 from repository evidence)

### Severity

**MEDIUM**

### Category

Maintainability Debt, Workflow Debt

### Affected Areas

- `backend/models/ReturnRequest.js` — `caseFlow` (`legacy` vs `after_sales`)  
- `backend/utils/returnStatusGuards.js` / `afterSalesCaseSpine.js` — two transition graphs  
- `backend/routes/adminReturnRoutes.js` — legacy `refund-review` / `refund-complete` **and** after-sales `override`

### Problem Description

Admin After-Sales APIs retain **legacy refund** review/complete paths alongside **after-sales** override. Guards exist to block mixing actions across `caseFlow` (unit tests in `returnStatusGuards.test.js`). Dual graphs increase the chance that a future edit applies to the wrong lifecycle.

This is **not** a finding that Replacement/Repair logistics are missing (intentional current boundary).

### Root Cause

After-Sales was layered onto an earlier return/refund status model without retiring the legacy admin write path.

### Business Impact

Higher regression cost on admin return tooling; operators may see two conceptual refund models.

### Recommended Resolution

Freeze or retire legacy write paths once no live `caseFlow: legacy` cases remain; single admin governance path for after-sales.

### Priority Recommendation

**Mid-Term**

---

## 4. Security Risk Registry

| Risk | Affected systems | Severity | Mitigation recommendation |
| ---- | ---------------- | -------- | ------------------------- |
| **JWT in localStorage** | Frontend auth, axios callers | **HIGH** | Reduce XSS risk (CSP, sanitization); long-term HttpOnly/BFF pattern (TD-005). |
| **Unauthenticated pricing POST APIs** | `pricingRoutes.js` | **HIGH** | Rate limit + auth or gateway; separate health from business endpoints (TD-002). |
| **Rate limiting gaps** | `server.js` applies login limiters in production to specific paths only | **MEDIUM–HIGH** | Extend thoughtful limits to OTP and sensitive POST endpoints after threat model review. |
| **Upload attack surface** | Multiple multer/R2 upload middlewares; After-Sales evidence (`returnEvidenceUpload.js`) | **MEDIUM** | Centralize size/type validation; After-Sales evidence is auth+ownership gated but not eligibility-gated (TD-017). |
| **Public comment posting** | `commentRoutes.js` registers `POST /` without `verify*` in router layer | **MEDIUM–HIGH** | Verify controller-side spam controls; add CAPTCHA/rate limit if missing. |
| **Coupon enumeration** | `couponRoutes.js` exposes `GET /` without `verifyAdmin` in router | **MEDIUM** | Restrict listing to admin or obfuscate codes for campaigns. |

**Uncertainty:** Exact spam controls inside comment controllers — **Unable to determine from current codebase** without reading handler implementations.

---

## 5. Scalability Risk Registry

| Topic | Evidence | Risk |
| ----- | -------- | ---- |
| **In-memory cache** | `backend/utils/cache.js` | No cross-instance coherence (TD-004). |
| **Cron + interval in API process** | `server.js` (payment verify, Shiprocket poll, After-Sales SLA) | Duplicate execution per replica (TD-008). |
| **Synchronous heavy paths** | GST + shipping engines invoked during order creation | CPU spikes under concurrent checkout. |
| **Repeated recalculation** | Shipping engine loads products from DB per calculation (`shippingEngineService.js` patterns) | DB load at scale. |
| **No distributed queue in app stack** | Dependencies lack Redis/Bull-style worker libraries in reviewed manifests | Background work colocated with HTTP. |
| **Large route/controller files** | `blogRoutes.js`, `sellerOrderController.js` | Harder to optimize per-route caching or sharding. |

---

## 6. Maintainability Risk Registry

| Topic | Notes |
| ----- | ----- |
| **Tightly coupled services** | Order processing ↔ tax ↔ shipping ↔ coupon in one pipeline (TD-009). |
| **Duplicated logic** | Frontend/backend `variantUtils` (TD-010). |
| **Shopper order read layer** | Listing + detail DTOs unified (TD-007 PARTIAL, TD-011 RESOLVED, TD-014 PARTIAL); `/order-tracking` redirects to `/orders`; `ShopperShipping` still calls missing shipping API. |
| **Cart add duplication** | Phase 5 extracted `cartAddService`; `cartController.test.js` mocks need `Product.findById` update (test debt, not production). |
| **Inconsistent HTTP client usage** | Raw `axios`/`fetch` vs `utils/axiosInstance.js` (optional utility, limited adoption). |
| **Large route files** | `blogRoutes.js` and similar (TD-006). |
| **Validation centralization** | Mix of `middleware/validation.js`, `validateRegistration`, and inline checks — risk of inconsistent enforcement. |

---

## 7. Operational Risk Registry

| Topic | Evidence / notes |
| ----- | ---------------- |
| **Shiprocket sync failures** | `orderFulfillmentService.js` catches API errors per seller group; order may persist without shipments. |
| **Payment reconciliation gaps** | `paymentVerificationJob.js` skips orders newer than 15 minutes; client verify still primary for fresh orders. |
| **Payout reconciliation** | Payout and commission flows span seller + admin controllers — operational discipline required. |
| **Cron duplication** | Multiple Node instances duplicate jobs including After-Sales SLA (TD-008). |
| **Tracking drift** | Polling relies on Shiprocket tracking responses; failures skip updates in loops. |
| **Pickup resolution failure** | Logs indicate missing pickup can block or skip shipment creation for a seller group. |

---

## 8. Financial Workflow Risk Registry

**High priority:** monetary correctness and auditability.

| Risk | Description |
| ---- | ----------- |
| **Commission route shadowing** | **RESOLVED** in current `commissionRoutes.js` (TD-001). Do not re-introduce dual role registrations on the same path. |
| **Commission timing** | Commissions created on **delivered** path in `sellerOrderController.js` with transaction fallback when Mongo replica set unavailable — integrity risk on standalone Mongo. |
| **Commission vs polling** | Shiprocket polling may set `delivered` without commission creation (TD-012). |
| **Payout consistency** | `Payout` schema enforces transitions; linkage to commissions requires controller discipline. |
| **Ledger duplication** | `SellerLedger` unique index on `{ seller, createdAt }` — collision if two entries share timestamp. |
| **GST dependency chain** | Order totals depend on `gstEngineService` + item inputs; shipping and coupons feed the chain (TD-009). |
| **Order total authority** | Order creation recomputes totals server-side; frontend totals must never be trusted as authoritative. |
| **After-Sales refund / wallet** | Refund credits `ShopperWalletLedger` with per-case idempotency. Checkout redemption is an **intentional boundary**, not debt. Dual legacy/after-sales admin paths: TD-018. |

---

## 9. Dangerous-To-Modify Modules

| Module / File | Risk Level | Why Sensitive |
| ------------- | ---------- | ------------- |
| `backend/services/orderProcessingService.js` | **CRITICAL** | Orchestrates discounts, coupons, shipping, GST, order payload shape. |
| `backend/services/gstEngineService.js` | **CRITICAL** | Tax compliance and totals. |
| `backend/services/shippingEngineService.js` | **HIGH** | Shipping charges and zone logic drive revenue and downstream tax base. |
| `backend/controllers/paymentController.js` | **CRITICAL** | PhonePe lifecycle, order payment state, fulfillment triggers. |
| `backend/services/orderFulfillmentService.js` | **HIGH** | Shiprocket sync, tracking poll side effects. |
| `backend/controllers/sellerOrderController.js` | **CRITICAL** | Status transitions, commission + ledger, transactions. |
| `backend/routes/pricingRoutes.js` | **HIGH** | Public pricing surface + abuse potential (TD-002). |
| `backend/routes/commissionRoutes.js` | **HIGH** | Financial dispute/approve/pay paths; **TD-001 shadowing resolved** — still treat as sensitive. |
| `backend/services/returnRefundOrchestrationService.js` | **HIGH** | After-Sales refund → wallet credit + financial reversal. |
| `backend/services/shopperWalletService.js` | **HIGH** | Shopper wallet credit ledger; idempotency and balance integrity. |
| `backend/utils/afterSalesCaseSpine.js` | **MEDIUM** | After-Sales status/resolution graph; dual-flow with legacy (TD-018). |
| `backend/services/shopperOrderListService.js` | **LOW** (listing read layer) | Safe to extend DTO; do not embed fulfillment or payment writes. |
| `backend/services/shopperOrderDetailService.js` | **LOW** (detail read layer) | DTO-only; shipment/review fields are read-only projections. |
| `backend/services/buyAgainService.js` | **MEDIUM** (orchestration) | Reuses `cartAddService`; must not bypass live stock/variant validation. |
| `backend/services/cartAddService.js` | **MEDIUM** (shared cart path) | Used by manual add-to-cart and Buy Again; changes affect cart integrity pre-checkout. |
| `backend/services/reviewEligibilityService.js` | **LOW** (read/eligibility) | No order lifecycle writes; keep aligned with `reviewController` verifiedPurchase rules. |
| `backend/controllers/shopperOrderController.js` | **LOW–MEDIUM** (read + Buy Again orchestration) | Listing/detail are read-only; `buyAgainFromOrder` delegates to `buyAgainService` — do not embed checkout or fulfillment logic. |

**Shopper order enhancement:** Do not modify `orderProcessingService`, `paymentController`, or `orderFulfillmentService` when working on listing/detail read APIs or Buy Again unless explicitly scoped (blueprint Phases 1–5 observed this boundary).

---

## 10. Architectural Weakness Summary

### Security Weaknesses

Public pricing endpoints; JWTs in localStorage; selective rate limiting; potential public coupon listing and comment POST exposure — see Section 4.

### Scaling Weaknesses

In-process cache; cron/interval per replica; synchronous checkout pipeline — see Section 5.

### Workflow Weaknesses

Tight checkout → tax → shipping → payment → fulfillment coupling; Shiprocket partial failure modes — Sections 7–8.

### Maintainability Weaknesses

Very large route files; duplicated variant logic; shopper order **listing + detail** consolidated (TD-007 PARTIAL, TD-011 RESOLVED, TD-014 PARTIAL) — `/order-tracking` redirects to `/orders`; `ShopperShipping` dead consumer remains. After-Sales dual lifecycle: TD-018.

### Operational Weaknesses

Gateway reconciliation windows; tracking polling sensitivity; pickup dependency — Section 7.

---

## 11. Recommended Future Refactor Roadmap

### Short-Term Improvements

- ~~Fix **commission route shadowing** (TD-001).~~ **RESOLVED** in current repository (2026-08-15).  
- **Complete TD-007:** collapse duplicate `/api/shopper/orders` Express mounts (now including After-Sales return routes) after consumer verification.  
- **TD-014 remainder:** implement or remove `GET /api/shopper/orders/shipping` / fix `ShopperShipping.js` dead route.  
- **TD-017:** bind After-Sales evidence upload to eligibility / case lifecycle.  
- **TD-012:** idempotent commission on delivered regardless of status writer (separate ticket).  
- Fix **`cartController.test.js`** mocks after `cartAddService` extraction (Phase 5 test debt).  
- Add **API protection** for pricing endpoints (rate limit / auth policy) (TD-002).  
- Split **`blogRoutes.js`** into smaller routers by domain (TD-006).  
- Document canonical **checkout dependency graph** for all engineers and AI agents.

### Mid-Term Improvements

- **OTP consolidation** (TD-003).  
- **Redis** for shared cache and/or rate limiting; introduce **distributed locks** for cron/workers (TD-004, TD-008 — includes After-Sales SLA cron).  
- **Variant logic** alignment via shared package or contract tests (TD-010).  
- Refactor **`sellerOrderController.js`** into smaller units with focused tests.  
- **Shopper cancellation governance** (TD-015, Phase 6) and **inventory decrement policy** (TD-016).  
- **TD-018:** retire or freeze legacy ReturnRequest admin write paths.  
- ~~**Review verifiedPurchase fix** (TD-013, Phase 4)~~ — **RESOLVED.**

### Long-Term Improvements

- **Queue-based workers** for payment reconciliation and Shiprocket polling.  
- **JWT strategy** evolution (HttpOnly/BFF) with hardened XSS defenses (TD-005).  
- **Centralized validation** and OpenAPI-style route inventory for governance.

### Scope J — Deferred Enhancements

Items intentionally deferred during Scope J (Phases 3–4). Not blockers for completed phase acceptance.

### Scope J Search UX Enhancement

| Field | Value |
| ----- | ----- |
| **Status** | Deferred |
| **Priority** | Low |
| **Description** | Current backend requires 2+ characters for name search. Potential future enhancement: display *"Enter at least 2 characters"* when search length &lt; 2. Not required for Scope J. |

### Scope J Selection State Consistency

| Field | Value |
| ----- | ----- |
| **Status** | Deferred |
| **Priority** | Low |
| **Description** | Selection state may remain after filter/sort changes. Future enhancement: clear selection whenever visible dataset changes. Not required for Scope J. |

### Scope J Variant Media Visibility

| Field | Value |
| ----- | ----- |
| **Status** | Deferred |
| **Priority** | Medium |
| **Description** | Variant-level media exists in the product architecture (`product.variantMedia[variantKey]` with `mainImage`, `galleryImages`, `video`) but is not visible from admin/seller product listing previews. Phase 4 exposes product-level `galleryImages` and `video` only; variant media is used on PDP, Quick View, order processing (variant main image snapshot), and import/export, but listing operators must open edit pages to review variant assets. |
| **Future enhancement** | Provide operational visibility into variant main images, variant galleries, and variant videos from product listing pages without requiring navigation into product edit flows. |
| **Reason** | Variant media is actively used by PDP, Quick View, order processing, and import/export workflows; listing-only product-level previews can show “No Gallery” / “No Video” when assets exist only on variant combinations. Not required for Scope J. |

### Taxonomy Referential Integrity Review

| Field | Value |
| ----- | ----- |
| **Status** | Deferred |
| **Priority** | Medium |
| **Description** | Category deletion currently does not enforce cascade deletion or orphan prevention for related Subcategories and Child Categories. Future review should determine: cascade delete strategy, soft delete strategy, orphan prevention strategy, and taxonomy integrity policy. Not required for Scope J. |

---

## 12. AI Development Governance Warnings

**These warnings are mandatory for AI-assisted and rapid development:**

1. **Never modify checkout** without tracing **GST engine**, **shipping engine**, **coupon validation**, and **order persistence** in `orderProcessingService.js`.  
2. **Never independently change variant pricing rules** on frontend without verifying **`backend/utils/variantUtils.js`** and order validation in **`orderRoutes.js`**.  
3. **Never trust frontend totals** — server recomputation is authoritative.  
4. **Route ordering** in Express must be verified after any change to **`commissionRoutes.js`** or overlapping `/api/shopper/orders` mounts (TD-001 closed for shadowing; TD-007 still open).  
5. **Financial logic** (commission, ledger, payout, After-Sales refund, Shopper Wallet credit) requires **integration/regression tests** before merge.  
6. **Never add authenticated behavior** by only editing **`axiosInstance.js`** — many calls use raw `axios`/`fetch`.  
7. **Assume multi-instance deployment** when changing cron or cache behavior (including After-Sales SLA — TD-008).  
8. **Shopper order work:** Phases 1–5 complete per `refined_shopper_order_execution_blueprint.md` — **Phase 6 (cancellation governance) is next**; do not skip fulfillment guards (TD-015).  
9. **Never add fulfillment or payment side effects** to `shopperOrderListService` / `shopperOrderDetailService` / listing-detail controllers (read layer only).  
10. **Buy Again** must route through `buyAgainService` → `cartAddService`; never write cart lines from historical order price/stock snapshots.  
11. **Do not treat Shopper Wallet as checkout tender.** Credit-only ledger is the current boundary.  
12. **Do not duplicate After-Sales** (`ReturnRequest` / return routes / wallet credit). Extend existing services.

---

## 13. Scope 5 Reconciliation

Reconciled 2026-08-15 against `SCOPE_5_COMPLETION_REPORT.md` and the current repository. This is **not** a Scope 5 changelog.

### Debts resolved

| ID | Note |
| -- | ---- |
| **TD-001** | Commission route shadowing gone; single admin `PATCH /:id/dispute` with RBAC. Production runtime unverified. |

### Debts still open (not resolved by Scope 5)

TD-002, TD-003, TD-004, TD-005, TD-006, TD-008, TD-009, TD-010, TD-012, TD-015, TD-016.

### Debts partially mitigated

| ID | Note |
| -- | ---- |
| **TD-007** | Listing DTO still unified; `/api/shopper/orders` now has an additional After-Sales mount. |
| **TD-014** | `/order-tracking` → `/orders`; `ShopperShipping` / missing shipping API remains. |

### Previously resolved (unchanged)

TD-011, TD-013.

### New evidence-based debt

| ID | Severity | Summary |
| -- | -------- | ------- |
| **TD-017** | MEDIUM | After-Sales evidence upload not eligibility- or case-bound. |
| **TD-018** | MEDIUM | Dual ReturnRequest lifecycles (legacy admin refund paths + after-sales). |

TD-008 was **updated** (not duplicated) for After-Sales SLA in-process cron.

### Intentionally excluded (not technical debt)

| Observation | Classification |
| ----------- | -------------- |
| Point O PageSpeed deferred | **Scope exception** |
| Catalog-level free shipping not implemented | **Scope exception** (existing rule/coupon engine remains) |
| Wallet checkout redemption absent | **Intentional boundary** |
| Replacement/Repair manual follow-up | **Intentional boundary** (Scope 5 baseline) |
| Full-order After-Sales refund scope | **Open business/financial decision**, not registry debt |
| Mixed-cart return eligibility aggregation | **Open business decision**, not registry debt |
| Career public module env flags | **Operational configuration**; production enablement unverified |
| Category extended-description / listing-column gaps | **Scope exception** (Point C) |
| Header hover runtime unverified | **Verification gap**, not debt |
| Shopper DTO omitting `statusHistory` | UX/contract completeness; not established as architectural risk |
| Wallet credit idempotency / ledger uniqueness | **No defect found** (`idempotencyKey` unique; skip-on-duplicate) |

---

## 14. Final Governance Notes

Technical debt is not a backlog of shame; it is **inventory**. Visibility reduces replication of failures and aligns refactoring with business risk. Dependency awareness — especially **checkout → tax → shipping → payment → fulfillment** — is prerequisite for safe change. Regression-aware development is mandatory because many defects manifest as **silent financial or logistical drift** rather than obvious runtime errors. Architectural discipline — route clarity, auth boundaries, worker topology, and single sources of truth — is now a **gating concern** for a multi-vendor marketplace handling payments, tax logic, and third-party logistics.

---

**Document control:** Update this registry when merges materially change risk posture (new public APIs, auth changes, financial paths, or deployment model).

| Date | Change |
| ---- | ------ |
| 2026-05-27 | TD-007 → PARTIAL; TD-011 RESOLVED; added TD-012–TD-016 from shopper order audit; Phase 1 listing DTO per blueprint |
| 2026-05-27 | Phases 2–5: TD-013 RESOLVED; TD-014 PARTIAL (detail + read-only shipment done); documented `shopperOrderDetailService`, `reviewEligibilityService`, `buyAgainService`, `cartAddService`; Phase 6 next per blueprint |
| 2026-06-04 | Scope J Phase 3 complete: product table UX (admin/seller); deferred search hint + selection-clear-on-filter documented in §11 |
| 2026-06-04 | Scope J Variant Media Visibility deferred (Medium) — listing previews omit `variantMedia`; documented in §11 after Phase 4 audit |
| 2026-06-04 | Scope J Phase 5 complete: server-side brand listing pagination (admin Brand Manager) |
| 2026-06-04 | Scope J Phase 6 complete: hierarchy group pagination (`GET /api/categories/hierarchy`); Taxonomy Referential Integrity Review deferred (Medium) in §11 |
| 2026-08-15 | Scope 5 reconciliation: TD-001 RESOLVED; TD-007/TD-014 PARTIAL updated; TD-008 includes After-Sales SLA cron; added TD-017, TD-018; §13 Scope 5 Reconciliation |

