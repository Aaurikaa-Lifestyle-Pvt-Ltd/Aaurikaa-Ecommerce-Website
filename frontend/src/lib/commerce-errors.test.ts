import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "./api/errors.ts";
import {
  FRIENDLY_ORDER_TOTAL_ERROR,
  formatCommerceApiError,
  invalidCouponMessage,
} from "./commerce-errors.ts";

test("formatCommerceApiError prefers ApiError details.message", () => {
  const err = new ApiError("Fallback", 400, "validation", {
    details: { message: "Insufficient stock for this variant" },
  });
  assert.match(formatCommerceApiError(err, "x"), /Insufficient stock/);
});

test("formatCommerceApiError keeps coupon and PhonePe API messages", () => {
  assert.match(
    formatCommerceApiError(
      new ApiError("Invalid coupon code", 400, "validation"),
      "x",
    ),
    /coupon/i,
  );
  assert.match(
    formatCommerceApiError(
      new ApiError("PhonePe is not configured", 503, "server"),
      "x",
    ),
    /PhonePe/i,
  );
});

test("formatCommerceApiError hides technical price validation messages", () => {
  const technical = "Item at index 0 price must be at least ₹0.01";
  const result = formatCommerceApiError(
    new ApiError(technical, 400, "validation", {
      details: { message: technical },
    }),
    "fallback",
  );
  assert.equal(result, FRIENDLY_ORDER_TOTAL_ERROR);
  assert.equal(/item at index|₹0\.01|must be at least/i.test(result), false);
});

test("formatCommerceApiError sanitizes pricing quote failure wording", () => {
  assert.equal(
    formatCommerceApiError(
      new ApiError("Pricing calculation failed for line items", 400, "validation"),
      "fallback",
    ),
    FRIENDLY_ORDER_TOTAL_ERROR,
  );
});

test("formatCommerceApiError hides shipping-slab engine messages", () => {
  const result = formatCommerceApiError(
    new ApiError(
      "One or more products are missing a Shipping Slab.",
      400,
      "validation",
    ),
    "fallback",
  );
  assert.match(result, /couldn't calculate shipping/i);
  assert.equal(/shipping slab/i.test(result), false);
});

test("invalidCouponMessage includes code when present", () => {
  assert.match(invalidCouponMessage("SAVE10"), /SAVE10/);
  assert.match(invalidCouponMessage("  "), /not valid/i);
});
