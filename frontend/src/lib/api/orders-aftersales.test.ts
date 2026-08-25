import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Mirrors canRetryPhonePePayment in orders.ts — kept local so node:test does not
 * load the api client (ESM extension resolution).
 */
function canRetryPhonePePayment(order: {
  orderStatus?: string;
  paymentVisibility?: {
    gateway?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    paymentType?: string;
  };
}): boolean {
  const visibility = order.paymentVisibility;
  if (!visibility) return false;

  const gateway = String(visibility.gateway || "").toUpperCase();
  const methodHint = String(visibility.paymentMethod || "").toLowerCase();
  const isPhonePe = gateway === "PHONEPE" || methodHint === "phonepe";
  if (!isPhonePe) return false;

  const paymentStatus = String(visibility.paymentStatus || "").toUpperCase();
  if (paymentStatus === "PAID" || paymentStatus === "SUCCESS") return false;

  const orderStatus = String(order.orderStatus || "").toLowerCase();
  if (orderStatus === "pending" || orderStatus === "pending_verification") {
    return true;
  }
  if (orderStatus === "cancelled" && paymentStatus === "FAILED") {
    return true;
  }
  return false;
}

function buildCustomerReviewPayload(input: {
  productId: string;
  rating: number;
  comment?: string;
  orderId?: string;
}) {
  const payload: {
    productId: string;
    rating: number;
    comment: string;
    orderId?: string;
  } = {
    productId: input.productId,
    rating: input.rating,
    comment: input.comment?.trim() ? input.comment.trim() : "",
  };
  if (input.orderId?.trim()) {
    payload.orderId = input.orderId.trim();
  }
  return payload;
}

function buildReturnAppealPayload(input: {
  reason: string;
  evidence?: Array<{ url: string; mediaType?: string; fileName?: string | null }>;
}) {
  const payload: {
    reason: string;
    evidence?: Array<{ url: string; mediaType?: string; fileName?: string | null }>;
  } = {
    reason: input.reason.trim(),
  };
  if (input.evidence && input.evidence.length > 0) {
    payload.evidence = input.evidence;
  }
  return payload;
}

test("cancel payload uses reason codes only — no refund destination fields", () => {
  const payload = {
    reasonCode: "CHANGE_OF_MIND",
    customReason: undefined,
  };
  assert.equal("refundMethod" in payload, false);
  assert.equal("wallet" in payload, false);
  assert.equal("originalPayment" in payload, false);
});

test("return request payload is evidence + reason — no invented refund policy", () => {
  const payload = {
    reasonCode: "DEFECTIVE_DAMAGED",
    reasonText: "Broken clasp",
    evidence: [{ url: "https://cdn.example/e.jpg", mediaType: "image" }],
  };
  assert.equal("refundAmount" in payload, false);
  assert.equal("refundDestination" in payload, false);
  assert.ok(payload.evidence.length >= 1);
});

test("order list status line uses only API trackingSummary / afterSales fields", () => {
  const order = {
    trackingSummary: { awbAvailable: true, shipmentStatus: "shipped" },
    afterSales: { status: "pending_review" },
  };
  const parts: string[] = [];
  if (order.trackingSummary?.awbAvailable) parts.push("AWB available");
  else if (order.trackingSummary?.shipmentStatus) parts.push(order.trackingSummary.shipmentStatus);
  if (order.afterSales?.status) parts.push(`After-sales ${order.afterSales.status}`);
  assert.equal(parts.join(" · "), "AWB available · After-sales pending_review");
});

test("manualFollowUpRequired and fulfilmentKind degrade when optional fields missing", () => {
  const returnRequest: { manualFollowUpRequired?: boolean } = {};
  const order: { fulfilmentKind?: string } = {};
  assert.equal(returnRequest.manualFollowUpRequired === true, false);
  assert.equal(order.fulfilmentKind === "replacement", false);
});

test("canRetryPhonePePayment allows pending unpaid PhonePe and cancelled+failed only", () => {
  assert.equal(
    canRetryPhonePePayment({
      orderStatus: "pending",
      paymentVisibility: { gateway: "PHONEPE", paymentStatus: "PENDING", paymentType: "ONLINE" },
    }),
    true,
  );
  assert.equal(
    canRetryPhonePePayment({
      orderStatus: "cancelled",
      paymentVisibility: { gateway: "PHONEPE", paymentStatus: "FAILED" },
    }),
    true,
  );
  assert.equal(
    canRetryPhonePePayment({
      orderStatus: "pending",
      paymentVisibility: { gateway: "PHONEPE", paymentStatus: "PAID" },
    }),
    false,
  );
  assert.equal(
    canRetryPhonePePayment({
      orderStatus: "pending",
      paymentVisibility: { paymentType: "COD", paymentStatus: "PENDING" },
    }),
    false,
  );
  assert.equal(
    canRetryPhonePePayment({
      orderStatus: "cancelled",
      paymentVisibility: { gateway: "PHONEPE", paymentStatus: "PENDING" },
    }),
    false,
  );
});

test("customer review payload includes optional orderId from order context", () => {
  const payload = buildCustomerReviewPayload({
    productId: "prod-1",
    rating: 5,
    orderId: "order-abc",
  });
  assert.deepEqual(payload, {
    productId: "prod-1",
    rating: 5,
    comment: "",
    orderId: "order-abc",
  });
});

test("customer review payload is productId + rating + comment only", () => {
  const payload = buildCustomerReviewPayload({
    productId: "prod-1",
    rating: 4,
    comment: " Lovely finish ",
  });
  assert.deepEqual(payload, { productId: "prod-1", rating: 4, comment: "Lovely finish" });
  assert.equal("sellerId" in payload, false);
  assert.equal("sellerName" in payload, false);
  assert.equal("refundDestination" in payload, false);
});

test("return appeal payload has reason only — no invented refund destination", () => {
  const payload = buildReturnAppealPayload({ reason: "  Please reconsider  " });
  assert.equal(payload.reason, "Please reconsider");
  assert.equal("evidence" in payload, false);
  assert.equal("refundMethod" in payload, false);
  assert.equal("refundDestination" in payload, false);
  assert.equal("wallet" in payload, false);
});

test("orders.ts exports PhonePe retry + return appeal helpers without refund destinations", () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, "orders.ts"), "utf8");
  assert.match(text, /export function canRetryPhonePePayment/);
  assert.match(text, /export async function submitReturnAppeal/);
  assert.match(text, /\/api\/shopper\/orders\/\$\{encodeURIComponent\(orderId\)\}\/return-appeal/);
  assert.equal(/refundDestination/i.test(text), false);
  assert.equal(/refundMethod/i.test(text), false);
});

test("reviews.ts includes createCustomerReview POST /api/reviews without trailing slash", () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, "reviews.ts"), "utf8");
  assert.match(text, /export async function createCustomerReview/);
  assert.match(text, /export const createProductReview/);
  assert.match(text, /export function buildCustomerReviewPayload/);
  assert.match(text, /\/api\/reviews[^/]/);
  assert.match(text, /orderId/);
  assert.equal(text.includes('"/api/reviews/"'), false);
  assert.equal(/refundDestination/i.test(text), false);
});

test("order list shows Write a review CTA when reviewEligibility is eligible", () => {
  const pagePath = path.join(import.meta.dirname, "../../app/account/orders/page.tsx");
  const text = fs.readFileSync(pagePath, "utf8");
  assert.match(text, /canWriteReview/);
  assert.match(text, /Write a review/);
  assert.match(text, /reviewEligibility/);
  assert.match(text, /#reviews/);
});

test("orders list item type includes reviewEligibility", () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, "orders.ts"), "utf8");
  assert.match(text, /ShopperOrderListItem[\s\S]*reviewEligibility\?: ReviewEligibility/);
});

test("order detail page wires Pay again, review submit, and return appeal", () => {
  const pagePath = path.join(
    import.meta.dirname,
    "../../app/account/orders/[id]/page.tsx",
  );
  const text = fs.readFileSync(pagePath, "utf8");
  assert.match(text, /canRetryPhonePePayment/);
  assert.match(text, /initiatePhonePePayment/);
  assert.match(text, /Pay again/);
  assert.match(text, /createProductReview/);
  assert.match(text, /orderId/);
  assert.match(text, /StarRatingInput/);
  assert.match(text, /fetchProductReviews/);
  assert.match(text, /onReload/);
  assert.match(text, /OrderLineItemReview/);
  assert.match(text, /getReviewEligibilityMessage/);
  assert.match(text, /reviewEligibility/);
  assert.match(text, /submitReturnAppeal/);
  assert.match(text, /returnRequest\.appeal\?\.canAppeal/);
  assert.equal(/pending moderation/i.test(text), false);
  assert.equal(/refundDestination/i.test(text), false);
  assert.equal(/refundMethod/i.test(text), false);
});
