# AAURIKAA Seller Dependency Trace

**Document type:** Architectural spike (read-only).  
**Date:** 2026-08-19  
**Related:** `docs/AAURIKAA_BACKEND_CAPABILITY_MATRIX.md`, `docs/SRS_Aaurikaa_Ecommerce_Website.md`  
**Implementation source:** `backend/` (ANBAZAR-derived Express + MongoDB)

No application code, schemas, routes, environment files, or Git state were modified.

---

## 1. Executive Conclusion

**If AAURIKAA is one business, with no marketplace, no seller portal, no commissions and no payouts, Seller must remain as an internal compatibility record.** It must not remain as a customer-facing or admin-facing marketplace concept.

Seller is **not** the tax engine, **not** the shipping calculator, and **not** required by Shiprocket’s API as a vendor identity. Seller **is** the current storage and join key for four commerce-correctness inputs:

1. **GST place-of-supply origin** — `product.seller.address.state`
2. **Return policy defaults** — platform inherit is **retired**; policy lives on Seller
3. **Product commercial ownership** — `Product.seller` (used by reviews, after-sales operator auth, fulfilment grouping)
4. **Pickup resolution key** — Seller → `SellerPickupLocation`, with a **platform default pickup fallback**

A fixed AAURIKAA Store/Business configuration *could* supply the same facts. The GST engine itself already accepts `originState` as a plain input. Pickup already falls back to `isDefault`. Invoice GSTIN already comes from **SiteSettings**, not `Seller.gst`.

Removing Seller from the data model (Option B) or introducing a Store abstraction (Option C) in this phase would touch the checkout–GST–fulfilment–after-sales spine. That is unnecessary for Day 1 and threatens the 90% reuse target.

**Recommended option: A — Internal Seller compatibility layer.**  
Seed one approved Seller as the store identity. Point every product at it. Hide marketplace surfaces. Leave commission/payout dormant. Do not delete Seller code.

---

## 2. Core Question — Direct Answer

> What Seller dependency must remain for the existing commerce engine to function correctly with exactly one store?

**Minimum remaining dependency:** one Mongo `Seller` document whose `_id` is stored on `Product.seller`, plus the fields listed in §8.

Without that record:

| Capability | What happens |
|---|---|
| Checkout / cart / payment / zone shipping | Still runs |
| GST CGST vs IGST | Falls back to **intra-state** whenever `originState` is missing (`gstEngineService.js` L73–80). Interstate jewellery orders would be taxed incorrectly. |
| Returns eligibility | `returnPolicyResolver` has **no platform fallback**. Unconfigured seller ⇒ `returnAllowed: false` ⇒ after-sales closed. |
| Reviews | `Review.seller` is **schema required**. `createCustomerReview` writes `seller: product.seller`. Null seller ⇒ validation failure. |
| Shiprocket create | Groups by seller; missing seller uses key `'platform'` and **default pickup**. Shipment can still be created **if** a default `SellerPickupLocation` exists. |
| After-sales operations | Live accept / receipt / resolution APIs are **seller-JWT gated**. Admin override is not a full operator replacement. |

**Seller can remain purely internal.** The AAURIKAA storefront types (`frontend/src/types/commerce.ts`) have **no seller fields**. The current Next admin mock has **no seller picker**. Backend public APIs *do* populate seller onto products and order DTOs — those fields must be omitted or ignored in the AAURIKAA UI, not used as marketplace identity.

---

## 3. Seller Dependency Map

### 3.1 Schema graph (actual)

```text
Seller
 ├── Product.seller            (optional on schema; commercial owner in code)
 ├── Product.sellerShop        (duplicate Seller ref; legacy)
 ├── Product.ownerUserId       (copied from seller on save if unset)
 ├── Review.seller             (required: true)
 ├── Order.shiprocketShipments[].seller  (per-shipment; not order-level)
 ├── Order.sellerNotes         (marketplace ops notes)
 ├── SellerPickupLocation.seller (optional assign)
 ├── Seller.pickupLocation     (ref to SellerPickupLocation)
 ├── ReturnRequest             (no seller FK; ownership via Product.seller on order lines)
 ├── Commission.seller         (required; marketplace)
 ├── Payout.seller             (required; marketplace)
 ├── SellerLedger.seller       (marketplace)
 ├── SellerApprovalLog         (marketplace)
 ├── SellerShop.seller         (leftover model)
 ├── Address.userType = Seller (marketplace addresses)
 ├── Media.ownerUserType seller|admin
 ├── OTP.userType seller
 └── SkuRule segment seller_shop_name (optional SKU composition)
```

GST, shipping charge, and invoice legal entity are **not** children of Seller in the schema:

- GST **rate** → Product / Category / Subcategory / ChildCategory `taxRate`
- GST **origin** → populated at runtime from Seller.address.state
- GST **GSTIN on invoice** → `SiteSettings.footer.gstin`
- Shipping **charge** → WeightClass + zone FlatShippingRule + FreeShippingRule
- Pickup **physical** → `SellerPickupLocation` (Shiprocket name/address), optionally pointed at by Seller

### 3.2 Relationship classification

| Relationship | Classification |
|---|---|
| `Product.seller` as join key | 🟡 Replaceable by Store/Business later; **must remain for now** |
| `Seller.address.state` (GST origin) | 🟢 Must remain *as data* (or be copied to Store). Currently the only live origin. |
| `Seller` return policy fields | 🟢 Must remain *as data*. Platform inherit retired. |
| `Seller.pickupLocation` | 🟡 Replaceable by default pickup alone |
| `SellerPickupLocation` (the warehouse record) | 🟢 Must remain (store requirement, misnamed) |
| `Review.seller` | 🟡 Required by current schema; marketplace rating aggregation |
| Public seller populate / storefront URL | ⚪ Marketplace-only for AAURIKAA UX |
| Commission / Payout / Ledger | ⚪ Marketplace-only — leave dormant |
| Seller auth / KYC / bank / shopUrl | ⚪ Marketplace-only (auth may be kept internally for after-sales until admin is adapted) |
| `Order.shiprocketShipments[].seller` | 🟡 Grouping key; with one seller it is a no-op split |

---

## 4. Product Dependency Trace

`Product.seller` schema (`backend/models/Product.js` L46):

```js
seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller" }
```

**Not `required`.** `sellerShop` is also optional. `ownerUserId` is optional; pre-save copies `seller` → `ownerUserId` if unset (L325–326).

| Question | Answer | Evidence |
|---|---|---|
| Required by Mongo schema? | **No** | `Product.js` L46 — no `required: true` |
| Required on admin create? | **No** at controller. `seller: sellerId \|\| null` | `adminProductController.js` L542–545 |
| Required on update? | **No.** Seller is set only if `sellerId` present | `adminProductController.js` L1538–1539 |
| Required to publish? | **No.** Publish guard does not check seller | `utils/productPublishGuard.js` `assertPublishable` |
| Seller-portal publish? | **Yes** — seller return policy must be configured | `sellerProductController.js` uses `assertSellerReturnPolicyReady` |
| Required for listing queries? | **No** for public/admin catalogue. Admin listing excludes some seller autosave drafts. Seller portal filters `{ seller: sellerId }` | `productListingService.js` L33–45, L74–79 |
| Authorization? | **Yes** for seller APIs only: `buildSellerOwnershipFilter` | `productListingService.js` L74–79 |
| Pricing (subtotal/coupon)? | **No** | Cart/pricing use product/variant prices |
| GST origin? | **Yes at checkout/quote** — populate seller.address.state | `orderProcessingService.js` L83–87, L245; `pricingEngine.js` L184, L280 |
| Inventory? | **Seller inventory module** scopes by `Product.seller`. Stock fields themselves do not | `sellerInventoryController.js` |
| Shipping charge? | **No** | `shippingEngineService.js` — no seller references |
| Search? | Optional entity match + populate. Not required to return products | `searchEntityResolver.js`; `productSearchQueryBuilder.js` L65–67 |
| Storefront responses? | Populated (`shopName`, `shopUrl`, ratings, return policy) | `publicProductRoutes.js`; `utils/sellerStorefront.js` |
| Admin responses? | Populated `firstName lastName shopName` | `productListingService.js` ADMIN_POPULATE |
| Jobs? | Payment cron: **no**. Fulfilment poll: uses product.seller for grouping | `jobs/paymentVerificationJob.js`; `orderFulfillmentService.js` |
| Variants? | **No** | Variant maps live on Product |
| Imports? | Tagged with `req.user._id` (seller **or** admin user id) | `bulkProductImportController.js` L84, L113 — **risk:** admin import can write Admin `_id` into seller-shaped fields |

### Important product dependencies (can it run without Seller?)

| File | Function | Dependency | Why it exists | Without Seller? |
|---|---|---|---|---|
| `models/Product.js` | schema | `seller` ObjectId | Marketplace owner | Document saves; later GST/returns/reviews degrade |
| `adminProductController.js` | `addProduct` | Optional `body.sellerId` | Admin assigns commercial owner; refuses using admin `_id` as seller | Product created with `seller: null` |
| `productListingService.js` | `buildSellerOwnershipFilter` | `{ seller: sellerId }` | Seller portal ACL | Admin catalogue does not need it |
| `orderProcessingService.js` | `processOrderWithBulkDiscounts` | populate `seller.address.state` | GST origin | GST defaults intra-state |
| `pricingEngine.js` | `calculatePricing` | same populate | Quote GST | same |
| `utils/skuGenerator.js` | `seller_shop_name` segment | shopName | Optional SKU rule | SKU still generates if that segment unused |
| `utils/returnPolicyResolver.js` | `resolveProductReturnPolicy` | seller defaults | Inherit policy | Unconfigured ⇒ returns not allowed |
| `controllers/reviewController.js` | `createCustomerReview` | `seller: product.seller` | Review.seller required + rating rollup | **Save can fail** |
| `utils/sellerStorefront.js` | `attachPublicSellerFieldsToProduct` | shopUrl / ratings | Marketplace PDP “sold by” | AAURIKAA UI can ignore |

---

## 5. Order Lifecycle Dependency Trace

Cart → Checkout → Order → Payment → Fulfilment → Shipment → Delivery → Cancel → Return → Replacement

| Stage | Seller used? | How | Classification |
|---|---|---|---|
| **Cart** | No | `Shopper.cart` stores product + variant only (`cartAddService.js`) | — |
| **Checkout quote** | Origin only | `pricingEngine` populates `product.seller.address.state` → `originState` | 🟡 |
| **Order create** | Origin only | `orderProcessingService` same populate; **Order has no `seller` field** | 🟡 |
| **Coupon / totals** | No | Coupon + bulk discount are buyer/product | 🟢 commerce without Seller |
| **Payment** | No | `paymentController` / `phonePeService` — order id + amount | 🟢 |
| **Fulfilment sync** | Grouping + pickup | `groupItemsBySeller`; missing seller → `'platform'` + `getDefaultPickup()` | 🟡 |
| **Shipment persist** | Stored | `Order.shiprocketShipments[].seller` + `sellerName` | 🟡 |
| **AWB / label / tracking poll** | Shipment ids, not seller identity | `orderFulfillmentService.pollTrackingUpdates`; AWB on shipment records | 🟢 (pickup already chosen) |
| **Customer tracking** | Display only | `shopperOrderDetailService` exposes `sellerId/Name/Slug` + `sellerSummary[]` | ⚪ for AAURIKAA UX |
| **Delivery (seller status API)** | Writes commission | `sellerOrderController.updateOrderStatus` on `delivered` | ⚪ |
| **Delivery (Shiprocket poll)** | Status only | Does **not** write commission (TD-012) | 🟢 fulfilment; ⚪ finance gap |
| **Cancellation** | No | `cancelShopperOrder` — status/reason only | 🟢 |
| **Return eligibility** | Policy via product.seller | `shopperReturnController` populate seller policy fields; `resolveOrderReturnPolicy` | 🟢 for after-sales correctness |
| **Return request persist** | No seller FK | `ReturnRequest` refs Order + Shopper | 🟡 operator path still seller-gated |
| **Return reverse pickup** | Destination | `reverseLogisticsService.resolveSellerDestination(sellerId)` → pickup then seller contact | 🟡 |
| **Return approval/inspection/resolution** | Authorization | `assertSellerOwnsReturn` via `Product.seller` | 🟡 (actor); policy is 🟢 |
| **Refund wallet** | No seller for shopper credit | `shopperWalletService`; seller finance reversal is ⚪ | 🟢 wallet; ⚪ commission clawback |
| **Replacement** | Record-only | No replacement order; seller resolution enum only | ⚪ until replacement is built |

### Order-level vs line-level

There is **no** `Order.seller`. Multi-vendor is:

- `items.product.seller` after populate
- `shiprocketShipments[]` per seller
- Seller APIs filter lines by `Product.find({ seller })`

With one Seller id on every product, grouping produces **one** shipment. The code path stays multi-seller-capable without behaving as a marketplace.

---

## 6. GST Dependency

### How origin is selected

1. Checkout loads each product with:

   `Product.findById(...).populate({ path: 'seller', select: 'address.state', populate: { path: 'address.state', select: 'name' } })`

   (`orderProcessingService.js` L83–87)

2. Each processed line gets `originState: product.seller?.address?.state` (L245).
3. `gstEngineService.calculateGST` (`L69–80`):
   - If `item.originState` present → compare to destination → IGST vs CGST/SGST (UGST for listed UTs).
   - If **absent** → **intra-state by design** (“Admin product” / missing origin).

### Where GSTIN is obtained

**Invoice GSTIN is not read from Seller.** Live invoice path (`orderRoutes.js` L255–270):

```js
const footer = settingsDoc?.footer || {};
const seller = {
  companyName: footer.companyName || "AnBazar",
  ...
  gstin: footer.gstin || "",
};
await writeOrderInvoicePdf(order, doc, { seller });
```

`Seller.gst` exists as a KYC string on the Seller model (`Seller.js` L65). It is **not** on the live invoice path.

### Where rates come from

`gstEngineService.resolveGstRate`: product `taxRate` > 0, else child → sub → category. **No Seller.** Missing rate throws.

### Does GST fundamentally require Seller?

**No.** The engine requires:

- `originState` (ObjectId or populated State)
- destination address state
- tax rates on product/taxonomy
- inclusive/exclusive flags

Seller is **only the current storage location** for origin state.

### Could a Store/Business config replace Seller without changing the tax engine?

**Yes.** Pass a fixed `originState` on every line (from SiteSettings or a Store document). `calculateGST({ items, shippingCharge, shippingAddress })` does not import the Seller model.

That is an **input-wiring** change (`orderProcessingService`, `pricingEngine`), not a tax-engine rewrite. Until that wiring exists, a seeded Seller.address.state is the safe compatibility path.

**Risk if Seller is omitted without a Store origin:** all orders treated as intra-state. Wrong CGST/SGST vs IGST on the invoice and in `Order.taxSummary`.

---

## 7. Shiprocket / Shipping Dependency

### Charge calculation vs shipment creation

| Concern | Uses Seller? | Actual requirement |
|---|---|---|
| Checkout shipping **charge** | **No** | `shippingEngineService`: product `weightClass`, destination zone, flat/free rules |
| Shiprocket **rate cards** | Unused on live checkout | `shipRocketService.fetchRates` — diagnostic only |
| Shipment **create** | Seller used as **group key + pickup lookup** | Shiprocket needs pickup **name** and consignment payload, not a marketplace seller id |
| Tracking | **No** | AWB on `shiprocketShipments[]` |

### Pickup resolution (`pickupLocationService.js`)

```text
resolvePickupForSeller(sellerId)
  if !sellerId → getDefaultPickup()
  else Seller.findById → seller.pickupLocation if active
  else getDefaultPickup()   // isDefault: true
```

`SellerPickupLocation.seller` is **optional**. A location can be platform default with no seller assign.

### Can one AAURIKAA pickup replace seller resolution?

**Yes.** `groupItemsBySeller` already maps missing seller to `'platform'` and calls `resolvePickupForSeller(null)` → default pickup (`orderFulfillmentService.js` L77–119).

With **one** product.seller and **one** default pickup, behaviour is: one Shiprocket order, invoice number unchanged (no `-{sellerId last 4}` suffix unless multiple groups).

### Seller requirement vs pickup/store requirement

| | Seller identity | Pickup / store warehouse |
|---|---|---|
| Required by current code for grouping | Convenient join key | — |
| Required by Shiprocket | **No** | **Yes** — named pickup location synced from Shiprocket |
| Required for AAURIKAA | Not as a marketplace actor | **Yes** — one warehouse |

---

## 8. Return / After-Sales Dependency

Seller is used for **policy**, **destination**, and **operator identity**. It is not a FK on `ReturnRequest`.

| Step | Seller role | Required vs replaceable |
|---|---|---|
| Eligibility | `resolveOrderReturnPolicy` reads `product.seller.returnAllowed/Window/Conditions` (inherit) or product override | 🟢 data must exist somewhere. Platform inherit **retired** (`SiteSettings.js` L108; `returnPolicyResolver.js` L1–5, L86–95) |
| Request create | No seller field stored | — |
| Evidence | Shopper-owned | — |
| Approval / reject | `PATCH /api/seller/returns/:id/review` + `assertSellerOwnsReturn` | 🟡 **actor**. Admin `override` exists; admin **cannot** run seller receipt/resolution routes |
| Reverse pickup | `resolveSellerDestination(sellerId)` → pickup address, then seller name/email/phone | 🟡 replaceable by default pickup + store contact |
| Inspection | Seller `confirm-receipt` | 🟡 actor |
| Refund | Wallet credit: shopper. Commission reversal: ⚪ | 🟢 / ⚪ |
| Replacement | Seller records `resolution: "replacement"` then **stops** | ⚪ fulfilment gap (not a seller-model gap) |
| Customer email | “Seller will inspect…” / notify seller | 🟡 copy + recipient |
| SLA cron | Seller reminder then admin escalation | 🟡 |

**Conclusion:** after-sales **policy and warehouse** can be store configuration. After-sales **Day 1 operations** still run through seller-gated services unless a small admin adapter calls `sellerReturnService` with the internal seller id (or those routes are later bound to admin). That adapter is an Option A implementation detail, not a reason to remove Seller.

---

## 9. Commission / Payout / Seller Finance

**All marketplace-only. Leave dormant. Do not delete.**

| Module | Files | AAURIKAA relevance |
|---|---|---|
| Commission calc | `utils/calculateCommission.js` (default **5%** if unset) | None if not invoked |
| Commission write | `sellerOrderController.updateOrderStatus` on `delivered` | None if seller order API unused |
| Commission model | `models/Commission.js` — `seller` required | Dormant |
| Ledger | `models/SellerLedger.js` | Dormant |
| Payout | `models/Payout.js`; `sellerPayoutController`; `admin/adminPayoutController` | Dormant |
| Refund clawback | `returnRefundFinancialService.js` | Only if commissions exist |
| Seller subscription | **Not implemented** | N/A |
| TD-012 poll vs commission | Missing commission on poll-delivered | Irrelevant if finance dormant; status dual-writer remains |

If the internal seller accidentally uses `/api/orders/seller/:id` to mark delivered, **commissions will be created**. Hide/disable that API for AAURIKAA ops; use admin order status instead.

---

## 10. Admin Dependency

| Question | Evidence |
|---|---|
| Must admin **select** a Seller? | Controller **allows** `seller: null`. GST/returns/reviews then degrade. **Practically yes** for a correct catalogue. |
| Inferred from admin user? | **No.** Explicit comment: do not put `req.user` (admin) in `seller` (`adminProductController.js` L542–548). |
| Seller filters mandatory? | **No.** `applyObjectIdFilter(filter, "seller", query.seller)` is optional. |
| Seller IDs in admin forms? | Backend expects `sellerId` / `sellerShop` / `shopName` on write. Current AAURIKAA admin mock has **no** such field. |
| Storefront exposure? | Public product populate includes seller shop/ratings/storefront path. AAURIKAA frontend types **do not consume them**. |

**Minimum admin adaptation (Option A, no marketplace terminology):**

1. Server-side: on admin create/update/import, **force** `Product.seller` (and `sellerShop`) to the internal store Seller `_id` if missing. Do not show a seller dropdown.
2. Do not list `/api/admin/sellers` in the AAURIKAA admin IA.
3. Pickup: use `/api/admin/pickup-locations` as “Warehouse”, keep one `isDefault`.
4. After-sales: either hidden internal seller login **or** admin UI calling existing seller return *services* (not seller portal).

That is “AAURIKAA Admin → AAURIKAA Catalogue” without renaming Mongo collections.

---

## 11. Storefront Dependency

Current AAURIKAA storefront (`frontend/src/types/commerce.ts`): product has `id`, `slug`, `price`, `categoryIds`, `collectionIds`, `variants`. **No seller.**

Backend **will** still return seller objects if the Next app is pointed at `/api/products` (`PUBLIC_SELLER_POPULATE_FIELDS`: shopName, shopImage, shopUrl, avgRating, reviewCount, return policy). Shopper order detail includes `sellerSummary`.

**AAURIKAA customer experience does not need:** seller id, seller name as a third-party merchant, storefront URL `/seller/{slug}`, seller rating, seller-specific shipping.

Return window **data** is needed (policy), but it should appear as **store policy**, not “this seller’s policy.”

Search suggestions include a `sellers[]` section (`globalSearchService.js`) — hide that section in the client or later omit it from the API. Not a Day 1 engine change.

---

## 12. Minimum Compatibility Layer

Derived from code, not assumed.

### Must exist (commerce-correct)

| Field | Why |
|---|---|
| `_id` | `Product.seller`, `Review.seller`, grouping, after-sales ownership |
| `username`, `email` | Seller schema **required** (`Seller.js` L8–9) |
| `isApproved: true` | Public storefront lookup / seller JWT if used internally |
| `address.state` (State ObjectId) | **GST origin** |
| `returnAllowed` + if true: `returnWindowDays` + `returnConditions` | After-sales eligibility; no platform fallback |
| Password hash | Only if internal seller login is used for after-sales |

### Should exist (ops / logistics)

| Field | Why |
|---|---|
| `pickupLocation` **or** a `SellerPickupLocation` with `isDefault: true` | Forward + reverse Shiprocket. Default pickup alone is sufficient if resolution is used. |
| `shopName` | Reverse-logistics destination name; optional SKU segment; leftover labels |
| `phone`, `email` | Reverse logistics fallbacks (`resolveSellerDestination`) |

### Not required for AAURIKAA commerce

KYC images, PAN/Aadhaar, `gst` (invoice uses SiteSettings), bank/UPI, `commission` / `categoryCommission`, `avgRating` / `reviewCount`, `shopUrl`, `approvalHistory`, `isVerified` (email), `SellerShop` documents.

### Conceptual mapping (compatibility only — not a new collection)

```text
AAURIKAA store identity
        ↓
Internal Seller document
        ├── _id            → Product.seller, Review.seller
        ├── address.state  → GST originState
        ├── return policy  → eligibility inherit
        └── pickupLocation → optional; else platform default warehouse

SiteSettings.footer.gstin / companyName / address
        └── invoice legal entity (already not Seller.gst)
```

**Smallest safe state:** one approved Seller + one default pickup + SiteSettings GSTIN + every product’s `seller` set to that `_id`.

---

## 13. Architecture Options

### Option A — Internal Seller compatibility

```text
AAURIKAA Business
       ↓
Internal Seller record (hidden)
       ↓
Existing commerce engine
```

| Dimension | Assessment |
|---|---|
| Code impact | Low. Force `sellerId` on admin writes; hide routes/UI; do not call seller order/payout APIs. Optional: admin adapter for after-sales services. |
| Database impact | One seed document + assign `Product.seller`. No schema migration. |
| Migration impact | Backfill `seller` on any null products. |
| Commerce risk | **Lowest.** GST origin, returns, reviews, pickup keep current wiring. |
| Regression risk | Residual marketplace fields on public JSON if clients forget to ignore them. Accidental commission if seller delivered-API is used. |
| Complexity | **Low–Medium** |
| Day 1 90% target | **Supports.** Reuses GST, checkout, Shiprocket, returns spine. |
| Maintainability | Seller remains a misleading name. Acceptable as an explicit compatibility seam until a later Store epic. |

### Option B — Remove Seller dependency

```text
AAURIKAA Business
       ↓
Existing commerce engine (no Seller)
```

| Dimension | Assessment |
|---|---|
| Code impact | **High.** GST origin wiring; restore or replace return policy (platform inherit retired); `Review.seller` required; fulfilment grouping; reverse destination; after-sales auth; search populate; admin filters; SKU segment; import tagging. |
| Database impact | Schema changes (`Review.seller` required:true); null `Product.seller`; drop or ignore Seller collection. |
| Migration impact | Every product, review, shipment subdocument, commission row. |
| Commerce risk | **High.** Easy to miss origin fallback (silent intra-state) or close all returns. |
| Regression risk | Touches TD-009 checkout coupling; after-sales TD-018 dual flow; reviews. |
| Complexity | **High** |
| Day 1 90% | **Threatens.** Large blast radius for no new shopper capability. |
| Maintainability | Cleaner long-term *if* complete; dangerous if partial. |

### Option C — Store / Business abstraction

```text
Store / Business
       ↓
Commerce engine
(Marketplace Seller optional)
```

| Dimension | Assessment |
|---|---|
| Code impact | **High.** New model + replace Seller reads in GST, returns, pickup, reviews, after-sales. Seller becomes optional for a future marketplace. |
| Database impact | New collection; dual-write or migrate Product.seller → storeId. |
| Migration impact | Same as B plus an abstraction layer. |
| Commerce risk | Medium if done as a facade over current Seller; High if done as a rewrite. |
| Regression risk | Same spine as B. |
| Complexity | **High** |
| Day 1 90% | **Threatens** if treated as a prerequisite. |
| Maintainability | **Best long-term** name and model for a single-brand house. Correct as a **later** epic once Option A is stable. |

---

## 14. Recommended Option

**Recommend Option A — Internal Seller compatibility layer.**

Why, from evidence:

1. `Product.seller` is already optional in Mongo; the **engine still reads it** for GST and returns. Seeding one id is cheaper than rewiring those reads.
2. The GST **engine** does not import Seller. Changing origin to Store is a future one-file input change, not a reason to delete Seller now.
3. Pickup **already** has a non-seller default. Warehouse ≠ marketplace seller.
4. Invoice legal entity **already** uses SiteSettings. No need to invent Store for GSTIN.
5. Return policy **cannot** fall back to platform today. A Store model would be a policy rewrite. Putting policy on the internal Seller reuses `returnPolicyResolver` unchanged.
6. `Review.seller` is required. Option B is a schema + write-path change before reviews work.
7. Commission/payout can stay in the repo unused. Option A does not require deleting finance code (and this spike forbids deletion).
8. Option C is the right *name* for the business, but it is Option A plus a facade. Doing the facade first delays catalogue, checkout, and Shiprocket integration.

**Do not decide Option C vs A as a Day 1 fork.** Treat C as a later rename/extract once AAURIKAA is live on A.

---

## 15. Implementation Impact (if A is chosen later)

This section is a **map**, not permission to implement.

### Can remain unchanged

Checkout orchestration, pricing/coupon math, PhonePe, COD, zone shipping engine, GST **engine**, Order schema (no order-level seller), cart, inventory fields, invoice PDF **layout**, shopper auth, CMS, RBAC catalog (hide domains in UI only), commission/payout **code**, seller route files (unmounted in the AAURIKAA admin IA / unused).

### Must configure / seed (no architecture change)

- One Seller: approved, email/username, `address.state`, return policy complete.
- One default `SellerPickupLocation` synced to Shiprocket.
- SiteSettings footer company + GSTIN.
- All products `seller` (+ `sellerShop`) = that id.
- `approvalStatus: approved` on published products (public listing requires it).

### Needs adaptation (small)

- Admin product create/update/import: inject internal `sellerId` so operators never pick a vendor.
- Hide public `/api/sellers`, search `sellers[]`, PDP seller badges, shopper `sellerSummary`, seller register, payouts, commissions UI.
- After-sales: admin ops path (call existing seller return **services** with internal seller id, or keep a non-public seller login). **This is the largest Option A functional gap.**
- Do not use `PUT /api/orders/seller/:id` for delivery (commission side effect). Use admin order status / Shiprocket poll.

### Marketplace-only (dormant)

Seller KYC, bank, commission hierarchy, payouts, ledger, public storefront `/seller/{slug}`, seller dashboard/analytics, seller product portal, seller inventory UI, `SellerShop` model, `SellerApprovalLog`, category commission fields, review **seller-authored** reviews.

---

## 16. Technical Debt Interaction

Only items that change this decision:

| ID | Interaction |
|---|---|
| **TD-009** Heavy checkout coupling | GST origin is injected inside `orderProcessingService`. Option B/C must edit that coupled pipeline. Option A leaves it alone. **Material.** |
| **TD-016** No inventory decrement | Independent of Seller. Do not fold inventory work into a Seller removal. |
| **TD-015** Cancel vs fulfilment | Independent of Seller. |
| **TD-018** Dual after-sales flows | Live path is **seller-owned** `after_sales`. Option A keeps that spine; admin-only rewrite is extra. Option B without an operator replacement **breaks** returns ops. **Material.** |
| **TD-017** Evidence upload gating | Unrelated to Seller as a model. |
| **TD-007** Duplicate shopper order mounts | Unrelated. |
| **TD-002** Public pricing | Pricing populate uses seller for origin — same as checkout. Rate-limit separately. |
| **TD-003** Dual OTP | Seller OTP is marketplace onboarding. Irrelevant if seller login unused; relevant if internal seller login is the after-sales actor. |
| **TD-001** Commission route shadowing | Resolved; finance remains dormant. Not a reason to remove Seller. |
| **TD-012** Delivered-via-poll skips commission | Favours leaving finance dormant rather than relying on seller delivered API. |

TD-009 is the strongest argument **against** Option B/C in this phase: origin, shipping, and coupon already share one write path. Replacing Seller there is a financial-regression surface.

---

## 17. Risks

1. **Silent GST mis-split** if products have null seller and no Store origin is added — intra-state default.
2. **All returns ineligible** if internal Seller return policy is left `null` (unconfigured).
3. **Review create 500s** if `product.seller` is null (`Review.seller` required).
4. **After-sales ops deadlock** if seller portal is hidden and admin is not wired to seller return services.
5. **Commission documents appear** if anyone marks delivered via seller order API.
6. **Public JSON still contains seller** — a future client might render “sold by” accidentally.
7. **Admin import `sellerId: req.user._id`** can persist an Admin id in a seller-shaped field — must be overridden to the store Seller on AAURIKAA imports.
8. **Name debt:** engineers will keep thinking in marketplace terms until Option C is scheduled.

---

## 18. Day 1 Impact

**Option A supports the 90% Day 1 reuse target.**  
Catalogue, cart, checkout, GST engine, zone shipping, PhonePe, Shiprocket, invoices, returns spine, and admin RBAC stay. Work is seed + hide + force foreign key + after-sales operator choice.

**Option B and Option C threaten Day 1.** They reopen the checkout tax path (TD-009), return policy (retired platform inherit), review schema, and fulfilment grouping before a single AAURIKAA SKU is sold.

---

## 19. Unresolved Architectural Questions

These are **not** blockers for recommending A. They should be confirmed before any later Option C.

1. **AAURIKAA place of supply** — which `State` ObjectId is `Seller.address.state`?
2. **After-sales actor for Day 1** — hidden internal seller JWT vs admin adapter over `sellerReturnService`?
3. **Whether to restore SiteSettings return policy** as a future Store field (would allow dropping Seller from eligibility).
4. **Whether `Product.seller` should become required in schema** once the internal id is universal (stricter integrity vs marketplace optionality).
5. **GSTIN source of truth** — keep SiteSettings only, or also fill `Seller.gst` for KYC leftover consistency (invoice will still use SiteSettings unless changed).

---

*End of spike. No architecture was implemented.*
