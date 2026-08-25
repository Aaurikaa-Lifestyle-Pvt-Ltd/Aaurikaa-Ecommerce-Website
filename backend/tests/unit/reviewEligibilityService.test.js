const {
  REASON,
  getReviewEligibility,
  getReviewEligibilityForOrder,
  isOrderDelivered,
  productExistsInOrder,
} = require("../../services/reviewEligibilityService");

describe("reviewEligibilityService", () => {
  const deliveredOrder = {
    _id: "507f1f77bcf86cd799439011",
    status: "delivered",
    buyer: "507f1f77bcf86cd799439099",
    items: [{ product: { _id: "507f1f77bcf86cd799439012" } }],
  };

  const pendingOrder = {
    ...deliveredOrder,
    status: "processing",
  };

  describe("getReviewEligibility", () => {
    it("returns ELIGIBLE for delivered order item without review", () => {
      expect(
        getReviewEligibility({
          order: deliveredOrder,
          shopperId: "507f1f77bcf86cd799439099",
          productId: "507f1f77bcf86cd799439012",
          reviewedProductIds: new Set(),
        })
      ).toEqual({
        eligible: true,
        alreadyReviewed: false,
        delivered: true,
        reason: REASON.ELIGIBLE,
      });
    });

    it("returns ORDER_NOT_DELIVERED when order is not delivered", () => {
      expect(
        getReviewEligibility({
          order: pendingOrder,
          shopperId: "507f1f77bcf86cd799439099",
          productId: "507f1f77bcf86cd799439012",
          reviewedProductIds: new Set(),
        }).reason
      ).toBe(REASON.ORDER_NOT_DELIVERED);
    });

    it("returns ALREADY_REVIEWED when review exists", () => {
      expect(
        getReviewEligibility({
          order: deliveredOrder,
          shopperId: "507f1f77bcf86cd799439099",
          productId: "507f1f77bcf86cd799439012",
          reviewedProductIds: new Set(["507f1f77bcf86cd799439012"]),
        }).reason
      ).toBe(REASON.ALREADY_REVIEWED);
    });

    it("returns PRODUCT_NOT_FOUND for missing product in order", () => {
      expect(
        getReviewEligibility({
          order: deliveredOrder,
          shopperId: "507f1f77bcf86cd799439099",
          productId: "507f1f77bcf86cd799439099",
          reviewedProductIds: new Set(),
        }).reason
      ).toBe(REASON.PRODUCT_NOT_FOUND);
    });
  });

  describe("getReviewEligibilityForOrder", () => {
    it("supports mixed eligibility across items", () => {
      const mixedOrder = {
        status: "delivered",
        items: [
          { product: { _id: "p1" } },
          { product: { _id: "p2" } },
        ],
      };

      const aggregate = getReviewEligibilityForOrder({
        order: mixedOrder,
        shopperId: "shopper1",
        reviewedProductIds: new Set(["p1"]),
      });

      expect(aggregate.eligible).toBe(true);
      expect(aggregate.alreadyReviewed).toBe(true);
      expect(aggregate.reason).toBe(REASON.ELIGIBLE);
    });
  });

  describe("helpers", () => {
    it("detects delivered status", () => {
      expect(isOrderDelivered({ status: "delivered" })).toBe(true);
      expect(isOrderDelivered({ status: "shipped" })).toBe(false);
    });

    it("validates product existence in order", () => {
      expect(productExistsInOrder(deliveredOrder, "507f1f77bcf86cd799439012")).toBe(true);
      expect(productExistsInOrder(deliveredOrder, "missing")).toBe(false);
    });
  });
});
