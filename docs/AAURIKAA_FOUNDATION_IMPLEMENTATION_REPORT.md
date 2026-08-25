# AAURIKAA Foundation Implementation Report

**Workstream:** Single-business foundation (internal Seller compatibility, default pickup, marketplace isolation)  
**Date:** 2026-08-19  
**Git:** No Git operations were performed.

---

## 1. Summary

AAURIKAA now has a narrow internal-Seller compatibility path so Admin catalogue operations do not require choosing a Seller, plus one default pickup location the existing Shiprocket resolver can use.

Public Seller registration and the public Seller storefront are disabled by default. Seller models, routes, and finance code were not deleted. Commission/payout/ledger were not activated and were not wired into the shopper/admin order lifecycle.

After-sales still runs through existing seller-gated services. No after-sales Admin adapter was implemented.

**WS1A follow-up (internal Seller enforcement):** Admin catalogue writes no longer honour a client `sellerId`. Create, update, autosave, and bulk import always resolve to the single internal AAURIKAA Seller. Seller-portal behaviour is unchanged.

---

## 2. AAURIKAA Identity

### Settings configured

| Field | Value | Source |
|---|---|---|
| `SiteSettings.title` | `AAURIKAA` | Project/brand name |
| `SiteSettings.footer.companyName` | `AAURIKAA Lifestyles Private Limited` | SRS (Refund Policy legal entity) |
| Invoice PDF fallback `companyName` | `AAURIKAA Lifestyles Private Limited` | Same legal entity |
| Currency | Unchanged (`Rs.` / en-IN already in invoice code) | Existing engine; not a new setting |
| Payment methods | Unchanged (COD + PhonePe already in checkout/payment code) | SRS; credentials remain env-only |

Applied only when title/companyName are empty or still AnBazar/multi-vendor leftovers. Existing custom values are not overwritten.

### Business identity sources

- `backend/config/aaurikaaFoundation.js` (known constants)
- `ensureAaurikaaSiteIdentity()` on Mongo boot (`server.js`)
- Invoice fallback in `invoicePdfService.js` (used only when a seller/legal block is not supplied)

### Placeholder values

| Item | Status |
|---|---|
| GSTIN | **Not set** (unknown; not invented) |
| Business address | **Not set** (unknown; not invented) |
| Business phone / email | **Not set** (unknown; invented invoice fallbacks removed) |
| Payment credentials | **Not set** (env placeholders only in `.env.example`) |
| Shiprocket credentials | **Not set**; no live Shiprocket calls |
| Pickup physical address | Placeholder `PENDING_CONFIGURATION` / pincode `000000` |
| Internal Seller email | `ops-internal@aaurikaa.invalid` (non-routable) |
| Return window | **Not set** (Refund/return policy remains HOLD) |
| Refund method / destination / timeline | **Not configured** (HOLD) |

---

## 3. Internal Seller Compatibility

### Seller model used

Existing `Seller` collection / `backend/models/Seller.js`. No schema redesign. `Product.seller` remains required by the commerce engine and is still an ObjectId ref.

### Minimum required fields created

| Field | Value |
|---|---|
| `username` | `aaurikaa-internal` (overridable via `AAURIKAA_INTERNAL_SELLER_USERNAME`) |
| `email` | `ops-internal@aaurikaa.invalid` |
| `shopName` / `shopUrl` | `AAURIKAA` / `aaurikaa` |
| `isApproved` | `true` |
| `commission` | `0` |
| `password` | **omitted** — not a login actor; credentials are not exposed to Admin |
| `address.state` | **unset** (GST origin unknown) |
| `returnAllowed` / window / conditions | **unset** (policy HOLD) |

### How it is resolved

`resolveSellerIdForAaurikaaAdminWrite()` always returns the internal AAURIKAA Seller in single-store mode.

Client-supplied `sellerId` / `sellerShop` / `shopName` on Admin catalogue writes is **ignored**, not retained. The product is assigned `Product.seller` (and `sellerShop`) = internal Seller. Admin `_id` is never written into `Product.seller`. `ownerUserId` stays the Admin user on update (no marketplace ownership transfer).

### Where it is automatically applied

| Path | Behaviour |
|---|---|
| Admin product create (`addProduct`) | Always internal Seller. Request `sellerId` is ignored. |
| Admin product update | Always internal Seller. Request cannot reassign to another Seller. |
| Admin autosave | Always internal Seller. Request cannot reassign to another Seller. |
| Admin bulk import | Import `sellerId` is always the internal Seller, including when the request body contains another id. |

Seller-portal product writes were not changed (`Product.seller` remains the logged-in seller).

---

## 4. Pickup / Fulfilment

### Default location mechanism

Existing `SellerPickupLocation` + `pickupLocationService`.

`ensureAaurikaaDefaultPickup()`:

- Reuses an active `isDefault: true` location if one exists.
- Otherwise creates **AAURIKAA Default Warehouse**.
- `shiprocketId` from `AAURIKAA_DEFAULT_PICKUP_SHIPROCKET_ID` or placeholder `900000001`.
- Existing `getDefaultPickup()` / `resolvePickupForSeller(null)` resolve it without Shiprocket API changes.

The internal Seller is pointed at this location when it has no `pickupLocation`.

### Configuration status

| Item | Status |
|---|---|
| Identifiable default record | Implemented |
| Resolver compatibility | Implemented (no shipping engine rewrite) |
| Real warehouse address | Pending (placeholder) |
| Real Shiprocket pickup id / sync | Pending (no live sync in this workstream) |

### What remains pending

Production pickup address, phone, email, and a real Shiprocket `pickup_location` name/id after an authorised sync. Do not send live Shiprocket requests until that workstream.

---

## 5. Marketplace Isolation

| Surface | Existing State | AAURIKAA State | Action |
|---|---|---|---|
| Seller registration | Public `POST /api/seller/register` (+ verify/resend OTP) | Disabled (403) unless `AAURIKAA_ENABLE_MARKETPLACE_SURFACES=true` | Isolated at route; implementation kept |
| Seller storefront | Public `GET /api/sellers/storefront/:shopUrl` | Disabled (404) unless flag on | Isolated at route; implementation kept |
| Seller payout | Seller-JWT `/api/seller/payouts*`; admin `/api/admin/payouts` behind `finance` | Unchanged auth; not used by AAURIKAA Admin ops | Must remain but inaccessible to customers / ordinary Admin |
| Seller ledger | Seller-JWT `/api/seller/payouts/ledger` | Same | Must remain but inaccessible |
| Seller commission | Written on seller `delivered` status API; admin `/api/commissions` behind `finance` | Not invoked by Admin/shopper order paths | Must remain internally; **later blocker** if seller delivered-API is used |
| Seller KYC | Public register + admin seller CRUD | Public onboarding disabled; admin CRUD still `sellers:*` | Must remain internally; public KYC on-ramp disabled |
| Seller subscription | Not implemented | Still absent | No change |

Other seller HTTP (`/api/seller/login`, products, dashboard, inventory, returns, `/api/orders/seller`) remains mounted and seller-JWT gated. It is **required internally** until the after-sales Admin adapter exists. It is not a customer workflow.

Static CMS keys (`become-seller`, `seller-faq`, …) were **not** unpublished in this workstream (later CMS adaptation).

---

## 6. Security Validation

Authorization was not weakened to make tests pass.

| Test | Expected | Result |
|---|---|---|
| 1. Unauthenticated Seller registration | REJECTED | **PASS** (403) |
| 2. Normal customer → seller-only endpoints | REJECTED | **PASS** (401/403 on products, payouts, seller orders) |
| 3. Ordinary Admin → seller finance without `finance` permission | REJECTED | **PASS** (403 on `/api/commissions` and `/api/admin/payouts`) |
| 4. AAURIKAA product create without selected Seller | Internal Seller resolved | **PASS** |
| 5. Legitimate Admin authentication | SUCCESS | **PASS** |

Additional focused tests: internal Seller/pickup/SiteSettings bootstrap; pickup resolution; public storefront 404; registration OTP verify disabled.

This workstream did **not** introduce:

- privilege escalation
- unauthenticated Seller access
- public Seller registration (it is now disabled)
- seller/customer data exposure beyond fields already on public product JSON (documented below)
- admin authorization bypass
- credential leakage
- secrets in source (`.env.example` names only)
- live Shiprocket/PhonePe calls

### Related regression (this workstream)

`verifyAdmin`, Point L RBAC, admin autosave SKU sync, autosave non-draft guard, admin primary-category authority, pickup resolver, invoice PDF unit, public storefront (flag-on compatibility): **PASS**.

### Pre-existing failures (not patched)

Run together with other suites, `tests/integration/registration-otp.test.js` failed on a pre-existing mongoose double-connect (`setup.js` vs its own `MongoMemoryServer`). That file mounts the **controller**, not the now-disabled public route.

`tests/controllers/sellerControllerErrorHandling.test.js` `getSellerProfile` cases returned 500 vs 404/200. `sellerController.js` was not modified. Documented only.

---

## 7. Files Changed

**Added**

- `backend/config/aaurikaaFoundation.js`
- `backend/middleware/aaurikaaMarketplaceGuard.js`
- `backend/services/aaurikaaFoundationService.js`
- `backend/tests/services/aaurikaaFoundationService.test.js`
- `backend/tests/integration/aaurikaa-foundation.test.js`
- `backend/tests/controllers/aaurikaaAdminProductSellerResolution.test.js`
- `docs/AAURIKAA_FOUNDATION_IMPLEMENTATION_REPORT.md` (this file)

**Modified**

- `backend/.env.example`
- `backend/server.js` (foundation bootstrap after Mongo connect; no live shipping calls)
- `backend/routes/sellerAuthRoutes.js`
- `backend/routes/publicSellerRoutes.js`
- `backend/controllers/adminProductController.js`
- `backend/controllers/bulkProductImportController.js`
- `backend/services/invoicePdfService.js` (legal-entity fallback only)
- `backend/tests/routes/publicSellerStorefront.test.js` (opt-in flag so implementation tests still run)

---

## 8. Files NOT Changed

Deliberately untouched major commerce modules:

- Checkout / order create (`orderProcessingService`, `orderRoutes` write path)
- Payment / PhonePe
- GST engine (`gstEngineService`)
- Zone shipping engine (`shippingEngineService`)
- Shiprocket client (`shipRocketService`) and fulfilment grouping logic
- Cart, coupon calculation, inventory decrement (still TD-016)
- After-sales services (`sellerReturnService`, shopper return routes)
- Commission calculator, payout controllers, ledger models
- Seller models and seller controller implementation
- Product schema
- Frontend/admin Next apps
- CMS static page registry (seller pages not unpublished here)

---

## 9. Known Remaining Issues

Only items for later workstreams. Not fixed here.

1. **GST origin state** is still empty on the internal Seller. Checkout will treat missing origin as intra-state until a real place-of-supply State is assigned.
2. **Return policy** is unset on the internal Seller. Eligibility will treat returns as not allowed until policy is confirmed (HOLD).
3. **After-sales operator** is still seller-JWT (`/api/seller/returns/*`). Admin override exists; live accept/receipt/resolution is not an Admin adapter. **Do this in the after-sales workstream.**
4. **Commission on seller delivered-API:** `PUT /api/orders/seller/:orderId/status` with `delivered` still writes Commission + SellerLedger. AAURIKAA Admin/shopper/Shiprocket-poll paths do not. **Blocker for Workstream 1B/2** if that seller status API is used for operations. Order/payment lifecycle was not changed here.
5. **Public product JSON** still populates seller shop/ratings (`PUBLIC_SELLER_POPULATE_FIELDS`). Storefront TypeScript types have no seller fields. Not a direct secret leak; omit in the integration workstream.
6. **Search suggestions** still include `sellers[]`. Same as (5).
7. **Shopper order detail** may still include `sellerSummary`. Same as (5).
8. **Invoice route fallback** in `orderRoutes.js` still says `AnBazar` / `support@multivendor.com` when SiteSettings footer is empty. Boot identity now fills company name; leftover copy is branding cleanup.
9. **Become-seller static pages** remain in the CMS registry. Unpublish in a CMS workstream.
10. **Seller login** remains reachable. No password is stored on the internal Seller. Do not create a fake Seller login for Admin.
11. **Pickup placeholder** must be replaced before live Shiprocket create.
12. **SEC-001–006** and other security-audit financial defects are unchanged (out of scope).

---

## WS1A follow-up — Internal Seller enforcement

Admin catalogue write paths now **ignore** client `sellerId` and always assign the internal AAURIKAA Seller. Requests are not rejected (least disruption to Admin forms that may still send a leftover field). Seller-portal product ownership is unchanged.

---

## 10. Git

No Git operations were performed.
