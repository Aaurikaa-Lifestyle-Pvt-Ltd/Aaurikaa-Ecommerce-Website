import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBuyAgainResult,
  getBuyAgainFailureMessage,
  getBuyAgainToastTone,
} from "./buy-again-messages.ts";

test("maps known buy-again failure reasons", () => {
  assert.equal(getBuyAgainFailureMessage("OUT_OF_STOCK"), "Item is out of stock");
  assert.equal(getBuyAgainFailureMessage("SELLER_UNAVAILABLE"), "Item unavailable");
  assert.equal(getBuyAgainFailureMessage("UNKNOWN"), "Item could not be added");
});

test("formats full success, partial, and empty buy-again results", () => {
  assert.match(
    formatBuyAgainResult({ addedItems: [{}, {}], failedItems: [] }),
    /2 items added/,
  );
  assert.match(
    formatBuyAgainResult({
      addedItems: [{}],
      failedItems: [{ reason: "OUT_OF_STOCK" }],
    }),
    /1 item could not be added/,
  );
  assert.equal(
    formatBuyAgainResult({ addedItems: [], failedItems: [] }),
    "No items could be added to your cart.",
  );
});

test("buy-again toast tone reflects partial failures", () => {
  assert.equal(
    getBuyAgainToastTone({ addedItems: [{}], failedItems: [] }),
    "success",
  );
  assert.equal(
    getBuyAgainToastTone({ addedItems: [{}], failedItems: [{}] }),
    "info",
  );
  assert.equal(
    getBuyAgainToastTone({ addedItems: [], failedItems: [{}] }),
    "error",
  );
});
