import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { FULFILMENT_STATUSES, mapOrderStatusLabel, omitPassword } from "./helpers.ts";

test("customer mapper strips password hashes", () => {
  const stripped = omitPassword({
    email: "anya@example.com",
    password: "$2b$10$not-a-secret-hash",
  });
  assert.equal(stripped.email, "anya@example.com");
  assert.equal("password" in stripped, false);
});

test("order status writes do not expose paid as a fulfilment option", () => {
  assert.equal((FULFILMENT_STATUSES as readonly string[]).includes("paid"), false);
  assert.equal(mapOrderStatusLabel("shipped"), "Shipped");
  assert.equal(mapOrderStatusLabel("delivered"), "Completed");
  assert.equal(mapOrderStatusLabel("cancelled"), "Cancel");
});

test("admin order mapper source includes shipment AWB and after-sales, not refund destinations", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "order.ts"), "utf8");
  assert.equal(source.includes("shiprocketShipments"), true);
  assert.equal(source.includes("trackingNumber"), true);
  assert.equal(source.includes("afterSales"), true);
  assert.equal(source.includes("refundDestination"), false);
});
