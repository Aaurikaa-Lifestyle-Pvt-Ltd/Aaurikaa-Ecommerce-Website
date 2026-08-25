# AAURIKAA WS4 Integration Foundation Report

**Workstream:** WS4 — Storefront & Admin Integration Foundation  
**Date:** 2026-08-19  
**Mode:** Implementation (no Git operations)

---

## 1. Status

**PARTIAL**

The integration/framework layer is in place for both applications: environment-based API clients, Admin JWT auth, shopper JWT auth, adapters, and Admin read/write against stable backend contracts.

It is not COMPLETE because:

- Storefront catalogue reads default to demo data until real AAURIKAA category/product data arrives (`NEXT_PUBLIC_CATALOGUE_SOURCE=mock`).
- Checkout / PhonePe / refunds remain deferred (SEC-006 HOLD).
- Jewellery merchandising CMS (hero, collections, occasions, looks, UGC, banners) remains local demo content on purpose.
- Two backend list-only contracts have no dedicated detail GET (orders, shoppers). Frontends list-then-filter rather than inventing endpoints.

WS1A and WS2 commerce/security logic were not reopened.

---

## 2. Storefront Integration

**Framework:** Next.js 16.3 / React 19.2 (`frontend/`).

**Now connected (when `NEXT_PUBLIC_API_BASE_URL` is set):**

| Surface | Backend | Notes |
|---|---|---|
| Customer login / register / OTP verify / logout / profile | `POST /api/shopper/login`, `POST /api/shopper/register`, `POST /api/shopper/verify-registration`, `GET /api/shopper/profile` | `/account` is live. OTP/password policy unchanged. |
| Authenticated cart | `GET/DELETE /api/shopper/cart`, `POST /api/shopper/cart/add`, `PUT /api/shopper/cart/update-quantity`, `POST /api/shopper/cart/remove` | Used only when a shopper session exists. Guest cart stays in `localStorage`. |
| Product / category / search reads | `GET /api/products`, `GET /api/products/slug/:slug`, `GET /api/products/related`, `GET /api/taxonomy/products`, `GET /api/categories`, `GET /api/taxonomy/resolve` | Active only when `NEXT_PUBLIC_CATALOGUE_SOURCE=api`. Failures are shown; no mock fallback. |
| Site settings client | `GET /api/settings/site` | Client exists. Storefront chrome still uses existing `siteConfig` so demo visual direction is preserved. |

**Not activated in this workstream:** PhonePe, COD capture, refunds, GST/shipping client math, jewellery taxonomy.

---

## 3. Admin Integration

**Framework:** Next.js 16.3 / React 19.2 (`admin/`). Dev/start port **3001**.

**Now connected (requires `NEXT_PUBLIC_API_BASE_URL` + Admin JWT):**

| Screen | Backend | Writes |
|---|---|---|
| Login | `POST /api/admin/login`, `GET /api/admin/me` | Session only |
| Dashboard | `GET /api/dashboard/stats`, orders + products lists | Read |
| Products | `GET/POST /api/admin/products`, `GET/PUT /api/admin/products/:id` | Create draft / update. **No `sellerId`.** |
| Categories | `GET/POST /api/categories`, `PUT /api/categories/:id` | Name create/update |
| Orders | `GET /api/admin/orders`, `PUT /api/admin/orders/:id/status` | Fulfilment statuses only (`pending/processing/shipped/delivered/cancelled`). Not `paid`. |
| Customers | `GET /api/admin/shoppers`, `PUT /api/admin/shoppers/:id` | Profile fields. Password hashes stripped in the mapper. |
| Coupons | `GET /api/admin/coupons` (+ existing manage routes where the UI already supports them) | Backend RBAC unchanged |
| Settings | `GET/PUT /api/settings/site`, `GET/PUT /api/settings/contact-info` | Title, tagline, email, phone |
| SEO | `GET/PUT /api/settings/seo` | Title, description, keywords |
| Weight classes (product form) | `GET /api/shipping/weight-classes` | Required by backend product writes |

**Intentionally still demo:** CMS hero (`/admin/cms`), banners (`/admin/banners`).

---

## 4. Authentication

### Admin

Hardcoded demo credentials (`admin@imagineairy.demo` / `demo1234`) are removed from source, login copy, and README.

Flow: login form → `POST /api/admin/login` with `{ emailOrUsername, password }` → Envelope A `{ data: { token, admin } }` → `localStorage` keys `aaurikaa.admin.token` / `aaurikaa.admin.user` → `Authorization: Bearer` on subsequent requests.

Logout clears the session and redirects to `/admin/login`. 401 / invalid JWT clears session and redirects. 403 RBAC is shown as a permission error and does **not** treat the session as expired.

### Customer (storefront)

`/account` supports login (`identifier` + `password`), registration, and OTP verification using the existing backend shopper contract. Envelope B returns a top-level `token`. Session keys: `aaurikaa.shopper.token` / `aaurikaa.shopper.user`.

OTP/password policy was not redesigned. If `NEXT_PUBLIC_API_BASE_URL` is unset, the page explains that the API is not configured instead of using demo credentials.

---

## 5. API Client

Both apps use the same shape:

- Base URL: `NEXT_PUBLIC_API_BASE_URL` only. No hardcoded production URL.
- `src/lib/api/config.ts` — configuration
- `src/lib/api/client.ts` — `fetch` wrapper
- `src/lib/api/errors.ts` — 400 / 401 / 403 / 404 / 409 / 429 / 5xx / network
- `src/lib/api/token-store.ts` — session token persistence (not JWT secrets)

Admin requests default to authenticated. Storefront public catalogue calls use `auth: false`. No extra frontend headers or flags are added to bypass backend guards.

Storefront catalogue switch: `NEXT_PUBLIC_CATALOGUE_SOURCE=mock|api` (default `mock`).

Backend CORS (integration contract only): local default and `.env.example` include `http://localhost:3000` and `http://localhost:3001`. Commerce logic was not changed.

---

## 6. Mock Data

| Area | Status | Reason |
|---|---|---|
| Authentication | **Replaced** | Backend JWT contracts are known. Demo Admin login removed. |
| Products | **Keep temporarily** (storefront default) | Real AAURIKAA catalogue is expected separately. Set `NEXT_PUBLIC_CATALOGUE_SOURCE=api` to use backend products. Admin products are live. |
| Categories | **Keep temporarily** (storefront default) | Same catalogue boundary. Admin categories are live. |
| Cart | **Partial replace** | Logged-in shopper cart uses backend APIs. Guest cart remains `localStorage` (`imagineairy.cart.v1`). Display unit price prefers backend `variantPriceSnapshot`. |
| Orders | **Admin replaced / Storefront not checkout-integrated** | Admin list + fulfilment status. Storefront checkout remains local demo (Phase L). |
| CMS | **Keep temporarily** | Hero, editorial collections, occasions, looks, UGC, Admin CMS/banners are merchandising content pending real catalogue/CMS authoring. |

`frontend/src/lib/data.ts` and `frontend/src/data/*` were **not** deleted. Catalogue merchandising helpers still return demo content. Product/category/search helpers call the backend only when the catalogue source is `api`, and they do not fall back to fabricated products on failure.

---

## 7. API Contract Mapping

| Frontend field | API | Backend field | Frontend model |
|---|---|---|---|
| Product `id` | `_id` | Mongo ObjectId | `Product.id` / `AdminProduct.id` |
| Product `slug` | `slug` | `Product.slug` | route param |
| Price | `salePrice` if discounted else `regularPrice` | `regularPrice`, `salePrice` | `Money.amount` (INR) |
| Compare-at | `regularPrice` when sale is lower | same | `compareAtPrice` |
| Variant `id` | `variantKey` (`color:red\|size:large`) | variant axes + `variantPricing` / `variantStock` | `variantId` |
| Cart add | `{ productId, quantity, variantCombination }` | shopper cart | never sends client `price` |
| Cart line price | `variantPriceSnapshot` | server snapshot | display only; not payable authority |
| Category `id` / `slug` | `_id`, `slug` | Category | listing + Admin select |
| Customer `id` | shopper `_id` | Shopper | Admin customer |
| Order `id` | `_id` | Order | Admin order |
| Order number | `invoiceNumber` | Order | Admin `number` |
| Order total | `totalAmount` | Order | Admin `amount` |
| Pagination | `page`, `limit` | list endpoints | Admin lists use page 1 / limit 50 |
| Images | `mainImage` / `images[]` / relative upload keys | files under `/uploads` | `resolveMediaUrl` prefixes API base |
| Admin login | `{ emailOrUsername, password }` | Admin | `{ data: { token, admin } }` |
| Shopper login | `{ identifier, password }` | Shopper | top-level `token` + `shopper` |
| Product write | FormData (`name`, `regularPrice`, `salePrice`, `stock`, `category`, `weightClass`, `status`, …) | Admin product | **never `sellerId` / `seller` / `sellerShop` / `shopName`** |

### Unresolved mismatches (documented, not silently “fixed” on the backend)

1. **No `GET /api/admin/orders/:id`.** Detail page loads the list and filters by id.
2. **No `GET /api/admin/shoppers/:id`.** Same list-then-filter approach.
3. **`GET /api/admin/shoppers` still returns password hashes.** Frontend `omitPassword` strips them before mapping. This is a **backend defect**; WS4 does not change shopper persistence.
4. **Product update requires `weightClass`.** Admin stores `weightClassId` on the mapped product and resends it.
5. **Admin customer `ordersCount` / `totalSpent` / `city`** are not on the shopper list payload; they remain empty rather than invented.
6. **Storefront `variantId` ≠ a Mongo variant document id.** It is the backend `variantKey`.
7. **Envelope A vs Envelope B** login responses differ by actor; adapters handle both. No new auth contract was invented.

---

## 8. Security

Confirmed:

- No JWT secrets, PhonePe credentials, Shiprocket credentials, MongoDB URIs, or R2 private keys in frontend/admin source or `.env.example`.
- No privileged Admin passwords in source. Demo login removed.
- Admin and storefront send `Authorization: Bearer` only; no bypass headers.
- Admin product create/update UI does not expose Seller selection. Write adapter refuses ownership keys.
- WS1A: Admin product writes omit seller fields; backend remains the owner resolver.
- WS2: frontend does not treat cart snapshots as payable authority; Admin order status UI does not include `paid`; checkout/payment/refunds were not activated.
- 401/403/validation errors surface; production API failures do not fall back to fabricated catalogue data.

**Pre-existing backend concern (not introduced by WS4):** shopper list payloads include password hashes. Frontend strips them. Do not weaken WS1A/WS2 to hide this.

---

## 9. Tests

Infrastructure: Node.js `node --test` with `--experimental-strip-types` (no new packages).

| Suite | Result |
|---|---|
| Storefront `npm test` | **13/13 passed** |
| Admin `npm test` | **7/7 passed** |
| **Total** | **20/20 passed** |

Storefront coverage:

- HTTP status → error kind (400/401/403/404/409/429/5xx)
- Invalid JWT vs RBAC 403
- No secrets in `.env.example`; session keys are not JWT secrets
- Price mapping (`regularPrice` / `salePrice`)
- Variant key normalization and cart `variantCombination` payload (no client price)
- Seller fields stripped from mapped products
- Cart line id parsing

Admin coverage:

- Auth error kinds; invalid JWT vs RBAC 403
- Source scan: no secrets / no demo passwords
- Product create UI has no Seller selection
- Product write FormData never includes seller fields
- Customer mapper strips `password`
- Fulfilment statuses do not include `paid`

These are contract/unit tests. They do not start Mongo or the Express server. Live login against a running backend is an operator check: valid Admin credentials succeed; invalid credentials return the backend error through the client.

### Builds

| App | Command | Result |
|---|---|---|
| Storefront | `npm run build` | **Succeeded** (Next.js 16.3) |
| Admin | `npm run build` | **Succeeded** (Next.js 16.3, port 3001) |

### Lint

| App | Command | Result |
|---|---|---|
| Admin | `npx eslint src` | **0 problems** |
| Storefront | `npx eslint src` | **1 error, 5 warnings — all pre-existing** (`header.tsx` `setMounted` in effect; unused `PLACEHOLDER` in `src/data/*`) |
| Both | `npm run lint` (`eslint` with no path) | **Pre-existing hang** — not used |

No newly introduced lint failures.

---

## 10. Known Limitations

- **Catalogue data pending.** Storefront PLP/PDP/search stay on demo jewellery content unless `NEXT_PUBLIC_CATALOGUE_SOURCE=api`. Backend catalogue may be empty or ANBAZAR-shaped until AAURIKAA products are loaded.
- **Jewellery domain pending.** No taxonomy, attributes, collections, occasions, Shop the Look, or UGC contracts were invented.
- **Final checkout / payment integration pending.** `frontend/src/lib/api/checkout-contract.ts` records deferred paths only. Demo checkout remains local.
- **Refund policy HOLD (SEC-006).** Not implemented.
- **Guest cart is local.** Backend cart requires a shopper JWT.
- **Public site title/tagline** is not bound to storefront chrome (preserves demo visual direction).
- **Order/customer Admin detail** depends on list endpoints.
- **Remote images** allow `localhost` only in `next.config.ts`. Production media hosts must be added when catalogue media is real.
- Backend must include Admin origin in `CORS_ORIGIN` (3001 in local example).

---

## 11. Files Changed

### Storefront

- `frontend/.env.example`
- `frontend/package.json`
- `frontend/src/app/layout.tsx`
- `frontend/src/app/account/page.tsx`
- `frontend/src/app/error.tsx`
- `frontend/src/app/categories/[slug]/page.tsx`
- `frontend/src/app/products/[slug]/page.tsx`
- `frontend/src/components/cart/cart-provider.tsx`
- `frontend/src/lib/data.ts`
- `frontend/src/lib/cart.ts`
- `frontend/src/lib/cart.test.ts`
- `frontend/src/lib/auth/shopper-provider.tsx`
- `frontend/src/lib/api/config.ts`
- `frontend/src/lib/api/client.ts`
- `frontend/src/lib/api/errors.ts`
- `frontend/src/lib/api/errors.test.ts`
- `frontend/src/lib/api/token-store.ts`
- `frontend/src/lib/api/shopper-auth.ts`
- `frontend/src/lib/api/products.ts`
- `frontend/src/lib/api/categories.ts`
- `frontend/src/lib/api/cart.ts`
- `frontend/src/lib/api/site.ts`
- `frontend/src/lib/api/checkout-contract.ts`
- `frontend/src/lib/api/security.test.ts`
- `frontend/src/lib/mappers/helpers.ts`
- `frontend/src/lib/mappers/media.ts`
- `frontend/src/lib/mappers/product.ts`
- `frontend/src/lib/mappers/product.test.ts`
- `frontend/src/lib/mappers/category.ts`
- `frontend/src/lib/mappers/cart.ts`
- `frontend/src/lib/mappers/cart.test.ts`

### Admin

- `admin/.env.example`
- `admin/package.json`
- `admin/README.md`
- `admin/src/lib/auth.tsx`
- `admin/src/lib/use-admin-resource.ts`
- `admin/src/types/admin.ts`
- `admin/src/components/ui.tsx`
- `admin/src/components/admin-providers.tsx`
- `admin/src/components/admin-shell.tsx`
- `admin/src/app/admin/login/page.tsx`
- `admin/src/app/admin/dashboard-view.tsx`
- `admin/src/app/admin/products/page.tsx`
- `admin/src/app/admin/products/[id]/page.tsx`
- `admin/src/app/admin/categories/page.tsx`
- `admin/src/app/admin/orders/page.tsx`
- `admin/src/app/admin/orders/[id]/page.tsx`
- `admin/src/app/admin/customers/page.tsx`
- `admin/src/app/admin/customers/[id]/page.tsx`
- `admin/src/app/admin/coupons/page.tsx`
- `admin/src/app/admin/settings/page.tsx`
- `admin/src/app/admin/seo/page.tsx`
- `admin/src/app/admin/cms/page.tsx`
- `admin/src/app/admin/banners/page.tsx`
- `admin/src/lib/api/config.ts`
- `admin/src/lib/api/client.ts`
- `admin/src/lib/api/errors.ts`
- `admin/src/lib/api/errors.test.ts`
- `admin/src/lib/api/token-store.ts`
- `admin/src/lib/api/admin-auth.ts`
- `admin/src/lib/api/products.ts`
- `admin/src/lib/api/categories.ts`
- `admin/src/lib/api/orders.ts`
- `admin/src/lib/api/customers.ts`
- `admin/src/lib/api/coupons.ts`
- `admin/src/lib/api/dashboard.ts`
- `admin/src/lib/api/settings.ts`
- `admin/src/lib/api/shipping.ts`
- `admin/src/lib/api/security.test.ts`
- `admin/src/lib/mappers/helpers.ts`
- `admin/src/lib/mappers/media.ts`
- `admin/src/lib/mappers/product.ts`
- `admin/src/lib/mappers/product-write.ts`
- `admin/src/lib/mappers/product-write.test.ts`
- `admin/src/lib/mappers/category.ts`
- `admin/src/lib/mappers/order.ts`
- `admin/src/lib/mappers/customer.ts`
- `admin/src/lib/mappers/coupon.ts`
- `admin/src/lib/mappers/security.test.ts`

### Backend (CORS / env contract only)

- `backend/.env.example`
- `backend/server.js` (local CORS default includes Admin `:3001`)

### Documentation

- `docs/AAURIKAA_WS4_INTEGRATION_FOUNDATION_REPORT.md` (this file)

Previous audit documents were not modified.

---

## 12. Git

No Git operations were performed.
