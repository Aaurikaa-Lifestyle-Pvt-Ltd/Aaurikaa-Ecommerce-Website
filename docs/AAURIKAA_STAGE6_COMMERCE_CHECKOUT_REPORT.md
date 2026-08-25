# AAURIKAA Stage 6 — Commerce & Checkout

**Stage:** Commerce & Checkout  
**Date:** 2026-08-19  
**Mode:** Inspect existing ANBAZAR commerce first. Reuse engines. Implement only demonstrated gaps. No refunds. No Shiprocket production work. No catalogue seed. No Git operations.

---

## 1. Verdict

The inherited commerce engine already owns the payable journey:

**Cart (variant-aware) → Checkout → zone shipping → GST (CGST/SGST/IGST) → coupon (payment-gated) → COD / PhonePe → Order → Invoice PDF.**

WS2 inventory and financial integrity remain on that same write path. The storefront now calls those APIs instead of a parallel demo checkout.

**PhonePe live capture** still depends on `PHONEPE_CLIENT_ID` / `PHONEPE_CLIENT_SECRET` / `PHONEPE_CLIENT_VERSION`. The storefront is wired; without credentials initiate fails closed and does not mark an order paid.

Refunds, Shiprocket fulfilment configuration, Returns, Replacements, Shop the Look, UGC, CMS, and catalogue loading were not started.

---

## 2. Requirement matrix

| SRS requirement | Existing capability / evidence | Classification | Gap / dependency | Changes implemented |
|---|---|---|---|---|
| **Cart, mini cart, variant qty** | Shopper `GET/POST/PUT/DELETE /api/shopper/cart*`; `cartAddService`; storefront mapper uses server `variantPriceSnapshot` for display only. | **REUSE** | Guest bag is local until login (pre-existing). | None |
| **Server-authoritative price / total** | Order create uses `resolveAuthoritativeVariantPrice` from `Product.variantPricing` (SEC-001). Client totals are omitted from `POST /api/orders`. | **REUSE** / **ADAPT** (quote) | Quote `POST /api/pricing/calculate` previously trusted client `variantPriceSnapshot`. | Quote path now uses the same Product map. Snapshot is ignored. |
| **Coupon validation & consumption** | Model + `validateCoupon` on order create; SEC-005 consumption on payment success / COD; admin CRUD. | **REUSE** / **ADAPT** (UI) | Storefront had no coupon field. Quote validate-coupon still skips shopper usage limits; order create enforces them. | Coupon field on bag + checkout; `coupon` sent on order create. |
| **Shipping calculation** | `shippingEngineService` zone + weight-slab + free-shipping / free-coupon. Not Shiprocket rates. | **REUSE** / **CONFIGURE** | Needs zone, weight class, and flat rules in the environment. Storefront no longer uses demo ₹79/₹149 as payable shipping. | Checkout quotes `POST /api/pricing/calculate` after address is complete. |
| **GST CGST/SGST/IGST** | `gstEngineService` on persist; Order `tax` snapshot; invoice GST table. Origin = `product.seller.address.state`; missing origin defaults intra-state. | **REUSE** / **CONFIGURE** | Internal Seller GST origin / GSTIN not invented (WS1A placeholders). Wrong origin ⇒ wrong CGST vs IGST until store state is configured. | Quote + shopper order DTO expose CGST/SGST/UGST/IGST from the engine snapshot. |
| **Checkout** | `POST /api/orders` (`verifyShopper`); WS5 COD UI. | **ADAPT** | Guest still becomes a Shopper JWT first. | Coupon, GST/shipping quote, COD + PhonePe method selection. |
| **COD** | Create with `paymentMethod: cod`; inventory commit on create; payment stays pending. | **REUSE** | Storefront cannot set `paymentStatus`. | Unchanged backend; still the default live path. |
| **PhonePe** | `POST /api/payment/initiate` + `verify` + cron; SEC-002 paid only via payment APIs. | **ADAPT** / **CONFIGURE** | Production/UAT credentials and `PHONEPE_REDIRECT_URL` (default `/payment/success`). | Storefront create unpaid PhonePe order → initiate → redirect → verify. 503 if unconfigured. |
| **Order creation** | Unique `INV-YYYYMMDD-NNNN`; WS2 `onOrderCreated` reserve/commit. | **REUSE** | Variant combination now derived from `variantKey` when options are missing. | Parse key → combination on order + quote paths. |
| **Invoice generation / access** | `invoicePdfService` on `GET /api/orders/:id/invoice` (shopper). Sequential invoice number. | **ADAPT** / **CONFIGURE** | Admin had no download. Legal block used AnBazar / `support@multivendor.com` fallbacks. GSTIN still from SiteSettings footer only. | Shared download helper; admin `GET /api/admin/orders/:id/invoice`; storefront + admin download buttons; default legal name AAURIKAA, GSTIN not invented. |
| **Client cannot control price, total, payment, seller** | SEC-001/002; WS1A seller pin; payload builders drop money/seller keys. | **REUSE** | Quote API remains unauthenticated (TD-002) but no longer accepts client variant prices as authority. | Quote + order payload tests assert omitted keys. |
| **WS2 inventory / coupon integrity** | `orderCommerceIntegrityService`: reserve, commit, fail-release, cancel restore, idempotency, last-unit. | **REUSE** | Not reopened except quote price authority. | Integrity services not rewritten. |
| **Refunds** | Policy not approved. | **HOLD** | SEC-006. | None |
| **Shiprocket, returns, replacements, Shop the Look, UGC, CMS, catalogue load** | Out of this stage. | **HOLD** | Shipping *charge* engine is reused; carrier sync remains existing code, unconfigured. | None |

---

## 3. Transaction journey (as implemented)

```
Authenticated bag or Buy Now
  → optional coupon (session)
  → checkout identity + address
  → POST /api/pricing/calculate  (quote: subtotal, coupon, shipping, GST)
  → POST /api/orders             (authoritative total; coupon; COD or phonepe)
       onOrderCreated            (COD commit / prepaid reserve)
  → COD: confirmation + invoice
  → PhonePe: POST /api/payment/initiate → redirect
       return /payment/success → POST /api/payment/verify
       COMPLETED → onPaymentSucceeded (commit + coupon consume)
       FAILED → onPaymentFailed (release)
  → GET /api/orders/:id/invoice (shopper)
  → GET /api/admin/orders/:id/invoice (admin, orders:view)
```

The client never sends line price, order total, payment status, or seller ownership.

---

## 4. Tests executed / results

### Backend

```text
cd backend
npx jest tests/utils/pricingEngine.test.js tests/utils/variantPriceAuthority.test.js tests/utils/invoiceDownloadService.test.js tests/unit/shopperOrderDetailService.test.js tests/security/admin-invoice-auth.test.js tests/security/sec001-variant-price-authority.test.js tests/security/sec002-payment-state-protection.test.js tests/security/sec004-inventory-lifecycle.test.js tests/security/sec005-coupon-consumption.test.js tests/controllers/paymentController.test.js --runInBand
```

**Result:** 10 suites, **56/56 passed**.

Covered: quote-path price authority, invoice legal entity, admin invoice auth, shopper GST DTO, SEC-001/002/004/005, PhonePe controller (including 503 when unconfigured).

### Storefront

```text
cd frontend
npm test
npm run build
```

**Tests:** **22/22 passed.**  
**Build:** Next.js 16.3 production build **succeeded** (includes `/payment/success`).

```text
cd admin
npm test
npm run build
```

**Tests:** **7/7 passed.**  
**Build:** Next.js 16.3 production build **succeeded**.

---

## 5. Remaining HOLDs / dependencies

1. **PhonePe credentials** — `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`, `PHONEPE_ENV`, redirect URL. Without them, prepaid initiate returns “PhonePe not configured”.
2. **Shipping rules** — zone / weight class / flat rate / free-shipping documents must exist or quotes fail closed.
3. **GST origin & GSTIN** — configure internal Seller state and SiteSettings footer GSTIN; do not invent values.
4. **SEC-006 refunds** — HOLD until client refund policy.
5. **Shiprocket production** — HOLD (this stage uses the in-platform shipping *calculator* only).
6. **Catalogue** — storefront still defaults to mock until `NEXT_PUBLIC_CATALOGUE_SOURCE=api` and real products exist.
7. **Guest identity** — still Shopper JWT after existing email OTP / password login (WS5). Mobile-only OTP not a backend contract.

---

## 6. Recommendation for the next stage

**Stop here.** Do not start Returns, Replacements, Shiprocket go-live, Shop the Look, UGC, CMS, or jewellery catalogue loading.

When operations are ready: configure shipping slabs, GST origin/GSTIN, and PhonePe UAT/production, then run a live COD order and (if credentials exist) a PhonePe sandbox payment against a non-production catalogue. Catalogue load remains a later stage when the client file arrives.

---

## 7. Files changed (application)

### Backend

- `utils/variantUtils.js` — shared authoritative variant price + key parse
- `utils/pricingEngine.js` — quote subtotal ignores client snapshots
- `services/orderProcessingService.js` — use shared price helper; fill combination from key
- `routes/orderRoutes.js` — same combination fill; invoice via shared helper
- `routes/adminOrderRoutes.js` — `GET /:id/invoice`
- `services/invoiceDownloadService.js` — legal entity + PDF stream
- `services/shopperOrderDetailService.js` — GST breakdown on pricing DTO
- tests listed in §4

### Storefront / Admin

- Checkout coupon, quote, COD/PhonePe, invoice download, `/payment/success`
- Admin order invoice download
- Payload/quote tests asserting no client money or seller keys

Git: no operations performed.
