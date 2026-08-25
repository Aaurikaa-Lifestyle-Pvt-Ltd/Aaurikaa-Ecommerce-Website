const {
  shopperOrderListDTO,
  parsePaginationQuery,
  resolveCancelEligibility,
} = require("../../services/shopperOrderListService");

describe("shopperOrderListService", () => {
  describe("parsePaginationQuery", () => {
    it("applies defaults and caps limit", () => {
      expect(parsePaginationQuery({})).toEqual({ page: 1, limit: 10, skip: 0 });
      expect(parsePaginationQuery({ page: "2", limit: "5" })).toEqual({
        page: 2,
        limit: 5,
        skip: 5,
      });
      expect(parsePaginationQuery({ limit: "999" }).limit).toBe(50);
    });
  });

  describe("resolveCancelEligibility", () => {
    it("returns normalized eligibility from stored order state", () => {
      expect(resolveCancelEligibility({ status: "pending" })).toEqual({
        eligible: true,
        reason: "ELIGIBLE",
        message: "Order can be cancelled.",
      });
      expect(resolveCancelEligibility({ status: "shipped" })).toMatchObject({
        eligible: false,
        reason: "ORDER_ALREADY_SHIPPED",
      });
      expect(resolveCancelEligibility({ status: "paid", trackingNumber: "AWB1" })).toMatchObject({
        eligible: false,
        reason: "AWB_ASSIGNED",
      });
    });
  });

  describe("shopperOrderListDTO", () => {
    it("returns normalized listing fields only", () => {
      const dto = shopperOrderListDTO({
        _id: "507f1f77bcf86cd799439011",
        invoiceNumber: "INV-20260101-0001",
        status: "pending",
        totalAmount: 499,
        paymentMethod: "phonepe",
        paymentStatus: "pending",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        items: [
          {
            quantity: 2,
            image: "https://cdn.example/item.png",
            variantCombination: { Color: "Red", Size: "M" },
            product: { name: "Test Product", slug: "test-product", mainImage: "main.png" },
          },
        ],
        shiprocketShipments: [],
      }, {
        manualConfirmation: { eligible: true, status: "CALL_PENDING" },
      });

      expect(dto._id).toBe("507f1f77bcf86cd799439011");
      expect(dto.orderId).toBe("INV-20260101-0001");
      expect(dto.total).toBe(499);
      expect(dto.discountAmount).toBe(0);
      expect(dto.couponCode).toBeNull();
      expect(dto.orderStatus).toBe("pending");
      expect(dto.cancelEligibility).toEqual({
        eligible: true,
        reason: "ELIGIBLE",
        message: "Order can be cancelled.",
      });
      expect(dto.manualConfirmation).toEqual({ eligible: true, status: "CALL_PENDING" });
      expect(dto.invoiceAvailable).toBe(true);
      expect(dto.paymentVisibility).toMatchObject({
        paymentMethod: "ONLINE",
        paymentGateway: "PHONEPE",
        paymentStatus: "PENDING",
      });
      expect(dto.trackingSummary).toEqual({
        shipmentStatus: "pending",
        awbAvailable: false,
        trackingAvailable: false,
      });
      expect(dto.itemsPreview).toHaveLength(1);
      expect(dto.itemsPreview[0]).toEqual({
        productName: "Test Product",
        productSlug: "test-product",
        image: "https://cdn.example/item.png",
        quantity: 2,
        variantSummary: "Color: Red, Size: M",
      });
    });

    it("exposes server discount amount and coupon code when present", () => {
      const dto = shopperOrderListDTO({
        _id: "507f1f77bcf86cd799439011",
        invoiceNumber: "INV-DISC-1",
        status: "paid",
        totalAmount: 900,
        coupon: { code: "SAVE100", discountAmount: 100 },
        items: [{ quantity: 1, price: 1000, product: { name: "Ring" } }],
      });

      expect(dto.discountAmount).toBe(100);
      expect(dto.couponCode).toBe("SAVE100");
    });
  });
});
