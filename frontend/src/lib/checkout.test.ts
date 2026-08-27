import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { paymentOptions } from "../config/checkout.ts";
import {
  emptyCheckoutForm,
  placeOrderCtaLabel,
  validateCheckoutForm,
} from "./checkout.ts";

test("checkout config exposes PhonePe only - no delivery fee table", () => {
  assert.deepEqual(
    paymentOptions.map((option) => option.id),
    ["phonepe"],
  );
  for (const option of paymentOptions) {
    assert.equal("fee" in option, false);
  }
});

test("checkout form has no client shipping method or demo card fields", () => {
  assert.equal("deliveryMethod" in emptyCheckoutForm, false);
  assert.equal("upiId" in emptyCheckoutForm, false);
  assert.equal(emptyCheckoutForm.paymentMethod, "phonepe");
});

test("checkout place-order confidence links use registry policy paths", () => {
  const text = fs.readFileSync(
    path.join(import.meta.dirname, "../components/checkout/checkout-view.tsx"),
    "utf8",
  );
  assert.match(text, /href="\/terms-condition"/);
  assert.match(text, /href="\/privacy-policy"/);
  assert.match(text, /href="\/returns-refund-policy"/);
  assert.equal(/become-seller/i.test(text), false);
  assert.equal(/State ID|Country ID|MongoDB/i.test(text), false);
});

test("checkout-view wires district cascading without city autofill", () => {
  const text = fs.readFileSync(
    path.join(import.meta.dirname, "../components/checkout/checkout-view.tsx"),
    "utf8",
  );
  assert.match(text, /fetchDistricts/);
  assert.match(text, /id="shipping-district"/);
  assert.match(text, /selectDistrict/);
  assert.match(text, /id="shipping-address-line1"/);
  assert.match(text, /id="shipping-address-line2"/);
  assert.match(text, /id="shipping-landmark"/);
  assert.match(text, /Save this address to my account/);
  assert.match(text, /createShopperAddress/);
  assert.match(text, /address1:\s*values\.shipping\.addressLine1/);
  assert.match(text, /address2/);
  assert.equal(/districtId:\s*values\.shipping\.districtId/.test(text), false);
  assert.equal(/city:\s*option\?\.name/.test(text), false);
});

test("placeOrderCtaLabel uses server quote.total when available", () => {
  assert.equal(placeOrderCtaLabel("cod", undefined), "Place Order");
  assert.equal(placeOrderCtaLabel("phonepe", null), "Pay with PhonePe");
  assert.match(placeOrderCtaLabel("cod", 4190), /^Place Order - /);
  assert.match(placeOrderCtaLabel("phonepe", 4190), /^Pay with PhonePe - /);
  assert.match(placeOrderCtaLabel("cod", 4190), /4,190/);
});

test("validateCheckoutForm requires pin, phone, state, line1, and district selection", () => {
  const errors = validateCheckoutForm(emptyCheckoutForm);
  assert.ok(errors["customer.fullName"]);
  assert.ok(errors["shipping.addressLine1"]);
  assert.ok(errors["shipping.pinCode"]);
  assert.ok(errors["shipping.phone"]);
  assert.ok(errors["shipping.state"]);
  assert.ok(errors["shipping.district"]);
});

test("validateCheckoutForm can skip district when options.requireDistrict is false", () => {
  const errors = validateCheckoutForm(
    {
      ...emptyCheckoutForm,
      customer: {
        fullName: "Asha",
        email: "asha@example.com",
        phone: "9876543210",
      },
      shipping: {
        fullName: "Asha",
        addressLine1: "12 MG Road",
        addressLine2: "Apt 4",
        landmark: "Near park",
        city: "Pune",
        state: "Maharashtra",
        stateId: "state-1",
        countryName: "India",
        countryId: "country-1",
        pinCode: "411001",
        phone: "9876543210",
      },
    },
    { requireDistrict: false },
  );
  assert.equal(errors["shipping.district"], undefined);
  assert.equal(Object.keys(errors).length, 0);
});

test("validateCheckoutForm accepts state and district dropdown selection", () => {
  const errors = validateCheckoutForm({
    ...emptyCheckoutForm,
    customer: {
      fullName: "Asha",
      email: "asha@example.com",
      phone: "9876543210",
    },
    shipping: {
      fullName: "Asha",
      addressLine1: "12 MG Road",
      city: "Pune",
      state: "Maharashtra",
      stateId: "state-1",
      districtId: "district-1",
      countryName: "India",
      countryId: "country-1",
      pinCode: "411001",
      phone: "9876543210",
    },
  });
  assert.equal(Object.keys(errors).length, 0);
});

test("emptyCheckoutForm includes blank address lines, landmark, and districtId", () => {
  assert.equal(emptyCheckoutForm.shipping.addressLine1, "");
  assert.equal(emptyCheckoutForm.shipping.addressLine2, "");
  assert.equal(emptyCheckoutForm.shipping.landmark, "");
  assert.equal(emptyCheckoutForm.shipping.districtId, "");
});
