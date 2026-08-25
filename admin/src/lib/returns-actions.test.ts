import assert from "node:assert/strict";
import test from "node:test";
import {
  resolutionReasonLabel,
  resolveReturnActionVisibility,
} from "./returns-actions.ts";

test("SELLER_GOODWILL is labeled Store goodwill; code unchanged for submit", () => {
  assert.equal(resolutionReasonLabel("SELLER_GOODWILL"), "Store goodwill");
  assert.equal(resolutionReasonLabel("WRONG_ITEM"), "WRONG_ITEM");
});

test("missing actions keeps all buttons visible", () => {
  const visibility = resolveReturnActionVisibility({ status: "closed" });
  assert.deepEqual(visibility, {
    showAcceptReject: true,
    showConfirmReceipt: true,
    showRetryPickup: true,
    showResolution: true,
  });
});

test("terminal actions hide all mutating controls", () => {
  const visibility = resolveReturnActionVisibility({
    status: "closed",
    actions: { isTerminal: true, canReviewReturn: true },
  });
  assert.deepEqual(visibility, {
    showAcceptReject: false,
    showConfirmReceipt: false,
    showRetryPickup: false,
    showResolution: false,
  });
});

test("after-sales pending_review allows accept without canReviewReturn", () => {
  const visibility = resolveReturnActionVisibility({
    status: "pending_review",
    caseFlow: "after_sales",
    actions: { isSellerOwned: true, canReviewReturn: false, isTerminal: false },
  });
  assert.equal(visibility.showAcceptReject, true);
  assert.equal(visibility.showConfirmReceipt, false);
});

test("canConfirmReceipt and reverse canRetry are respected when present", () => {
  const visibility = resolveReturnActionVisibility({
    status: "awaiting_pickup",
    actions: {
      isTerminal: false,
      canConfirmReceipt: true,
      canRetryPickup: false,
      canSelectResolution: false,
    },
    reverseLogistics: { canRetry: true },
  });
  assert.equal(visibility.showConfirmReceipt, true);
  assert.equal(visibility.showRetryPickup, false);
  assert.equal(visibility.showResolution, false);
});

test("canAdminOverrideResolution does not drive normal resolution visibility", () => {
  const visibility = resolveReturnActionVisibility({
    status: "awaiting_pickup",
    caseFlow: "after_sales",
    actions: {
      isTerminal: false,
      isSellerOwned: true,
      canSelectResolution: false,
      canAdminOverrideResolution: true,
      canAccept: false,
    },
  });
  assert.equal(visibility.showResolution, false);
});

test("canSelectResolution true shows resolution at awaiting_inspection", () => {
  const visibility = resolveReturnActionVisibility({
    status: "awaiting_inspection",
    actions: {
      isTerminal: false,
      canSelectResolution: true,
      canAdminOverrideResolution: false,
    },
  });
  assert.equal(visibility.showResolution, true);
});
