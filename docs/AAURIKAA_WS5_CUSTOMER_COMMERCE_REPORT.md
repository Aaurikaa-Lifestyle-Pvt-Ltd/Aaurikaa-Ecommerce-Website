# AAURIKAA WS5 — Customer Account + Buy Now + Minimal Guest Checkout

**Workstream:** WS5  
**Date:** 2026-08-19  
**Mode:** Implementation (storefront only). No Git operations.

---

## 1. Status

**PARTIAL**

The shortest reliable path is live on the Storefront:

**Product → Buy Now → existing Shopper identity (login or email OTP) → Address → `POST /api/orders` (COD).**

It is not COMPLETE because the preferred passwordless **mobile OTP login** is not a backend contract. Guests still become a normal Shopper after the **existing** email OTP registration (which requires a password) or password login. Prepaid PhonePe, refunds (SEC-006), Shiprocket production configuration, and live catalogue content were not opened.

---

## 2. Customer Account implemented

| Surface | Status | Backend |
|---|---|---|
| Login | Yes | `POST /api/shopper/login` (`identifier` + `password`) |
| Registration OTP | Yes | `POST /api/shopper/register`, `POST /api/shopper/verify-registration` (email OTP) |
| Logout / session | Yes | Client clears `aaurikaa.shopper.token` / `aaurikaa.shopper.user`. No backend logout. 401 / invalid JWT clears the session. 403 RBAC does not. |
| Profile | Yes | `GET /api/shopper/profile`, `PUT /api/shopper/update-profile` |
| Saved addresses | Yes | `GET/POST /api/addresses/shopper`, `DELETE /api/addresses/shopper/:id` |
| Default address | Yes | `PATCH /api/addresses/shopper/:id/default`, `GET /api/addresses/shopper/default` |
| Order history | Yes | `GET /api/shopper/orders` |
| Order detail / status | Yes | `GET /api/shopper/orders/:id` |
| Wishlist | Yes (authenticated) | `GET/POST /api/shopper/wishlist`, add/remove |
| Cart persistence | Unchanged, still used | Authenticated bag on `GET/POST/PUT/DELETE /api/shopper/cart*` |

Account navigation: `/account`, `/account/profile`, `/account/addresses`, `/account/orders`, `/account/orders/[id]`, `/wishlist`.

---

## 3. Buy Now implemented

PDP adds a **Buy Now** CTA beside Add to Bag.

Flow:

1. Customer selects variant + quantity.
2. Intent is stored in `sessionStorage` (`aaurikaa.checkout.intent.v1`) with `productId`, `variantKey` / options, and `quantity`.
3. Storefront navigates to `/checkout?source=buy-now`.
4. Checkout reads that intent. It does **not** send the customer through `/cart`.
5. Add to Bag is unchanged and still uses the existing cart path.

---

## 4. Guest checkout implemented

Guests can start checkout (including Buy Now) without a prior session.

Checkout then requires a Shopper JWT because `POST /api/orders` is `verifyShopper`.

**Implemented guest path (existing contracts only):**

```text
Buy Now or bag
  → Mobile number (UX entry)
  → Register (email + password + phone) or returning login
  → Email OTP verify
  → Login issues Shopper JWT
  → Address (saved or new)
  → COD Place Order → POST /api/orders
```

After OTP, the UI signs the customer in with the same password used at registration so they receive a normal Shopper session. There is **no** separate guest-order architecture.

---

## 5. Backend APIs reused

| Capability | Path |
|---|---|
| Login | `POST /api/shopper/login` |
| Register / email OTP | `POST /api/shopper/register`, `POST /api/shopper/verify-registration` |
| Profile | `GET /api/shopper/profile`, `PUT /api/shopper/update-profile` |
| Cart | `/api/shopper/cart*` |
| Wishlist | `/api/shopper/wishlist*` |
| Addresses + geo | `/api/addresses/shopper*`, `/api/addresses/countries`, `/states/:id`, `/districts/:id` |
| Create order | `POST /api/orders` |
| Order list/detail | `GET /api/shopper/orders`, `GET /api/shopper/orders/:id` |

`CHECKOUT_INTEGRATION_STATUS` is now `"cod"` for order create. PhonePe paths remain documented and unused.

---

## 6. Backend gaps discovered

Documented. **No new APIs were invented. No backend architecture was changed.**

1. **No passwordless mobile OTP login.** `POST /api/shopper/send-otp` is password-reset (email). `POST /api/shopper/verify-otp` is unused/broken (in-memory store never written). Login identifier is email/username, not phone.
2. **Registration still requires a password** plus email OTP. Identity is not created from mobile-only OTP.
3. **`POST /api/orders` requires Shopper JWT.** True anonymous guest orders do not exist.
4. **Address book requires country/state/district ObjectIds.** Checkout can still place an order with string city/state/PIN. Saving to the address book needs geo seed data on the backend.
5. **PhonePe storefront capture** (`POST /api/payment/initiate` / `verify`) is not activated (production PhonePe / WS4 hold).
6. **Guest bag is not merged** into the Shopper cart on login (pre-existing). Buy Now does not depend on that merge.
7. **Catalogue** still defaults to mock until `NEXT_PUBLIC_CATALOGUE_SOURCE=api` and real AAURIKAA products exist.

---

## 7. Security validation

| Rule | How it is preserved |
|---|---|
| Backend authority for price, GST, shipping, total, payment state | Order payload omits `totalAmount`, line `price`, `variantPriceSnapshot`, `paymentStatus`. Confirmation shows server `totalAmount` / pricing DTO. |
| Client price cannot change payable amount | `buildCreateOrderPayload` accepts `clientTotal` / `clientLinePrice` and drops them. Tests assert they never appear. |
| No `sellerId` / seller selection from Storefront | Payload builder ignores `sellerId`. Tests assert seller keys are absent. Line seller remains `Product.seller` on the backend. |
| WS1A / WS2 | Not modified. No inventory, coupon, payment-state, or seller-architecture edits. |
| SEC-006 | HOLD. No refund UI or processing. |
| Session expiry | 401 / invalid token still clears shopper storage. |

COD create still sets `paymentStatus: pending` on the server. Storefront cannot mark an order paid.

---

## 8. Tests / build results

From `frontend/`:

```text
npm test
npm run build
```

**Tests:** **20/20 passed.**

Covered:

- Login/logout session persistence (`aaurikaa.shopper.token` / `.user`).
- Guest OTP completion represented as a normal Shopper JWT session.
- Expired/invalid auth (401 / invalid-token 403) vs RBAC 403.
- Buy Now preserves variant + quantity and does not use the cart store.
- Order payload uses `product` + `quantity` + `variantKey` / `variantCombination`.
- Client totals and `sellerId` cannot enter the create-order body.
- Existing add-to-cart payload still has no client `price`.
- Seller field stripping on catalogue mapping (unchanged).

**Build:** Next.js 16.3 production build **succeeded**. New routes: `/account/profile`, `/account/addresses`, `/account/orders`, `/account/orders/[id]`, `/wishlist`.

No backend test suite was re-run (no backend source changes).

---

## 9. Files changed

### Storefront — new

- `frontend/src/lib/buy-now.ts`
- `frontend/src/lib/buy-now.test.ts`
- `frontend/src/lib/mappers/order-payload.ts`
- `frontend/src/lib/mappers/order-payload.test.ts`
- `frontend/src/lib/api/orders.ts`
- `frontend/src/lib/api/addresses.ts`
- `frontend/src/lib/api/wishlist.ts`
- `frontend/src/lib/api/shopper-profile.ts`
- `frontend/src/lib/api/session.test.ts`
- `frontend/src/components/account/shopper-auth-panel.tsx`
- `frontend/src/components/account/account-shell.tsx`
- `frontend/src/app/account/layout.tsx`
- `frontend/src/app/account/profile/page.tsx`
- `frontend/src/app/account/addresses/page.tsx`
- `frontend/src/app/account/orders/page.tsx`
- `frontend/src/app/account/orders/[id]/page.tsx`
- `frontend/src/app/wishlist/page.tsx`
- `docs/AAURIKAA_WS5_CUSTOMER_COMMERCE_REPORT.md`

### Storefront — updated

- `frontend/src/app/account/page.tsx`
- `frontend/src/app/checkout/page.tsx`
- `frontend/src/app/order-confirmation/page.tsx`
- `frontend/src/components/checkout/checkout-view.tsx`
- `frontend/src/components/checkout/checkout-summary.tsx`
- `frontend/src/components/checkout/order-confirmation-view.tsx`
- `frontend/src/components/product/product-purchase.tsx`
- `frontend/src/components/cart/cart-view.tsx`
- `frontend/src/components/layout/header.tsx` — unchanged; existing Account / Wishlist links now resolve
- `frontend/src/lib/auth/shopper-provider.tsx`
- `frontend/src/lib/api/checkout-contract.ts`
- `frontend/src/lib/checkout.ts`
- `frontend/src/config/checkout.ts`
- `frontend/package.json` (test glob only)

Backend, Admin, catalogue seed data, WS1A/WS2 security controls, PhonePe, and Shiprocket were not modified.

---

## 10. Remaining limitations

- Guest checkout is **Shopper-after-OTP/login**, not mobile-only passwordless identity.
- Only **Cash on Delivery** is a live payable path. PhonePe remains deferred.
- Checkout summary display amounts are estimates; payable total is the order record.
- Address book save needs backend geo records (country/state/district).
- Wishlist on PDP for signed-out users is local UI only; persistence is the Shopper wishlist API.
- Refunds, replacements, and production logistics configuration remain out of scope.
- Real jewellery catalogue is still a separate workstream (`NEXT_PUBLIC_CATALOGUE_SOURCE=mock` by default).

---

## 11. Git

**No Git operations performed.**
