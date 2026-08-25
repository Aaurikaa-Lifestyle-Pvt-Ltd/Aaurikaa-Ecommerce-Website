# AAURIKAA Security Baseline Audit

**Document type:** Security gate — read-only source audit  
**Date:** 2026-08-19  
**Scope:** `backend/` (ANBAZAR-derived Express + MongoDB commerce engine)  
**Standards mapped:** OWASP ASVS 5.0 Level 2 principles, OWASP API Security Top 10, ecommerce business-logic security, AAURIKAA SRS / capability matrix  
**Method:** Static source inspection, route/middleware tracing, `npm audit --omit=dev` (advisory inventory only). No application code, configuration, Git, or data was modified. No PhonePe, Shiprocket, SMTP, or production requests were sent. No malicious files were uploaded.

**Evidence standard:** Each finding cites route, middleware, and controller/service. Where a control could not be proven from code, it is marked **Not verified** or **Requires runtime verification**. Existence of a mechanism is not treated as proof of correctness.

---

## Executive Verdict

**Conditional foundation.**

The inherited backend is **not an unsafe black box**: shopper JWT role checks, admin RBAC (when `PERMISSION_ENFORCEMENT=true`), buyer-scoped order/address/return/wallet reads, server-side GST/shipping/coupon math for non-variant lines, and PhonePe status polling (rather than client-declared “paid”) are real, code-backed controls.

It is **not yet a production-safe AAURIKAA foundation**. Confirmed financial-integrity and marketplace-boundary defects would allow a logged-in customer to underpay variant products, allow any approved seller to mark unpaid orders paid, leak live coupon codes, oversell SKUs, and burn coupon quotas without paying.

| Question | Answer |
|---|---|
| Overall risk | **High** for checkout, payment, inventory, coupons, and live seller APIs. **Moderate** for shopper-to-shopper IDOR (controls exist). |
| Can development proceed? | **Yes**, with blockers tracked. Do not treat checkout/payment as production-ready. |
| Can production launch proceed? | **No.** |
| Immediate blockers | Price tampering via `variantPriceSnapshot`; seller `pending → paid`; unauthenticated coupon dump; no stock decrement; coupon usage on unpaid create; paid cancel without refund; public seller registration + seller money APIs still live. |
| Phase 2 | **Conditional GO** for non-financial work (CMS, merchandising, catalogue wiring). **NO-GO** for payment go-live, public seller portal, or treating this audit as a production security sign-off. |

---

## Severity Summary

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 16 |
| Medium | 14 |
| Low | 8 |
| Informational | 6 |

Counts are unique findings below. Related observations are nested under a parent finding rather than double-counted.

---

## Release Blockers

These must be resolved before production traffic. They do **not** all have to be fixed before further development.

| ID | Finding | Evidence | Impact | Required Action |
|---|---|---|---|---|
| SEC-001 | Checkout trusts client `variantPriceSnapshot` | `orderProcessingService.js` L129–134, L202–206; `orderRoutes.js` `POST /api/orders` | Customer pays an arbitrary amount for variant SKUs | Recompute variant price from `Product.variantPricing` at order create; reject mismatch |
| SEC-002 | Approved seller can mark unpaid order `paid` | `orderFulfillmentGuards.js` L9–16; `sellerOrderController.js` L146–215; `PUT /api/orders/seller/:orderId/status` | Goods/commission without PhonePe collection | Remove `pending → paid` from seller transitions; require `paymentStatus === success` or COD |
| SEC-003 | Unauthenticated coupon dump | `couponRoutes.js` L6; `couponController.getCoupons` L67–75; mount `/api/admin/coupons` | Live codes + usageHistory PII (userId, IP, UA) | Require admin auth; never return `usageHistory` publicly |
| SEC-004 | Stock validated but never decremented | `orderProcessingService.js` L355–375; `orderRoutes.js` L112–122 (`salesCount` only) | Two buyers can purchase the last unit | Atomic reserve/decrement; restore on cancel/fail |
| SEC-005 | Coupon usage recorded at unpaid order create | `orderRoutes.js` L130–143; `pricingEngine.recordCouponUsage` L617–663 | Quota burn / DoS of limited coupons without payment | Record usage on payment success (or COD confirm); restore on cancel |
| SEC-006 | Shopper can cancel a **paid** order with no refund | `cancellationEligibilityService.js`; `shopperOrderController.js` L204–228 | Platform keeps capture; no coupon restore | Block paid cancel until refund policy, or enqueue refund |
| SEC-007 | Public seller registration and seller money APIs remain live | `sellerAuthRoutes.js` `POST /register`; `PUT /api/orders/seller/:orderId/status`; payout/ledger mounts | AAURIKAA customers (or accidental approved sellers) reach marketplace finance | Keep code; disable public register and seller portal at the edge / feature flag for AAURIKAA |

---

## Authentication

### Confirmed controls

| Control | Evidence | Status |
|---|---|---|
| Shopper password hashing | `bcryptjs.hash(..., 10)` in `shopperController.js` register/reset/profile | Confirmed |
| Seller password hashing | `bcryptjs.hash(..., 10)` in `sellerController.js` | Confirmed |
| Admin password hashing | Native `bcrypt` cost **12** in `models/Admin.js` pre-save | Confirmed |
| Shopper JWT role gate | `verifyShopper.js` requires `decoded.role === "shopper"` | Confirmed |
| Admin JWT role gate | `verifyAdmin.js` requires `decoded.role === "admin"` | Confirmed |
| Seller live account check | `verifySeller.js` loads Seller from DB and requires `isApproved` | Confirmed |
| Admin session revocation | `loadAdminContext.js` compares JWT `tokenVersion` to DB; bumped on password change | Confirmed |
| Public admin register disabled | `adminRoutes.js` L46–54 returns 403 | Confirmed |
| Production RBAC boot fail | `permissionEnforcement.assertProductionPermissionEnforcement` + `server.js` L25–33 | Confirmed |
| Shopper/seller login unified failure | Invalid credentials without distinguishing missing user vs bad password | Confirmed |

### Shopper authentication trace

| Step | Route | Finding |
|---|---|---|
| Registration | `POST /api/shopper/register` | Unauthenticated. Sends email OTP via `otpService`. Enumerates existing email/username (`"Email or username already exists"`). |
| Registration verify | `POST /api/shopper/verify-registration` | `otpService.verifyOTP` then `bcrypt.hash` + `Shopper` create with explicit fields (role hardcoded `"shopper"`). |
| Login | `POST /api/shopper/login` | Password compare; JWT `{ id, role, name }`, **7d**, `JWT_SECRET`, HS256 default. **No refresh, no logout, no tokenVersion.** |
| Password policy | Registration middleware only | `PASSWORD_REGEX`: min 8, one letter, one number. **Not applied** on profile password change or reset. |
| Profile password change | `PUT /api/shopper/update-profile` | Accepts `req.body.password` with **no current-password check** (L201–203). |
| OTP send (reset) | `POST /api/shopper/send-otp` | 404 `"Shopper not found"` if email missing → **account enumeration**. |
| OTP verify (legacy) | `POST /api/shopper/verify-otp` | Reads in-memory `otpStore` which **sendOTP never writes**. Dead endpoint (TD-003). |
| Reset | `POST /api/shopper/reset-password` | Uses DB `otpService.verifyOTP`; no password-policy middleware. |
| Session | Bearer JWT | `verifyShopper` does **not** load Shopper from DB. Deleted users keep working tokens until expiry. No `isActive`/ban field on `Shopper`. |
| Token storage | JSON body `token` | Assumes client storage (typically localStorage). No httpOnly cookie for shoppers. |

### Admin authentication trace

| Step | Route | Finding |
|---|---|---|
| Login | `POST /api/admin/login` | Different errors for missing admin vs bad password → **enumeration**. `loginAttempts` / `lockUntil` exist on `Admin` model and are **never called**. |
| JWT | 7d, `{ id, role:"admin", name, isSuperAdmin, tokenVersion }` | Role in token is always `"admin"` at sign time (not taken from client). |
| Password policy | `utils/adminPasswordPolicy.js` | Upper+lower+digit+special; enforced by Admin model validator. |
| Password reset OTP | `POST /api/admin/send-password-reset-otp` | 404 if admin not found → enumeration. |
| Privileged recovery | OTP email reset | No step-up / secondary channel. Anyone who can read the admin mailbox can reset. |
| Logout | None | Stateless JWT until expiry unless `tokenVersion` bumped. |

### Seller authentication (marketplace — still live)

| Step | Route | Finding |
|---|---|---|
| Register | `POST /api/seller/register` | **Public.** Creates `isApproved: false`. KYC files uploaded. |
| Login | `POST /api/seller/login` | JWT **without `role`**. Also sets `sellerToken` cookie: `httpOnly`, `secure` in production, `sameSite: "none"` in production. Token also returned in JSON. |
| Gate | `verifySeller` | DB load + `isApproved`. Unapproved sellers cannot call protected seller APIs. |
| Relevance to AAURIKAA | Entire `/api/seller/*` surface | **Dormant for the intended single-business model, but reachable.** Must remain in code; must not be customer-facing. |

### OTP

| Property | Evidence | Assessment |
|---|---|---|
| Generator | `otpService.generateOTP`: `Math.floor(100000 + Math.random() * 900000)` | **Not cryptographically secure** (ASVS L2 expects CSPRNG). |
| Storage | `models/OTP.js` stores OTP **plaintext** | Confirmed. |
| Expiry | 10 minutes | Confirmed. |
| Replay | `isUsed: true` on success | Confirmed. |
| Attempt lockout | Schema `attempts` max 3 is a field validator; `verifyOTP` increments but **never reads attempts to block** | Confirmed gap. 6-digit space brute-forceable within 10 minutes if unthrottled. |
| Send rate | Password reset: 3/hour. Registration: 3/hour **only if an unused unexpired OTP exists** | Registration cap bypassable. |
| HTTP limiter | Production login limiter **does not cover** OTP/register/reset | Confirmed. |

### JWT / session gaps

| ID | Severity | Classification | Finding |
|---|---|---|---|
| SEC-008 | 🟠 High | PRE-PRODUCTION | `JWT_SECRET` is **not** asserted at boot (`server.js`). Process listens before first `jwt.sign`. Missing secret fails later; empty/weak secret is a deploy-time footgun. **Requires runtime verification** of production secret entropy. |
| SEC-009 | 🟡 Medium | HARDENING | Shared `JWT_SECRET` across shopper/admin/seller. Role is checked in middleware, so this is not an automatic privilege escalation, but one leak compromises all actor types. |
| SEC-010 | 🟡 Medium | HARDENING | Shopper/seller tokens are not revoked on password change. 7-day lifetime with no refresh rotation. |
| SEC-011 | 🟡 Medium | PRE-PRODUCTION | Shopper login rate limiter is mounted on **`/api/shoppers/login`** (`server.js` L52) but the real route is **`/api/shopper/login`**. Production brute-force protection for customers **does not apply**. Seller and admin login paths match. |
| SEC-012 | 🟡 Medium | HARDENING | OTP uses `Math.random()`, plaintext storage, no attempt lockout. |
| SEC-013 | 🔵 Low | HARDENING | Dual OTP: live `otpService` vs dead `otpStore` / unused Shopper `otp` fields. |
| SEC-014 | 🟡 Medium | HARDENING | Account enumeration on shopper/seller/admin reset and register; admin login not-found vs invalid credentials. |
| SEC-015 | 🟡 Medium | HARDENING | Profile password change without current password (session theft → account takeover). |

**Authentication assessment:** Adequate for continued development. Not ASVS L2 complete. No confirmed authentication **bypass**. Highest auth risks are weak OTP, dead shopper login limiter, missing JWT boot check, and 7-day irrevocable shopper tokens.

---

## Authorization

### Conceptual tests (code-traced, not live-exploited)

| Scenario | Result | Evidence |
|---|---|---|
| Customer A → Customer B order | **Blocked** | `Order.find({ buyer: req.user.id })`; detail/cancel/invoice compare buyer |
| Customer A → Customer B address | **Blocked** | `findOne({ _id, user: userId, userType })` |
| Customer A → Customer B return | **Blocked** | `Order.findOne({ _id, buyer: buyerId })`; appeal `ReturnRequest.findOne({ _id, buyer })` |
| Customer A → Customer B wallet | **Blocked** | Wallet routes have no foreign `:id`; keyed by `req.user.id` |
| Customer A → Customer B profile | **Blocked** | `Shopper.findById(req.user.id)` |
| Customer → admin endpoint | **Blocked** if `verifyAdmin` present | JWT `role !== "admin"` → 403 |
| Unauthenticated → payment update | **Blocked** | `POST /api/payment/update-status` uses `withAdminAuth("orders","manage")` |
| Low-privilege admin → Super Admin staff CRUD | **Blocked in production** | `requirePermission("admin_users","manage")` + `requireSuperAdmin` |
| Low-privilege admin → other domains | **Blocked in production** when `PERMISSION_ENFORCEMENT=true`; **no-op in non-production** | `requirePermission.js` L15–17 |
| Seller A → Seller B product (update/delete) | **Mostly blocked** | Queries include `seller: req.user._id` **except** `GET /all` and bulk-pricing |
| Seller A → any order status | **Partial IDOR** | Needs one own line, then mutates **whole order** including `paid` |

### Endpoint authorization map (protected and sensitive)

Legend: **shopper** = `verifyShopper`; **seller** = `verifySeller`; **admin** = `verifyAdmin` + `loadAdminContext`; **perm** = `requirePermission`; **none** = no auth.

#### Shopper

| Method | Route | Auth | Ownership | Sensitive |
|---|---|---|---|---|
| POST | `/api/shopper/register` | none | n/a | Account create |
| POST | `/api/shopper/login` | none | n/a | Auth (limiter path **wrong**) |
| POST | `/api/shopper/send-otp` | none | n/a | Reset |
| POST | `/api/shopper/reset-password` | none | n/a | Reset |
| GET/PUT | `/api/shopper/profile`, `/update-profile` | shopper | self | Password optional on PUT |
| GET/POST/PUT/DELETE | `/api/shopper/cart*` `/wishlist*` `/compare*` | shopper | self | |
| GET | `/api/shopper/orders`, `/api/shopper/orders/:id` | shopper | buyer | |
| POST | `/api/shopper/orders/:id/buy-again` | shopper | buyer | |
| GET/POST | `/api/shopper/orders/:id/return-*` | shopper | buyer | Evidence upload |
| GET | `/api/shopper/wallet*` | shopper | self | Read-only |
| CRUD | `/api/addresses/shopper*` | shopper | `{user,userType}` | |
| POST | `/api/orders`, `/api/orders/create-pending` | shopper | buyer from token | Checkout |
| PUT | `/api/orders/:id/cancel` | shopper | buyer | Paid cancel allowed |
| GET | `/api/orders/:id/invoice` | shopper | buyer | |
| POST | `/api/payment/initiate`, `/verify` | shopper | buyer check | Amount from `order.totalAmount` |

#### Admin (representative; all listed mounts use `verifyAdmin` unless noted)

| Mount | Auth | Notes |
|---|---|---|
| `/api/admin/login`, password-reset OTP | none | Enumeration |
| `/api/admin/users*` | admin + perm `admin_users` + Super Admin | Staff |
| `/api/admin/products*` | admin + catalog perms | |
| `/api/admin/orders*` | admin + orders / order_confirmations | Status transitions include `pending → paid` (privileged) |
| `/api/admin/returns*` | admin + `order_returns` (**always enforced in production**) | |
| `/api/admin/payment/reverify/:orderId` | admin + orders manage | PhonePe poll |
| `/api/payment/update-status` | admin + orders manage | Can set success **without** PhonePe |
| `/api/commissions*` | `router.use(verifyAdmin)` | Finance |
| `/api/dashboard*` | `adminBaseAuth` | Any active admin |
| `/api/admin/coupons` GET | **none** | **SEC-003** |
| `/api/admin/offers` GET | **none** | Admin emails via populate |

#### Seller (still mounted — AAURIKAA marketplace boundary)

| Method | Route | Auth | Ownership | Sensitive |
|---|---|---|---|---|
| POST | `/api/seller/register` | none | n/a | Public KYC upload |
| GET | `/api/seller/products/all` | seller | **No seller filter** | Full product docs |
| GET | `/api/seller/products/my` | seller | yes | |
| PUT/DELETE | `/api/seller/products/:id` | seller | yes | |
| POST/DELETE | `/api/bulk-pricing/seller/products/:productId/bulk-pricing` | seller | **No product.seller check** | Price rules |
| PUT | `/api/orders/seller/:orderId/status` | seller | ≥1 own line | **Whole-order status, including `paid`** |
| * | `/api/seller/payouts*`, ledger | seller | self | Money |
| * | `/api/seller/returns*` | seller | participating seller | Full-order refund trigger |
| * | `/api/seller/inventory*` | seller | `{_id, seller}` | Stock write (no lifecycle) |
| POST | `/api/brands/seller` | seller | n/a | Creates **global** brand |

#### Unauthenticated mutation / sensitive read (confirmed)

| Method | Route | Risk |
|---|---|---|
| GET | `/api/admin/coupons` | Coupon codes + usageHistory |
| GET | `/api/admin/offers` | All offers + creator email |
| GET | `/api/comments/blog/:id?status=pending` | Unpublished comments |
| POST | `/api/comments/` | Unauthenticated HTML/comment spam |
| POST | `/api/pricing/*` | Coupon oracle, CPU-heavy quotes |
| GET | `/api/settings/scripts` | Third-party script payload (storefront intended) |
| POST | `/api/newsletter/subscribe` | No limiter in router |
| POST | `/api/shopper/register`, `/api/seller/register` | Unauthenticated uploads |

### Authorization findings

| ID | Severity | Classification | Finding |
|---|---|---|---|
| SEC-002 | 🔴 Critical | RELEASE BLOCKER | Seller function-level authorization allows `pending → paid` without payment. |
| SEC-016 | 🟠 High | PRE-PRODUCTION | `GET /api/seller/products/all` returns `Product.find()` with no seller filter (includes fields public listing strips, e.g. cost-adjacent data if present on the document). |
| SEC-017 | 🟠 High | PRE-PRODUCTION | Seller bulk-pricing POST/DELETE does not check `product.seller === req.user._id`. |
| SEC-018 | 🟠 High | RELEASE BLOCKER (AAURIKAA) | Public seller registration remains the on-ramp to SEC-002/016/017 and payouts. |
| SEC-019 | 🟡 Medium | HARDENING | `requirePermission` is a no-op unless `PERMISSION_ENFORCEMENT=true`. Production refuses to boot without it — **dev/staging staff JWT is any-admin**. |
| SEC-020 | 🟡 Medium | HARDENING | `middleware/authGeneric.js` (`verifyAuth`) accepts any role and is currently **unused**. Do not wire it to seller/admin routes. |
| SEC-021 | 🔵 Low | INFORMATIONAL | Seller address helpers use `req.user.id` while `verifySeller` sets a Mongoose `toObject()` (typically `_id`, no `id`). Likely 401, not IDOR. **Requires runtime verification.** |

**Authorization assessment:** Shopper resource ownership is the strongest area of this codebase (BOLA on orders/addresses/returns/wallet/profile is implemented). The broken layer is **function-level authorization on seller and a few “admin” GETs that were never gated**. For AAURIKAA that is worse than it was for ANBAZAR: seller is supposed to be an internal compatibility record, but the HTTP surface is still a public marketplace.

---

## Input Validation & Injection

| ID | Severity | Classification | Category | Evidence | Attack | Impact | Remediation | Blocker |
|---|---|---|---|---|---|---|---|---|
| SEC-022 | 🟡 Medium | PRE-PRODUCTION | NoSQL operator injection | Login/OTP `findOne({ email: identifier })` with JSON body objects; no `express-mongo-sanitize`; mongoose `sanitizeFilter` **not verified** as enabled | `{ "identifier": { "$gt": "" } }` matches first user (password still required) | User enumeration / unexpected matches; not a proven auth bypass | Coerce strings; enable sanitizeFilter; reject non-string identifiers | NO |
| SEC-023 | 🟡 Medium | PRE-PRODUCTION | Comment status IDOR + operator | `GET /api/comments/blog/:blogId` uses attacker `req.query.status` (default `approved`) | `?status=pending` lists unmoderated comments; `status[$ne]=approved` possible via qs | PII / unpublished content | Allowlist status; ignore query for public | NO |
| SEC-024 | 🟡 Medium | HARDENING | Regex / ReDoS | `categoryHierarchyListingService.js` L49–50: `$regex: search.trim()` **unescaped**; `globalSearchService.js` tag filter `$regex: tag` unescaped. Product `q` path **does** use `escapeRegex` in `searchUtils.js` | Pathological search strings | CPU DoS | Escape all `$regex` inputs (pattern already exists) | NO |
| SEC-025 | 🔵 Low | HARDENING | Admin shipping name regex | `admin/shippingController.js` interpolates `name.trim()` into `RegExp` | ReDoS / regex metacharacters | Admin-only | escapeRegex | NO |
| SEC-026 | 🟡 Medium | PRE-PRODUCTION | Stored XSS (comments/reviews) | `POST /api/comments/` stores `content` trimmed only; reviews default `status: "approved"` (`Review.js` L70–73) | Unauthenticated comment HTML; authenticated review XSS on PDP | Stored XSS if storefront renders unsafely | Sanitize/escape; reviews pending-by-default | NO |
| SEC-027 | 🟠 High | PRE-PRODUCTION | SVG / content-type XSS | `secureUpload.js` allows `image/svg+xml`; `mediaRoutes.js` allows `.svg` and any `image/*` | Stored SVG script on public R2 URL | XSS vs admin/storefront origin if SVG opened inline | Disallow SVG or sanitize; serve `Content-Disposition: attachment` | NO |
| SEC-028 | 🔵 Low | INFORMATIONAL | Prototype pollution (xlsx) | `xlsx@0.18.5` GHSA-4r6h-8v6p-xvw6; import gated by `ENABLE_XLSX_IMPORT` | Crafted workbook | Depends on import being enabled | Do not enable XLSX until upgraded/replaced | NO |
| SEC-029 | ⚪ Info | INFORMATIONAL | Command injection | `child_process` only in scripts/signoff, not request handlers | — | None on HTTP path | — | NO |
| SEC-030 | ⚪ Info | INFORMATIONAL | SSRF | PhonePe/Shiprocket URLs are env-fixed, not client URLs | Client `redirectUrl` is **server-built** from `PHONEPE_REDIRECT_URL` | Open redirect on success page is a frontend concern | Keep gateway URLs server-side | NO |

**Not verified:** Whether production MongoDB users have `$where` disabled (code does not use `$where` on live paths). Whether R2 `Content-Type` is stored as client MIME (likely yes for media).

---

## Mass Assignment

| ID | Severity | Classification | Evidence | Attack | Impact | Remediation | Blocker |
|---|---|---|---|---|---|---|---|
| SEC-031 | 🟡 Medium | HARDENING | Admin `updateShopper`: `{ ...req.body }` → `findByIdAndUpdate` (`shopperController.js` L347–354) | Admin JWT with `shoppers:manage` can set `role` or arbitrary Shopper fields | Footgun; shopper login still requires `role: "shopper"` so this is **not** self-escalation to admin JWT | Whitelist fields | NO |
| SEC-032 | 🔵 Low | INFORMATIONAL | Admin `new Seller(req.body)` | Privileged admin create | Expected for admin, still overly broad | Whitelist | NO |
| SEC-033 | 🔵 Low | INFORMATIONAL | Shopper self-update uses `SHOPPER_PROFILE_UPDATE_FIELDS` whitelist | Cannot set `role` | Confirmed safe | Keep whitelist | NO |
| SEC-034 | ⚪ Info | INFORMATIONAL | Order create sets `buyer: req.user.id`, `paymentStatus: "pending"` | Client `totalAmount` is **destructured and unused** as payable | Confirmed not trusted for totals | Keep explicit construction | NO |
| SEC-035 | 🟡 Medium | HARDENING | `settingsController.updateScripts`: `settings.scripts = req.body` | Compromised admin (or CSRF if cookie auth added) injects storefront JS | Stored XSS site-wide | Whitelist `header`/`footer` strings | NO |

Mongoose `strict` mode strips unknown paths on Shopper; `role` **is** a schema field, so it is assignable via admin update. Schema has **no** `walletBalance` / `isAdmin` / `paymentStatus` on Shopper.

**Not verified:** Every admin product update path for `vendorCost` / `approvalStatus` from seller-shaped clients. Seller product add sets `seller: req.user._id || body.sellerId`; `verifySeller` always provides `_id`, so the fallback is unused in practice.

---

## Ecommerce Business Logic

### Pricing / cart / checkout

**Confirmed server authority (non-variant):** `createOrderWithBulkDiscounts` recomputes item prices from `product.salePrice || product.regularPrice`, then coupon (`validateCoupon` with `buyer`), shipping engine, GST engine, `finalAmount`. Client `totalAmount` is not the payable.

**Confirmed failure (variant):** If `item.variantPriceSnapshot` is present, it is used as `basePrice` without recomputing `getVariantPricing`. Checkout does **not** re-read the shopper cart; it trusts `req.body.items`. Add-to-cart *does* snapshot from DB (`cartAddService.js` L126–130), but that is not binding at order time.

**Unpublished products:** `Product.findById(item.product)` in `validateAndProcessOrder` does **not** require `status: 'published'` or `approvalStatus: 'approved'`. Cart add has the same gap. Knowing an ObjectId is enough to order a draft.

**Quantity:** Checkout requires `quantity > 0` but does not integer-cap. Cart add uses `parseInt` and stock check. Checkout is a separate body.

**Inactive products:** Not verified as a dedicated `isActive` product flag; catalogue uses `status` / `approvalStatus`.

**Seller/store identity:** Taken from `product.seller`, not client `sellerId` on the shopper order path.

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-001 | 🔴 Critical | RELEASE BLOCKER | Variant price tampering | YES |
| SEC-036 | 🟠 High | PRE-PRODUCTION | Unpublished/unapproved products orderable by ID | NO |
| SEC-037 | 🟡 Medium | PRE-PRODUCTION | Public `/api/pricing/*` (TD-002): coupon probing, client-supplied snapshots on **quotes** (not persisted unless checkout also trusts snapshot) | NO |
| SEC-038 | 🟡 Medium | HARDENING | COD: `status: processing`, `paymentStatus: pending`, Shiprocket sync immediately | NO |
| SEC-039 | 🔵 Low | HARDENING | Client may persist `paymentMethod: razorpay|stripe`; no live charge; order stays pending unless seller/admin force `paid` | NO |

---

## Payment Security

**Trace (confirmed):**

1. Shopper `POST /api/orders` → server totals → `paymentStatus: pending`.
2. Shopper `POST /api/payment/initiate` → buyer check → `amountPaisa = Math.round(order.totalAmount * 100)` → PhonePe V2 checkout → store `paymentTransactionId`.
3. Shopper `POST /api/payment/verify` → buyer check → PhonePe **order-status API** (OAuth) → `COMPLETED` ⇒ `paymentStatus: success`, `status: paid`.
4. Cron every 10 minutes (`paymentVerificationJob.js`) for stale pending PhonePe orders.
5. Admin `POST /api/admin/payment/reverify/:orderId` same poll.
6. Admin `POST /api/payment/update-status` can set success **without** PhonePe (back-office).

**Customer cannot mark unpaid as paid via payment APIs.** Confirmed. The bypass is **seller/admin order status**, not `/api/payment/verify`.

| Control | Status |
|---|---|
| Amount generated from server `order.totalAmount` | Confirmed |
| Callback authenticity / HMAC webhook | **Absent.** `PHONEPE_CALLBACK_URL` is only in `.env.example`. Checkout payload sends `redirectUrl` only. Comment in `server.js`: “no-webhook fallback”. |
| Paid amount vs PhonePe amount | **Not compared** in `applyPhonePeStateToOrder` |
| Idempotent re-verify of already-success | Confirmed early return |
| `paymentTransactionId` unique index | **Not verified / likely absent**; initiate overwrites TXN id |
| Overlapping verify + cron | No `findOneAndUpdate` version filter — **Requires runtime verification** of double-write |
| Razorpay | Dependency present; **no** `require('razorpay')` on payment path |

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-040 | 🟠 High | PRE-PRODUCTION | No webhook; poll-only; no signature; no amount bind to PhonePe payload | NO (customer cannot self-mark paid; still required before go-live) |
| SEC-002 | 🔴 Critical | RELEASE BLOCKER | Seller `pending → paid` bypasses PhonePe entirely | YES |
| SEC-041 | 🟡 Medium | HARDENING | Initiate mints a new merchant order id and overwrites the previous one | NO |

**Payment assessment:** PhonePe **shopper** path is designed correctly (server amount + gateway status poll). It is **not** production-complete (no webhook, no amount reconciliation). The exploitable “mark unpaid as paid” path is **seller/admin order status**, not the PhonePe controller.

---

## Order Security

**Status enum** (`models/Order.js`): `pending`, `pending_verification`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, `failed`.

**Transition table** (`BASE_ALLOWED_TRANSITIONS`):

```
pending → paid | cancelled
paid → processing
processing → shipped   (or delivered if shipping skipped)
shipped → delivered
delivered → ∅
cancelled → ∅
```

`pending_verification` normalizes to `pending`. `failed` normalizes to `cancelled`.

| Actor | Can set | Guard |
|---|---|---|
| PhonePe verify/cron | paid / cancelled | Gateway `COMPLETED` / `FAILED` |
| Shopper | cancelled | Owner + not shipped/AWB; **paid allowed** |
| Seller | any allowed transition including **pending → paid** | Owns ≥1 line |
| Admin | same transition table | `orders:manage`; does **not** set `paymentStatus` on status PUT |
| Admin payment | paymentStatus success/failed | `orders:manage` |

Illegal jumps such as `pending → delivered` are **rejected** by the table. `pending → paid` is **legal** in the table — that is the defect for sellers.

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-002 | 🔴 Critical | RELEASE BLOCKER | Seller skip-pay | YES |
| SEC-006 | 🟠 High | RELEASE BLOCKER | Paid cancel, no refund | YES |
| SEC-042 | 🟡 Medium | HARDENING | One seller’s status update is order-global (mixed cart) | NO |
| SEC-043 | 🟡 Medium | HARDENING | No `statusHistory` / audit on Order | NO |

---

## Inventory Security

**Confirmed:** Checkout and cart add **read** `product.stock` / `getVariantStock` and reject `quantity > available`.

**Confirmed absent:** Production `$inc` on stock at order create, payment success, cancel, or return. Only `salesCount` increments. Tests in `seller-order-management.test.js` mock decrement; that is **not** the live order path.

**Concurrency:** No Mongo session around stock + order insert. No reservation document. Two concurrent `findById` + `save` both pass `availableStock === 1`.

**Customer A + Customer B, qty 1, stock 1:** Both orders persist. Both can pay (PhonePe) or COD-fulfil. **Confirmed oversell.**

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-004 | 🟠 High | RELEASE BLOCKER | No decrement/restore/atomic reserve (TD-016; capability matrix §15) | YES |

Do not implement the inventory fix in this audit (per task). This remains the highest-risk jewellery-catalogue commerce defect.

---

## Coupon Security

| Control | Checkout path | Public quote path |
|---|---|---|
| Code validity / min order | Server subtotal + `buyer` | Client `cartTotal`, **no userId** |
| Global / per-user limits | Enforced at validate time | Limits not fully applied on quote |
| Usage write | **Immediately after `order.save()`**, unpaid included | n/a |
| Atomic `$inc` with limit | `usedCount += 1` then `save` — race | |
| Restore on cancel/fail | **Absent** | |
| Stacking | Single coupon field | |

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-003 | 🔴 Critical | RELEASE BLOCKER | `GET /api/admin/coupons` unauthenticated full documents | YES |
| SEC-005 | 🟠 High | RELEASE BLOCKER | Unpaid create consumes quota (financial + availability DoS) | YES |
| SEC-044 | 🟡 Medium | PRE-PRODUCTION | Concurrent checkout can over-issue limited coupons | NO |
| SEC-037 | 🟡 Medium | HARDENING | Public validate-coupon oracle | NO |

---

## Refund / Wallet Security

| Control | Status |
|---|---|
| Shopper wallet HTTP | GET summary + GET transactions only |
| Customer `refundAmount` / `walletBalance` | **Not accepted** on shopper APIs |
| Refund amount | `buildOrderFinancialSnapshot(order).total` (full order) |
| Duplicate credit | `idempotencyKey` `after_sales_refund:{returnRequestId}` + unique index catch |
| PhonePe refund API | **Does not exist** |
| Wallet spend at checkout | **Does not exist** |
| Policy | HOLD (capability matrix §18) — code already credits wallet |

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-045 | 🟠 High | PRE-PRODUCTION | Any participating seller can accept refund with `returnRequired: false` and credit **full order total** to wallet (`returnRefundOrchestrationService.js` L40–51; `sellerReturnService.js` L319–323 documents this as freeze limitation) | NO (AAURIKAA single seller reduces mixed-cart abuse; still an ops risk) |
| SEC-046 | 🔵 Low | INFORMATIONAL | Admin legacy refund-complete does not call wallet for `after_sales` cases (`canCompleteRefund` false) | NO |

Do not implement a refund-destination policy in this audit.

---

## Returns / Replacement

| Control | Status |
|---|---|
| Shopper create/get/evidence/appeal | `verifyShopper` + buyer-scoped order load | Confirmed |
| Seller act | `assertSellerOwnsReturn` — any product on the order | Confirmed (order-level, not line-level) |
| Admin | `order_returns:manage`; production always enforced | Confirmed |
| Replacement fulfilment | Record-only / manual follow-up | Not a security bypass; operational gap |
| Unique active return per order | Partial unique index | Confirmed intent |

Customers **cannot** operate another customer’s return. Privileged seller/admin actions require those roles. Remaining issue is **over-broad seller power** on an order-level case (SEC-045).

---

## File Uploads

| Path | Auth | Types / size | Notes |
|---|---|---|---|
| Shopper register / profile | none / shopper | `secureUpload` profiles | Unauth register image |
| Seller register KYC | none | images + PDF, 5MB | **Public R2 URL stored** (`sellerController` filename = publicUrl) |
| Product (admin/seller) | admin/seller | products allowlist; `multer.any()` | |
| `/api/media` | seller or admin | **any image/video MIME, SVG, AVI/MKV, 100MB**; unused `createFileFilter` | Weakest uploader |
| Return evidence | shopper | images + video, 25MB/10MB | Public URL |
| Career resume | optional shopper | PDF/DOC, 5MB; prod limiter | Admin-streamed download; object may still be public if bucket is |
| `GET /uploads` | none | leftover disk | World-readable if files exist |

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-047 | 🟠 High | PRE-PRODUCTION | `/api/media` 100MB + SVG + any `image/*` | NO |
| SEC-048 | 🟠 High | PRE-PRODUCTION | KYC (Aadhaar/PAN/GST) as public CDN URLs | NO |
| SEC-027 | 🟠 High | PRE-PRODUCTION | SVG unsanitized | NO |
| SEC-049 | 🟡 Medium | HARDENING | Return evidence public URLs | NO |
| SEC-050 | 🟡 Medium | HARDENING | Unauthenticated seller/shopper register uploads (storage DoS) | NO |

No confirmed remote code execution on the Node process from uploads (memory storage + R2). Risk is **malicious content hosting and PII exposure**, not classic RCE. **Do not treat npm/multer DoS advisories as proven RCE.**

---

## Secrets

| Type | File | Location | Severity | Value |
|---|---|---|---|---|
| SMTP username logged at boot | `backend/server.js` | L289–292 | 🟠 High | **Redacted** (`MAIL_USER` printed; `MAIL_PASS` only yes/no) |
| Hardcoded seed passwords | `backend/scripts/setup-users.js` | L29–80 | 🟡 Medium | **Redacted** (admin/shopper/seller seed accounts, seller pre-approved) |
| Env templates | `backend/.env.example` | names only | ⚪ Info | Empty values |

**Confirmed absent from tracked source:** Mongo URIs with credentials, PhonePe/R2/Shiprocket secret literals, PEM/private keys, committed `.env`.

**`.env` ignore:** Root `.gitignore` L13–21 and `backend/.gitignore` L12–19 ignore `.env` / `*.env`, keep `.env.example`. `git check-ignore` confirms `backend/.env` is ignored. `git ls-files` found **no** tracked `.env`.

**JWT / Mongo / PhonePe / R2 / Shiprocket / SMTP:** Read from `process.env` in config/services. Production presence **Requires runtime verification**.

---

## Error Handling

| Control | Status |
|---|---|
| Global `errorHandler` | Client gets message/code/timestamp; **no stack** in JSON |
| Production vs dev branch in handler | **None** — same client shape; stack only in `console.error` |
| Mongoose 11000 | Returns **field name** (`email already exists`) |
| ValidationError | Returns `e.message` strings |
| `bulkProductImportController` | Stack only if `NODE_ENV === 'development'` |
| Seller login 500 | `{ error: err.message }` leaked |

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-051 | 🔵 Low | HARDENING | Duplicate-key and validation messages aid enumeration | NO |
| SEC-052 | 🔵 Low | HARDENING | Some controllers leak `err.message` | NO |

---

## CORS / HTTP Security

| Control | Evidence | Assessment |
|---|---|---|
| CORS origins | `CORS_ORIGIN` split, else `FRONTEND_URL`, else prod `[]` / dev localhost:3000 | Restrictable for AAURIKAA frontends. Empty prod list = deny all (fail closed). |
| credentials | `true` | Appropriate for seller cookies; shopper/admin are Bearer |
| Helmet | **Production only**; `crossOriginResourcePolicy: cross-origin` | Dev has no Helmet. No custom CSP. |
| Seller cookie | httpOnly + secure(prod) + sameSite none(prod) | Cross-site cookie → **CSRF** if CORS includes an attacker origin |
| CSRF tokens | **Absent** | Shopper/admin Bearer-from-header are not classic CSRF; seller cookie is |
| Rate limit | Production only; shopper path typo | See SEC-011 |

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-053 | 🟡 Medium | PRE-PRODUCTION | Seller `sameSite: none` + no CSRF | NO (depends on CORS_ORIGIN) |
| SEC-054 | 🔵 Low | HARDENING | Helmet disabled in non-production | NO |

**Wildcard CORS:** Not present. Do not flag as Critical.

---

## Rate Limiting

Production only (`NODE_ENV === 'production'`):

| Path configured | Actual route | Applies? |
|---|---|---|
| `/api/shoppers/login` | `/api/shopper/login` | **No** |
| `/api/seller/login` | match | Yes |
| `/api/admin/login` | match | Yes |
| `/api/enquiries` | match | Yes |
| `/api/career-applications` | match | Yes |

**Absent HTTP limits:** register, OTP, password reset, payment initiate/verify, search, uploads, `/api/pricing/*`, newsletter, coupon GET.

OTP has application-level 3/hour (with registration bypass).

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-011 | 🟠 High | PRE-PRODUCTION | Shopper login limiter dead | NO |
| SEC-055 | 🟡 Medium | PRE-PRODUCTION | No limiter on payment initiate / register / pricing | NO |

---

## External Integrations

### PhonePe

OAuth client credentials; checkout amount from order; status via GET order API; no webhook HMAC; env `PHONEPE_*`. Do not call production.

### Shiprocket

Outbound API login with `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD`. **No inbound webhook route or signature check.** Tracking is a 15-minute poll (`server.js` L314–320).

### MongoDB

`mongoose.connect(process.env.MONGODB_URI)` without explicit TLS options. Atlas `mongodb+srv` typically TLS; **Requires runtime verification**.

### Cloudflare R2

Credentials from env; `PutObject` without ACL; app always builds public URLs. Bucket publicity **Requires runtime verification**. Presigned **upload** helpers exist and are **not mounted**. No presigned **download** for KYC.

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-040 | 🟠 High | PRE-PRODUCTION | PhonePe poll-only / no amount bind | NO |
| SEC-056 | 🟡 Medium | HARDENING | No Shiprocket webhook authenticity (poll trust) | NO |
| SEC-048 | 🟠 High | PRE-PRODUCTION | R2 objects treated as public | NO |

---

## Marketplace Boundary

AAURIKAA is a **single business** with an internal Seller compatibility record. The backend still exposes a full marketplace.

| Surface | Must remain internally | Must be inaccessible to AAURIKAA customers | Must be inaccessible to ordinary admins | Must never run in AAURIKAA workflows |
|---|---|---|---|---|
| Seller product CRUD | Yes (or collapse to admin catalog) | Yes | Catalog admins may need product CRUD via **admin** routes | Customer-facing seller portal |
| `PUT .../seller/:orderId/status` | Ops via **admin** order routes | Yes | Only `orders:manage` | Seller self-mark `paid` / `delivered` |
| Commission create on `delivered` | Ledger may stay for one internal seller | Yes | Restrict `finance` | Customer-triggered commission |
| `/api/seller/payouts`, ledger | Internal finance | Yes | Super Admin / finance only | Customer payout requests |
| Seller KYC / public storefront `/api/sellers/storefront/:shopUrl` | Hide | Yes | n/a | Public multi-vendor storefront |
| `POST /api/seller/register` | Disable | Yes | n/a | Public onboarding |
| `/api/commissions` HTTP | Admin finance | Yes | Already admin-gated | Seller HTTP dispute (already removed) |

**Order-status → commission:** `sellerOrderController.js` L234–286 creates `Commission` (`status: 'approved'`) and `SellerLedger` `commission_earned` when seller sets `delivered`. Admin status PUT does **not** contain that block (commission gap for admin-delivered / Shiprocket poll was previously noted as TD-012 — financial consistency, not a customer exploit).

Do not remove seller functionality; isolate it.

---

## Dependency Security

Command: `npm audit --omit=dev` in `backend/` (no install, no upgrade).

| npm audit (prod) | Count |
|---|---|
| Critical | 1 (`fast-xml-parser` RangeError DoS — **transitive**, typically AWS XML) |
| High | 18 (includes `xlsx` prototype pollution, `mongoose` sanitizeFilter `$nor`, `multer` DoS, `nodemailer` domain confusion, `jws` HMAC, `express-rate-limit` IPv4-mapped IPv6 bypass) |
| Moderate | 25 |
| Low | 1 |
| Total | 45 |

**These are known dependency vulnerabilities, not proven application exploits.**

| Package | Application relevance |
|---|---|
| `xlsx@0.18.5` | Used if Excel import/export enabled — **treat as real risk when `ENABLE_XLSX_IMPORT=true`** |
| `mongoose` sanitizeFilter advisory | App does **not** appear to enable `sanitizeFilter`; operator injection is still possible via object query values (SEC-022) |
| `express-rate-limit` IPv6 bypass | Only relevant where limiter actually mounts (seller/admin login, not shopper) |
| `razorpay` | Unused require — extra surface / confusion |
| `express-fileupload` | Never required — dead |
| `react-image-gallery` / `react-image-magnify` | No backend imports — leftover |
| `bcrypt` + `bcryptjs` | Dual hash stacks; not a vuln by itself |
| `jsdom` | TipTap HTML; XSS depends on sanitizer — **Not fully verified** |

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-057 | 🟡 Medium | PRE-PRODUCTION | xlsx prototype pollution if Excel import enabled | NO |
| SEC-058 | 🔵 Low | HARDENING | Unused razorpay / express-fileupload / react image packages | NO |

---

## Logging / Auditability

**No `AuditLog` model.**

| Event | Trail |
|---|---|
| Admin login | `Admin.lastLogin` timestamp only — no IP/UA log stream |
| Privilege changes | Staff update exists; no dedicated audit collection |
| Order status | **No statusHistory** |
| Payment status | Order fields + PhonePe payload persist via `paymentVisibilityService` — not an immutable audit log |
| Refunds / returns | `ReturnRequest.statusHistory` / `resolutionHistory` |
| Inventory | No movement ledger |
| Coupon changes | Coupon document only |
| Product price | No `priceHistory` |
| Seller approval | `SellerApprovalLog` |
| Commission **config** | `CommissionConfigAudit` |

Morgan `combined` in production is access logs, not a fraud audit trail.

| ID | Severity | Classification | Finding | Blocker |
|---|---|---|---|---|
| SEC-059 | 🟡 Medium | PRE-PRODUCTION | Missing audit trail for admin login, order/payment status, price, inventory | NO |

---

## Finding index (ASVS / API Top 10 mapping)

| ID | API Top 10 | ASVS theme | Severity | Class |
|---|---|---|---|---|
| SEC-001 | API3 / business logic | V6 business logic | Critical | RELEASE BLOCKER |
| SEC-002 | API1 BFLA / API2 | V4 access | Critical | RELEASE BLOCKER |
| SEC-003 | API1 / API3 | V4 / V8 | Critical | RELEASE BLOCKER |
| SEC-004 | business logic | V6 | High | RELEASE BLOCKER |
| SEC-005 | business logic | V6 | High | RELEASE BLOCKER |
| SEC-006 | business logic | V6 | High | RELEASE BLOCKER |
| SEC-007 | API1 | V4 | High | RELEASE BLOCKER |
| SEC-008–015 | API2 | V2/V3 auth | High–Low | PRE-PROD / HARDENING |
| SEC-016–021 | API1 BOLA/BFLA | V4 | High–Low | PRE-PROD / HARDENING |
| SEC-022–030 | API8 injection | V5 | High–Info | PRE-PROD / HARDENING |
| SEC-031–035 | API3 mass assignment | V4 property | Medium–Info | HARDENING |
| SEC-040–041 | API10 | V9 communications | High–Med | PRE-PROD |
| SEC-047–050 | API8 / files | V12 files | High–Med | PRE-PROD |
| SEC-057 | supply chain | V1 | Medium | PRE-PROD |

---

## Security Strengths

Explicitly confirmed from code:

1. **Shopper BOLA on core commerce objects** — orders, invoices, cancel, returns, wallet, addresses, payment initiate/verify all bind `buyer` / `req.user.id`.
2. **Role-separated JWT middleware** — shopper cannot pass `verifyAdmin`; admin cannot pass `verifyShopper`; seller JWT lacks shopper role.
3. **Public admin registration disabled**; staff created by Super Admin chain.
4. **Production RBAC boot fail-closed** (`PERMISSION_ENFORCEMENT` required); `order_returns` always enforced in production.
5. **Admin `tokenVersion`** revokes sessions after password/permission changes (`loadAdminContext`).
6. **Admin password policy** is stronger than shopper (complexity + bcrypt 12).
7. **Checkout does not trust client `totalAmount` / GST / shipping** for payable total (non-variant prices from DB).
8. **GST and zone shipping engines run server-side** on persist.
9. **PhonePe shopper verify does not accept client `status: success`**; it polls PhonePe.
10. **Wallet is append-only ledger with refund idempotency keys**; no shopper POST to set balance.
11. **Global error handler does not return stacks.**
12. **CORS is origin-listed, not `*`.** Helmet enabled in production.
13. **`.env` gitignored; `.env.example` has names only;** no committed production secrets found.
14. **Product search `q` escapes regex** (`searchUtils.escapeRegex`).
15. **OTP replay protection** (`isUsed`) and 10-minute TTL on the live `otpService` path.
16. **Seller unapproved accounts cannot use `verifySeller`.**
17. **JSON body size cap** 2MB (10MB only on JSON import paths).

---

## Recommended Remediation Order

### Immediate blockers (before any production or payment go-live)

1. Recompute or reject `variantPriceSnapshot` from DB at order create; bind items to server cart.
2. Remove seller (and consider admin) `pending → paid` unless `paymentStatus === success` or method is COD.
3. Authenticate `GET /api/admin/coupons`; strip `usageHistory` from any public DTO.
4. Disable or gate `POST /api/seller/register` and seller money/status routes for AAURIKAA (keep code).
5. Do not launch inventory-dependent SKUs until decrement/reservation exists (SEC-004 — implement in a later dedicated change, not this audit).
6. Move coupon `usedCount` to payment success / COD confirm; restore on cancel.
7. Stop paid-order cancel without a refund path (or block cancel after capture).

### Pre-production fixes

8. Fix shopper login limiter path; add limits for OTP, register, payment initiate.
9. Require `JWT_SECRET` (and PhonePe/R2/Mongo) at boot; stop logging `MAIL_USER`.
10. Compare PhonePe paid amount to `order.totalAmount`; add webhook verification if V2 supports it.
11. Reject unpublished products at cart/checkout.
12. Seller product `/all` + bulk-pricing ownership; KYC/evidence private objects.
13. Tighten `/api/media` (size, MIME, no SVG) and site-settings SVG.
14. Reviews default `pending`; lock public comment `status` query.
15. Coerce auth identifiers to strings; enable mongoose sanitizeFilter.
16. Audit log for admin login, order/payment status, refunds, price, stock.
17. Do not enable `ENABLE_XLSX_IMPORT` until `xlsx` is replaced/upgraded.

### Hardening

18. CSPRNG OTPs, hash-at-rest, attempt lockout, uniform enumeration responses.
19. Shopper/seller `tokenVersion` or shorter access + refresh.
20. Current-password required on profile password change; policy on reset.
21. CSRF strategy if seller cookies remain; otherwise cookie-off for AAURIKAA.
22. Escape remaining `$regex` inputs; Helmet/CSP in all environments that face the internet.
23. Remove or isolate unused dependencies (`razorpay`, `express-fileupload`, react image packages).
24. Order `statusHistory`; inventory movement ledger (with SEC-004).

### Future improvements

25. Guest checkout / email-OTP-as-login if SRS requires it (capability matrix §11).
26. PhonePe refund API **after** refund-destination HOLD is decided.
27. Replacement fulfilment (not a security bypass today).
28. Multi-instance cron locking (TD-008) — duplicate Shiprocket/payment jobs.

---

## Areas requiring runtime verification

Not proven from repository source alone:

- Production `JWT_SECRET` entropy and `PERMISSION_ENFORCEMENT=true`
- Production `CORS_ORIGIN` exact list and whether seller cookies are used
- MongoDB URI scheme (TLS), user roles, network exposure
- R2 bucket public vs private; object listing
- PhonePe PROD vs UAT; whether status payload includes amount fields
- Whether any process still runs `scripts/setup-users.js` against a live DB
- Concurrent `verify` + cron double-write on the same order
- Seller address `req.user.id` 401 vs accidental match
- jsdom/TipTap HTML sanitizer effectiveness on CMS pages
- Actual exploitability of npm advisories (fast-xml-parser, jws, multer) in this request path
- Storefront XSS if comments/reviews/SVG are rendered unsafely (frontend is currently mock)

Existing tests that **exercise** related controls (not re-run as an exploit suite in this audit): `tests/integration/point-l-rbac-regression.test.js`, `tests/controllers/paymentController.test.js`, `tests/utils/couponUsageTracking.test.js`, `tests/integration/point-m-return-refund-regression.test.js`, `tests/middleware/verifyAdmin.test.js`. They do not cover variant-price tampering or seller `pending → paid`.

---

## Gate decision (for the following review)

| Gate | Recommendation |
|---|---|
| Continue Phase 2 feature development | **Conditional YES** — CMS, merchandising, catalogue, frontend wiring of **public read** APIs |
| Implement checkout/payment against this backend as-is | **NO** until SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006, SEC-007 are scheduled and SEC-001/002/003 are fixed |
| Production security sign-off | **NO** |
| Viable AAURIKAA foundation | **Yes, conditionally** — the engine is reusable; the security gate is **not** passed for go-live |

No remediation was implemented. No Git changes were made. Next step: human security review and explicit GO / NO-GO.
