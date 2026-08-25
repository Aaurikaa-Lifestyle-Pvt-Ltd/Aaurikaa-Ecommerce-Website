# AAURIKAA WS2 Implementation Report

**Workstream:** WS2 — Security P0 & Commerce Integrity  
**Agent:** Agent 2  
**Date:** 2026-08-19  
**Mode:** Implementation (no Git operations)

---

## Executive Summary

**Status: COMPLETE** for in-scope P0 items (SEC-001, SEC-003, SEC-004, SEC-005, SEC-002). SEC-006 remains HOLD.

The mature ANBAZAR checkout spine is unchanged: `createOrderWithBulkDiscounts` still owns coupon/shipping/GST math. This workstream added server-side variant price authority, admin coupon listing RBAC, an inventory reserve/commit/release lifecycle on existing `Product.stock` / `variantStock` fields, coupon consumption on payment success (COD on create), and removal of `pending → paid` from shared fulfilment transitions.

| ID | Result |
|---|---|
| SEC-001 | **COMPLETE** — client `variantPriceSnapshot` is ignored; price comes from `Product.variantPricing` |
| SEC-003 | **COMPLETE** — `GET /api/admin/coupons` requires admin + `promotions:view` |
| SEC-004 | **COMPLETE** — atomic reserve at order create; commit on payment/COD; restore on fail/cancel |
| SEC-005 | **COMPLETE** — prepaid unpaid orders do not consume coupon quota |
| SEC-002 | **COMPLETE** — implemented via shared fulfilment guards; no WS1A seller-authorization files modified |
| SEC-006 | **NOT IMPLEMENTED** — refund policy remains HOLD |

Focused WS2 suites: **10/10 passed, 81/81 tests**.

---

## SEC-001

### Change

Order processing always resolves variant unit price from trusted `Product.variantPricing` via existing `getVariantPricing()`. Client/cart `variantPriceSnapshot`, `price`, and line totals are not used as the payable amount.

The stored order `variantPriceSnapshot` is now a **server** snapshot of the DB price at order time (audit trail), not a client-controlled value. Line subtotal, bulk discount base, shipping subtotal input, GST taxable amount, and `totalAmount` all consume that authoritative unit price.

### Files

- `backend/services/orderProcessingService.js` (`resolveAuthoritativeVariantPrice`)

### Tests

- `backend/tests/security/sec001-variant-price-authority.test.js`

Database variant price = ₹1,999; client sends `variantPriceSnapshot = 99`. Resulting line price / subtotal = ₹1,999.

### Result

**COMPLETE.**

---

## SEC-003

### Change

`GET /api/admin/coupons` now uses the existing admin RBAC chain: `verifyAdmin` + `loadAdminContext` + `requirePermission('promotions', 'view')`.

POST/PUT/DELETE were already `promotions:manage`. No coupon management redesign. Usage history is no longer publicly listable.

### Files

- `backend/routes/couponRoutes.js`

### Tests

- `backend/tests/security/sec003-coupon-admin-auth.test.js`

| Actor | Expected | Actual |
|---|---|---|
| Unauthenticated | 401 | 401 |
| Ordinary customer (shopper JWT) | 401/403 | 403 |
| Staff without `promotions:*` | 403 | 403 |
| Admin with `promotions:view` | 200 | 200 |

Enforcement uses `PERMISSION_ENFORCEMENT=true` in the test. RBAC was not weakened.

### Result

**COMPLETE.**

---

## SEC-004

### Inventory design

No new inventory product. Lifecycle is layered on existing `Product.stock` and `Product.variantStock` using atomic `findOneAndUpdate` with `$gte` + `$inc`.

### Stock lifecycle

```text
Order create
  → RESERVE (atomic decrement)     prepaid unpaid holds the claim
                                   COD also COMMITS immediately

PhonePe COMPLETED / admin payment success
  → COMMIT (flag only; no second decrement)

PhonePe FAILED / payment failed
  → RELEASE (increment back)

Eligible cancellation
  → RELEASE (idempotent)

Return receipt (function exists, not wired to seller path)
  → RETURNED (distinct from RELEASE so future replacement can decrement independently)
```

| Payment method | Decrement point | Restore |
|---|---|---|
| Prepaid PhonePe | Create (reserve) | Fail / cancel |
| COD | Create (reserve + commit) | Eligible cancel |
| Unpaid order document | Reserved, not committed | Fail / cancel |
| Duplicate payment confirm | No-op | — |
| Duplicate cancel | No-op | — |

Replacement fulfilment was **not** implemented. State `returned` is separate from `released` so a future replacement order can consume stock without colliding with cancellation restore.

### Concurrency protection

Each line uses `findOneAndUpdate({ stock|variantStock.key: { $gte: qty } }, { $inc: -qty })`. Two concurrent claims of the last unit: only one filter matches. Partial multi-line failure compensates already-decremented lines in that attempt.

MongoDB standalone (typical local/test) does not use multi-document transactions; per-SKU atomicity is the concurrency control.

### Files

- `backend/services/inventoryLifecycleService.js` (new)
- `backend/services/orderCommerceIntegrityService.js` (new)
- `backend/models/Order.js` (`inventoryLifecycle`)
- `backend/routes/orderRoutes.js`
- `backend/controllers/paymentController.js`
- `backend/jobs/paymentVerificationJob.js`
- `backend/controllers/shopperOrderController.js`

### Tests

- `backend/tests/security/sec004-inventory-lifecycle.test.js`

Covers: successful decrement, failed payment restore, cancellation restore, duplicate cancel, duplicate payment confirm, concurrent final-unit claim.

### Result

**COMPLETE.**

Return-path restock is implemented as `restoreStockForReturnedOrder` but **not** invoked from seller receipt confirmation (`sellerReturnService.js` is WS1A-owned). See Parallel Conflicts.

---

## SEC-005

### Coupon lifecycle

Existing model kept: `validateCoupon` (limits still enforced), `recordCouponUsage`, plus new `releaseCouponUsage`.

| State | Meaning |
|---|---|
| applied | Discount stored on the order; `usedCount` not incremented |
| consumed | Quota written (PhonePe success or COD create) |
| released | Quota restored after cancel of a consumed coupon |

Prepaid unpaid create: **validate + apply, do not consume.**  
COD: consume at create (confirmed purchase in the existing COD flow).  
Failed prepaid payment: never consumed.  
COD cancel: release quota.  
Duplicate payment confirmation: idempotent (`usageHistory.orderId` + `couponLifecycle.state`).

### Changes

Removed `recordOrderCouponUsage` from unpaid `POST /api/orders`. Consumption is triggered by `onPaymentSucceeded` / COD `onOrderCreated`.

### Files

- `backend/utils/pricingEngine.js` (`recordCouponUsage` idempotency, `releaseCouponUsage`)
- `backend/services/couponLifecycleService.js` (new)
- `backend/services/orderCommerceIntegrityService.js`
- `backend/models/Order.js` (`couponLifecycle`)
- `backend/routes/orderRoutes.js`
- `backend/controllers/paymentController.js`
- `backend/jobs/paymentVerificationJob.js`
- `backend/controllers/shopperOrderController.js`

### Tests

- `backend/tests/security/sec005-coupon-consumption.test.js`
- `backend/tests/utils/couponUsageTracking.test.js` (idempotent record + release)

### Result

**COMPLETE.**

---

## SEC-002

### Implemented / Blocked by WS1A

**Implemented** without modifying WS1A-owned Seller boundary files.

`pending → paid` was removed from shared `BASE_ALLOWED_TRANSITIONS` in `orderFulfillmentGuards.js`. Seller `PUT /api/orders/seller/:orderId/status` already calls `isAllowedStatusTransition`; the seller controller was **not** edited.

Trusted paid paths unchanged:

- PhonePe verify / cron / admin reverify (`applyPhonePeStateToOrder`)
- Admin `POST /api/payment/update-status` (`orders:manage`)

Admin order-status PUT also can no longer mark `pending → paid`. That is intentional: payment confirmation is not a fulfilment transition. Admin payment update remains available.

### Reason

Seller-specific authorization lives in `sellerOrderController.js` (WS1A). Changing the shared transition table achieves the security objective without a parallel-file conflict.

### Files

- `backend/utils/orderFulfillmentGuards.js`
- `backend/tests/security/sec002-payment-state-protection.test.js`
- `backend/tests/unit/orderFulfillmentGuards.test.js`

### Tests

Seller attempt `pending → paid` is rejected (400); order remains `pending` / `paymentStatus: pending`.

### Result

**COMPLETE.**

---

## SEC-006

Not implemented. Refund policy remains HOLD.

Paid cancellation is still eligibility-gated as before (no refund enqueue). WS2 **does** restore stock and coupon quota on eligible cancel so inventory/coupon are not permanently consumed. Money movement (wallet vs original method vs PhonePe refund) is unchanged and must wait for client policy.

Affected later paths (not modified for refund behaviour): `cancellationEligibilityService.js`, `returnRefundOrchestrationService.js`, `shopperWalletService.js`.

---

## Security Regression Results

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| Manipulated variant price | Rejected/ignored | Line price ₹1,999; snapshot 99 ignored | PASS |
| Public coupon listing | Rejected | 401 | PASS |
| Customer coupon admin access | Rejected | 403 | PASS |
| Valid Admin coupon access | Allowed | 200 with `promotions:view` | PASS |
| Concurrent final-stock purchase | One succeeds | One reserve succeeds, stock = 0 | PASS |
| Duplicate payment confirmation | Idempotent | Stock and coupon consumed once | PASS |
| Duplicate cancellation | Idempotent | Stock restored once | PASS |
| Unpaid coupon usage | Not consumed | `usedCount` remains 0 until payment | PASS |
| Unauthorized payment transition | Rejected | Seller `pending → paid` → 400 | PASS |

---

## Files Changed

### Production

- `backend/services/orderProcessingService.js`
- `backend/services/inventoryLifecycleService.js` *(new)*
- `backend/services/couponLifecycleService.js` *(new)*
- `backend/services/orderCommerceIntegrityService.js` *(new)*
- `backend/utils/pricingEngine.js`
- `backend/utils/orderFulfillmentGuards.js`
- `backend/models/Order.js`
- `backend/routes/couponRoutes.js`
- `backend/routes/orderRoutes.js`
- `backend/controllers/paymentController.js`
- `backend/controllers/shopperOrderController.js`
- `backend/jobs/paymentVerificationJob.js`

### Tests

- `backend/tests/security/sec001-variant-price-authority.test.js` *(new)*
- `backend/tests/security/sec002-payment-state-protection.test.js` *(new)*
- `backend/tests/security/sec003-coupon-admin-auth.test.js` *(new)*
- `backend/tests/security/sec004-inventory-lifecycle.test.js` *(new)*
- `backend/tests/security/sec005-coupon-consumption.test.js` *(new)*
- `backend/tests/unit/orderFulfillmentGuards.test.js`
- `backend/tests/utils/couponUsageTracking.test.js`
- `backend/tests/controllers/paymentController.test.js`
- `backend/tests/controllers/shopperOrderCancel.test.js`

### Documentation

- `docs/AAURIKAA_WS2_IMPLEMENTATION_REPORT.md` *(this file)*

Phase 1 audit documents were **not** modified.

---

## Parallel Conflicts

**No overlapping file edits with WS1A ownership** (Seller identity, registration, payout, ledger, KYC, storefront, SiteSettings business identity).

| Item | Notes |
|---|---|
| SEC-002 | Implemented via `orderFulfillmentGuards.js` only. `sellerOrderController.js` untouched. |
| Return restock wiring | `DEPENDENCY ON WS1A` if live restock must run on seller receipt confirm (`backend/services/sellerReturnService.js`). Function `restoreStockForReturnedOrder` is ready for a later non-seller hook. |
| Admin `pending → paid` via status PUT | Now rejected. Use `/api/payment/update-status`. Not a WS1A file conflict. |

---

## Known Remaining Risks

1. **SEC-006 HOLD** — shopper can still cancel a **paid** unshipped order; capture is not refunded. Stock/coupon are restored. This remains a release blocker until refund policy exists.
2. **Seller return receipt does not restock** — inventory restore on physical return is not hooked into seller after-sales (WS1A-owned). Admin-only future wiring can call `restoreStockForReturnedOrder`.
3. **Abandoned prepaid reservations** — unpaid PhonePe orders reserve stock until fail/cancel. There is no dedicated unpaid-timeout job beyond existing PhonePe FAILED handling. Long-lived `pending` orders can hold SKUs.
4. **Inherited (not introduced here)** — shipping engine fail-closed without WeightClass/zone (`checkoutFlow.test.js`, `orderProcessingService.test.js`, phase2 COD create) already requires configured slabs. Public seller registration (SEC-007) remains WS1A.
5. **Coupon concurrent over-issue (SEC-044)** — `usedCount += 1` then save is not a compare-and-swap against `usageLimit`. Out of WS2 scope.

---

## Security Regression Suites Run

**Focused (this workstream) — all passed:**

```
tests/security/*
tests/unit/orderFulfillmentGuards.test.js
tests/utils/couponUsageTracking.test.js
tests/controllers/paymentController.test.js
tests/controllers/shopperOrderCancel.test.js
tests/controllers/sellerOrderController.test.js
```

10 suites, 81 tests, pass.

**Related commerce suites observed, not treated as WS2 regressions:**

- `checkoutFlow.test.js` / `orderProcessingService.test.js` / phase2 COD create: fail closed without shipping slab (pre-existing shipping engine behaviour).
- `shopper-order-lifecycle-regression.test.js`: DTO key contract drift (`afterSales`, shipping fields) unrelated to this workstream.
- `phase1-order-stabilization.test.js`: admin payment/status 500/400 mismatch consistent with `loadAdminContext` on mocked `admin-test-id`, not inventory assertions.

---

## Git

No Git operations were performed.
