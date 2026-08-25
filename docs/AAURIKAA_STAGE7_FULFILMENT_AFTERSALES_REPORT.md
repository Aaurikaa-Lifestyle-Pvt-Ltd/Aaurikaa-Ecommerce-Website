# AAURIKAA Stage 7 — Fulfilment & After-Sales

**Stage:** Fulfilment & After-Sales  
**Date:** 2026-08-19  
**Mode:** Inspect existing ANBAZAR fulfilment first. Reuse engines. Implement only demonstrated gaps. No invented refund policy. No production Shiprocket setup. No catalogue seed. No Git operations.

---

## 1. Verdict

The post-order spine already existed on the ANBAZAR engines:

**Order → cancellation (eligibility-gated) → Shiprocket shipment/AWB/tracking poll → after-sales Need Help (evidence, review, reverse pickup, inspection, resolution).**

Stage 7 reused that spine. Genuine gaps closed:

- Eligible **cancellation** already restored inventory idempotently (WS2). Storefront can now cancel.
- **Return receipt** now restocks via the existing `returned` inventory state (distinct from cancel `released`).
- Approved **replacement** now creates a zero-total outbound `Order` (`fulfilmentKind: replacement`) that uses WS2 reserve+commit and the normal Shiprocket sync path.
- Customer and Admin can see shipment/AWB/tracking and after-sales status where the APIs already supported it.

**Refund processing remains HOLD.** AAURIKAA refund policy is not approved. Admin after-sales does not offer refund as a resolution. Inherited ANBAZAR wallet-refund code is unchanged and is not the AAURIKAA policy.

**Shiprocket production is CONFIGURE.** The API layer, shipment create, AWB, label, 15-minute poll, and reverse pickup already exist. They fail closed without `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` and a real pickup `shiprocketId`. Placeholder pickup `900000001` is not a live warehouse.

---

## 2. Requirement matrix

| SRS requirement | Existing capability / evidence | Classification | Gap / dependency | Changes implemented |
|---|---|---|---|---|
| **Order cancellation where applicable** | `cancellationEligibilityService`; `PUT /api/orders/:id/cancel`; blocks shipped / AWB / shipment; WS2 `onOrderCancelled` idempotent restore | **REUSE** / **ADAPT** (UI) | Storefront did not call cancel | Account order detail cancel form |
| **Shipment creation** | `orderFulfillmentService.syncToShiprocket` after paid/processing or COD; groups by internal seller | **REUSE** / **CONFIGURE** | Credentials + pickup | Admin Sync Shiprocket button calls existing API |
| **Courier / AWB** | `generateAWB`; stored on `shiprocketShipments.trackingNumber` | **REUSE** / **CONFIGURE** | Same | Admin Generate AWB; customer AWB on DTO |
| **Shipment tracking / status / delivery** | 15-min poll `updateStatusFromShiprocket`; shopper `shipmentSummary` + timeline | **REUSE** / **ADAPT** (UI) | Poll needs AWB + credentials | Storefront tracking link; Admin shipment card |
| **Customer-facing tracking** | Shiprocket tracking URL on order DTO | **ADAPT** | UI omitted fields | Order detail shows status, AWB, track link |
| **Admin shipment information** | Admin list included shipments; Admin UI ignored them; `GET /api/admin/orders/:id` missing | **ADAPT** | — | GET by id; mapper + shipment card |
| **Shipping charge calculation** | Stage 6 zone/slab engine (not Shiprocket rates) | **REUSE** | Rules must exist | None this stage |
| **Return eligibility / request / reason / evidence** | `returnEligibilityService`; shopper return routes; R2 evidence | **REUSE** / **ADAPT** (UI) | Policy window still on internal Seller record | Storefront request form |
| **Return review / approve / reject** | After-sales seller engine; new cases are `caseFlow: after_sales` | **ADAPT** | Ops was seller-JWT; AAURIKAA Admin must operate the store | Admin wraps existing engine with internal Seller |
| **Reverse pickup / return tracking** | `reverseLogisticsService` + `createReturnOrder` | **REUSE** / **CONFIGURE** | Shiprocket return API + pickup | Admin retry pickup; customer pickup AWB |
| **Return receipt / inspection gate** | Confirm receipt → `awaiting_inspection` | **REUSE** | Stock restore was not wired | `restoreStockForReturnedOrder` on receipt |
| **Customer / Admin return visibility** | Shopper DTO; `GET /api/admin/returns` | **ADAPT** | No Admin returns pages | `/admin/returns` queue + detail |
| **Appeal** | Shopper `POST .../return-appeal`; Admin override | **REUSE** | Not surfaced on storefront this stage | None (API remains) |
| **Replacement request / evidence / review** | Same after-sales case; resolution `replacement` | **REUSE** | Was record-only | Admin/seller resolution still on same case |
| **Replacement order + inventory + shipment** | Not implemented; `manualFollowUpRequired` | **BUILD** | Stock must exist for replacement SKUs | `replacementFulfillmentService` → existing Order + WS2 + `maybeSyncShiprocket` |
| **Replacement tracking / customer status** | Follows replacement Order DTO | **ADAPT** | — | Link to replacement order on case |
| **Repair** | Record-only manual follow-up | **HOLD** | No automated repair logistics in SRS as a separate engine | Unchanged |
| **Refund eligibility / calculation / destination / processing / timelines** | Inherited wallet credit + commission reversal on resolution=`refund` | **HOLD** | Client Refund Policy not approved (SEC-006) | Admin after-sales **rejects** refund resolution. No new refund rules. |
| **Refund status / history / customer visibility** | DTO fields exist if a legacy case completed | **HOLD** / **REUSE** (read-only) | Do not display invented policy copy | If a completed refund timestamp exists, storefront shows that a refund record exists — no method/timeline |
| **Inventory from orders / cancel / return / replacement** | WS2 reserve/commit/release; return restore unwired; replacement missing | **ADAPT** / **BUILD** | — | Return restore + replacement decrement |
| **Seller as ownership picker** | Internal compatibility Seller | **REUSE** | Must not become selectable | Admin uses `getOrCreateInternalSeller` only |

---

## 3. Lifecycle (as implemented)

```text
Paid/COD order
  → maybeSyncShiprocket (if credentials + pickup exist)
  → Admin generate AWB (optional, same API)
  → poll tracking → shipped / delivered

Eligible cancel (no shipment, no AWB)
  → status cancelled
  → onOrderCancelled → inventory RELEASE (idempotent) + coupon release
  → no refund (HOLD)

Delivered + return window + policy allowed
  → shopper evidence + Need Help request
  → Admin accept (returnRequired=true) → reverse pickup (Shiprocket if configured)
  → Admin confirm receipt → inventory RETURNED (idempotent)
  → Admin resolution:
       replacement → new Order (₹0, processing) → WS2 commit → Shiprocket sync
       repair     → manual follow-up only
       rejected   → case closed
       refund     → HOLD (Admin path blocked)
```

Replacement orders are not a second commerce engine. They clone shippable lines from the source order, charge ₹0, force Shiprocket Prepaid (no COD collection), and reuse `onOrderCreated({ isCod: true })` only to reserve+commit stock without a second payment.

---

## 4. Tests executed / results

### Backend

```text
cd backend
npx jest tests/unit/replacementFulfillmentService.test.js tests/unit/adminAfterSalesOpsService.test.js tests/unit/sellerReturnService.test.js tests/unit/shopperOrderDetailService.test.js tests/unit/cancellationEligibilityService.test.js tests/unit/orderFulfillmentGuards.test.js tests/controllers/shopperOrderCancel.test.js tests/security/sec004-inventory-lifecycle.test.js tests/unit/returnEligibilityService.test.js --runInBand
```

**Result:** 9 suites, **81/81 passed**.

Covered: replacement create + idempotency + stock-fail closed; Admin refund HOLD; receipt restock hook; cancel eligibility + HTTP cancel; SEC-004 cancel restore + duplicate cancel; shipment DTO; return eligibility.

Also run: `tests/integration/shiprocketPickupFulfillment.test.js` — **2/3 passed**. The remaining case expects seller `PICKUP_NOT_CONFIGURED` when marking shipped; that **seller** controller no longer returns code `PICKUP_NOT_CONFIGURED` (pre-existing marketplace surface, not used by AAURIKAA Admin). Not changed this stage.

### Storefront

```text
cd frontend
npm test
```

**24/24 passed.**

### Admin

```text
cd admin
npm test
```

**8/8 passed.**

---

## 5. Refund HOLDs

Do **not** treat inherited ANBAZAR wallet credit as AAURIKAA policy.

| Topic | Status |
|---|---|
| Refund eligibility rules | **HOLD** — not invented |
| Refund destination (wallet vs original method vs PhonePe) | **HOLD** |
| Refund timelines | **HOLD** |
| Payment-method-specific refund processing | **HOLD** |
| Admin after-sales resolution = refund | **Blocked** with explicit hold message |
| Legacy `PATCH .../refund-review` and `.../refund-complete` | Left in codebase; **not** used by AAURIKAA Admin UI |
| Seller-path `tryAfterSalesRefundOnResolution` | Inherited; marketplace/seller HTTP remains disabled in single-store mode |

SEC-006 remains open until AAURIKAA Lifestyles Private Limited approves the Refund Policy.

---

## 6. Shiprocket / configuration dependencies

**Already implemented (REUSE):**

- `shipRocketService`: auth, create forward shipment, create return order, AWB, label, tracking
- `orderFulfillmentService.maybeSyncShiprocket` after paid/processing/COD
- Admin `POST /api/admin/shiprocket-fulfillment/:orderId/sync` and `.../generate-awb`
- Reverse pickup via `reverseLogisticsService`
- Tracking poll in `server.js`

**Configuration (not performed):**

| Variable / record | Role |
|---|---|
| `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` | API login |
| `SHIPROCKET_API_BASE_URL` | Default `https://apiv2.shiprocket.in/v1/external` |
| `SHIPROCKET_CHANNEL_ID` | Reverse order channel |
| Default pickup `shiprocketId` | Foundation placeholder `900000001` until a real Shiprocket pickup exists |
| Pickup address | Still `PENDING_CONFIGURATION` unless ops sets it |

Without credentials, sync/AWB/reverse pickup fail closed. Checkout shipping **charges** do not use Shiprocket rates (Stage 6).

---

## 7. Recommendation for the next stage

**Stop here.** Do not start Shop the Look, UGC, CMS authoring, Collection/Occasion CMS, or jewellery catalogue loading.

When operations are ready:

1. Put a real Shiprocket pickup and credentials in env (non-production first).
2. Run one COD order through Admin sync → AWB → tracking poll.
3. Approve the **Refund Policy**, then implement SEC-006 on the existing refund orchestration — do not invent destinations now.
4. Confirm internal Seller return-window / `returnAllowed` (CONFIGURE, do not invent jewellery-specific rules).

Catalogue load remains a later stage when the client file arrives.

---

## 8. Files changed (application)

### Backend

- `models/Order.js` — `fulfilmentKind`, `sourceOrder`, `sourceReturnRequest`
- `models/ReturnRequest.js` — `replacementOrder`
- `services/replacementFulfillmentService.js` — new, uses existing Order + WS2 + Shiprocket
- `services/sellerReturnService.js` — restock on receipt; replacement fulfilment
- `services/adminAfterSalesOpsService.js` — Admin operates after-sales via internal Seller; refund HOLD
- `services/adminReturnService.js` / `returnRequestService.js` — replacement order id on DTOs
- `controllers/admin/adminReturnController.js` + `routes/adminReturnRoutes.js` — after-sales actions
- `routes/adminOrderRoutes.js` — `GET /:id`
- `services/orderFulfillmentService.js` — replacement shipments are Prepaid
- `services/shopperOrderDetailService.js` — fulfilment kind
- `utils/afterSalesListingSummary.js` — replacement order id
- tests listed in §4

### Storefront / Admin

- Account order detail: tracking, cancel, return request, after-sales status
- Admin order detail: shipment / AWB / Shiprocket actions
- Admin `/admin/returns` queue and case actions (accept, pickup, receipt, replacement/repair/reject)

Git: no operations performed.
