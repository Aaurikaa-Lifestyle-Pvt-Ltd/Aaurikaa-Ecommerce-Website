import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

test("checkout quotes with coupon before delivery address is complete", () => {
  const view = readFileSync(join(root, "components/checkout/checkout-view.tsx"), "utf8");
  assert.match(view, /hasShipDest/);
  assert.match(view, /fetchCheckoutQuote/);
  assert.equal(
    /if \(!values\.shipping\.state\.trim\(\) \|\| !\/\^\\d\{6\}\$\/\.test\(values\.shipping\.pinCode/.test(
      view,
    ),
    false,
  );
});

test("cart page does not offer a non-applying promo field", () => {
  const cart = readFileSync(join(root, "components/cart/cart-view.tsx"), "utf8");
  assert.equal(/id="cart-coupon"|label="Promo code"/.test(cart), false);
  assert.match(cart, /Coupons are entered at checkout/);
});

test("checkout summary does not label pending shipping as complimentary", () => {
  const summary = readFileSync(
    join(root, "components/checkout/checkout-summary.tsx"),
    "utf8",
  );
  assert.match(summary, /shippingPending/);
  assert.match(summary, /Enter delivery address/);
});
