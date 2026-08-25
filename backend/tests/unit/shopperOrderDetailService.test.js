const {
  shopperOrderDetailDTO,
  buildShipmentSummary,
  buildPricingSummary,
  buildReviewEligibility,
  buildStatusTimeline,
  buildItems,
  resolveOrderItemSku,
} = require("../../services/shopperOrderDetailService");

describe("shopperOrderDetailService", () => {
  const baseOrder = {
    _id: "507f1f77bcf86cd799439011",
    invoiceNumber: "INV-20260101-0001",
    status: "shipped",
    totalAmount: 1299,
    paymentMethod: "phonepe",
    paymentStatus: "success",
    paymentTransactionId: "TXN123",
    paymentDetails: {
      paymentType: "ONLINE",
      gateway: "PHONEPE",
      channel: "UPI",
      transactionId: "TXN123",
      paymentStatus: "PAID",
      paidAt: new Date("2026-01-02T10:00:00.000Z"),
    },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    shippingCharge: 49,
    bulkDiscountSummary: {
      totalOriginalAmount: 1400,
      totalDiscountAmount: 100,
    },
    coupon: { discountAmount: 50 },
    tax: { totalTaxAmount: 0 },
    items: [
      {
        quantity: 1,
        price: 1250,
        image: "https://cdn.example/item.png",
        variantCombination: { Color: "Blue" },
        product: {
          _id: "507f1f77bcf86cd799439012",
          name: "Test Product",
          slug: "test-product",
          mainImage: "main.png",
          seller: { _id: "507f1f77bcf86cd799439013", shopName: "Test Shop", shopUrl: "test-shop" },
        },
      },
    ],
    shiprocketShipments: [
      {
        status: "shipped",
        trackingNumber: "AWB999",
        createdAt: new Date("2026-01-02T12:00:00.000Z"),
      },
    ],
  };

  describe("shopperOrderDetailDTO", () => {
    it("returns normalized detail fields only", () => {
      const dto = shopperOrderDetailDTO(baseOrder, {
        reviewedProductIds: new Set(["507f1f77bcf86cd799439012"]),
      });

      expect(dto._id).toBe("507f1f77bcf86cd799439011");
      expect(dto.orderId).toBe("INV-20260101-0001");
      expect(dto.orderStatus).toBe("shipped");
      expect(dto.paymentVisibility).toEqual({
        paymentType: "ONLINE",
        paymentStatus: "PAID",
        gateway: "PHONEPE",
        channel: "UPI",
        transactionId: "TXN123",
        paidAt: "2026-01-02T10:00:00.000Z",
      });
      expect(dto.shipmentSummary).toMatchObject({
        shipmentStatus: "Shipped",
        awbNumber: "AWB999",
        trackingAvailable: true,
      });
      expect(dto.invoiceSummary).toEqual({
        invoiceAvailable: true,
        invoiceUrl: "/api/orders/507f1f77bcf86cd799439011/invoice",
      });
      expect(dto.pricingSummary).toMatchObject({
        subtotal: 1250,
        shippingCharge: 49,
        taxAmount: 0,
        discountAmount: 150,
        couponCode: null,
        couponDiscount: 50,
        bulkDiscount: 100,
        total: 1299,
        gst: {
          cgst: 0,
          sgst: 0,
          ugst: 0,
          igst: 0,
          taxType: null,
        },
        orderSummary: {
          subtotal: 1250,
          subtotalLabel: "Subtotal",
          itemsGstAdded: 0,
          shippingCharge: 49,
          shippingGst: 0,
          discountAmount: 0,
          couponCode: null,
          total: 1299,
        },
      });
      expect(dto.items).toHaveLength(1);
      expect(dto.items[0]).toMatchObject({
        productName: "Test Product",
        sellerName: "Test Shop",
        sellerSlug: "test-shop",
        variantSummary: "Color: Blue",
      });
      expect(dto.sellerSummary.sellers).toHaveLength(1);
      expect(dto.statusTimeline[0]).toMatchObject({ status: "placed", label: "Order placed" });
      expect(dto.reviewEligibility).toEqual({
        eligible: false,
        alreadyReviewed: true,
        delivered: false,
        reason: "ALREADY_REVIEWED",
      });
      expect(dto.cancelEligibility).toMatchObject({
        eligible: false,
        reason: "ORDER_ALREADY_SHIPPED",
      });
      expect(dto.manualConfirmation).toEqual({ eligible: false, status: null });
      expect(dto.items[0].reviewEligibility).toEqual({
        eligible: false,
        alreadyReviewed: true,
        delivered: false,
        reason: "ALREADY_REVIEWED",
      });
      expect(dto.deliveryAddress).toBeNull();
      expect(dto.billingAddress).toBeNull();
    });

    it("exposes deliveryAddress from shippingDetails and omits matching billingAddress", () => {
      const address = {
        name: "Asha Kumar",
        phone: "9876543210",
        address: "12 MG Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411001",
        country: "India",
        email: "secret@example.com",
      };
      const dto = shopperOrderDetailDTO({
        ...baseOrder,
        shippingDetails: address,
        billingDetails: { ...address },
      });

      expect(dto.deliveryAddress).toEqual({
        name: "Asha Kumar",
        phone: "9876543210",
        addressLine1: "12 MG Road",
        addressLine2: null,
        city: "Pune",
        state: "Maharashtra",
        district: null,
        pincode: "411001",
        country: "India",
      });
      expect(dto.billingAddress).toBeNull();
      expect(dto.deliveryAddress).not.toHaveProperty("email");
    });

    it("exposes distinct billingAddress when billing differs from shipping", () => {
      const dto = shopperOrderDetailDTO({
        ...baseOrder,
        shippingDetails: {
          name: "Ship To",
          phone: "9000000001",
          address: "Ship Lane",
          city: "Pune",
          state: "Maharashtra",
          pincode: "411001",
          country: "India",
        },
        billingDetails: {
          name: "Bill To",
          phone: "9000000002",
          address: "Bill Lane",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
          country: "India",
        },
      });

      expect(dto.deliveryAddress).toMatchObject({
        name: "Ship To",
        addressLine1: "Ship Lane",
        city: "Pune",
        pincode: "411001",
      });
      expect(dto.billingAddress).toMatchObject({
        name: "Bill To",
        addressLine1: "Bill Lane",
        city: "Mumbai",
        pincode: "400001",
      });
    });

    it("falls back deliveryAddress to billingDetails when shipping is absent", () => {
      const dto = shopperOrderDetailDTO({
        ...baseOrder,
        billingDetails: {
          firstName: "Ravi",
          lastName: "Shah",
          phone: "9111111111",
          address: { street: "Legacy Street", postalCode: "560001", district: "Bengaluru Urban" },
          city: "Bengaluru",
          state: "Karnataka",
          country: "India",
        },
      });

      expect(dto.deliveryAddress).toEqual({
        name: "Ravi Shah",
        phone: "9111111111",
        addressLine1: "Legacy Street",
        addressLine2: null,
        city: "Bengaluru",
        state: "Karnataka",
        district: "Bengaluru Urban",
        pincode: "560001",
        country: "India",
      });
      expect(dto.billingAddress).toEqual(dto.deliveryAddress);
    });

    it("does not leak location ObjectIds in address fields", () => {
      const dto = shopperOrderDetailDTO({
        ...baseOrder,
        shippingDetails: {
          name: "Safe",
          phone: "9222222222",
          address: "Line 1",
          city: "507f1f77bcf86cd799439099",
          state: "507f1f77bcf86cd799439098",
          pincode: "110001",
          country: "507f1f77bcf86cd799439097",
        },
      });

      expect(dto.deliveryAddress).toEqual({
        name: "Safe",
        phone: "9222222222",
        addressLine1: "Line 1",
        addressLine2: null,
        city: null,
        state: null,
        district: null,
        pincode: "110001",
        country: null,
      });
    });
  });

  describe("buildShipmentSummary", () => {
    it("is nullable-safe when no tracking exists", () => {
      expect(buildShipmentSummary({ status: "pending", shiprocketShipments: [] })).toEqual({
        requiresShipping: true,
        shippingApplicability: "full",
        shipmentStatus: null,
        courierName: null,
        awbNumber: null,
        trackingUrl: null,
        estimatedDelivery: null,
        trackingAvailable: false,
      });
    });

    it("normalizes shopper-friendly shipment status labels", () => {
      const summary = buildShipmentSummary({
        status: "shipped",
        shiprocketShipments: [{ status: "out_for_delivery" }],
      });
      expect(summary.shipmentStatus).toBe("Out for delivery");
    });

    it("handles partial fulfillment gracefully", () => {
      const summary = buildShipmentSummary({
        status: "shipped",
        shiprocketShipments: [{ status: "delivered" }, { status: "shipped" }],
      });
      // We don't infer delivery; we only report partial status when mixed
      expect(summary.shipmentStatus).toBe("Partially Delivered");
    });
  });

  describe("buildPricingSummary", () => {
    it("uses authoritative backend totals", () => {
      expect(buildPricingSummary(baseOrder).total).toBe(1299);
    });

    it("returns orderSummary with dynamic subtotal label", () => {
      const mixedOrder = {
        totalAmount: 534,
        shippingCharge: 50,
        items: [
          { quantity: 1, price: 300 },
          { quantity: 1, price: 178 },
        ],
        bulkDiscountSummary: { totalOriginalAmount: 478, totalDiscountAmount: 0 },
        tax: {
          totalTaxAmount: 57.22,
          totalTaxAdded: 6,
          shippingTax: { taxAmount: 6 },
          taxBreakdownSnapshot: {
            items: [{ inclusive: true }, { inclusive: true }],
          },
        },
      };

      const summary = buildPricingSummary(mixedOrder);
      expect(summary.orderSummary).toEqual({
        subtotal: 478,
        subtotalLabel: "Subtotal (incl. GST)",
        itemsGstAdded: 0,
        shippingCharge: 50,
        shippingGst: 6,
        discountAmount: 0,
        couponCode: null,
        total: 534,
      });
      expect(summary.taxInformation).toBeUndefined();
    });

    it("exposes coupon code and keeps discount line amount when not embedded in items", () => {
      const summary = buildPricingSummary({
        totalAmount: 900,
        shippingCharge: 0,
        coupon: { code: "SAVE100", discountAmount: 100 },
        items: [{ quantity: 1, price: 1000, originalPrice: 1000 }],
        tax: { totalTaxAmount: 0, totalTaxAdded: 0 },
      });

      expect(summary).toMatchObject({
        couponCode: "SAVE100",
        couponDiscount: 100,
        discountAmount: 100,
        orderSummary: {
          couponCode: "SAVE100",
          discountAmount: 100,
        },
      });
    });
  });

  describe("buildReviewEligibility", () => {
    it("marks delivered orders without reviews as eligible", () => {
      expect(
        buildReviewEligibility(
          { status: "delivered", items: [{ product: { _id: "p1" } }] },
          { reviewedProductIds: new Set() }
        )
      ).toEqual({
        eligible: true,
        alreadyReviewed: false,
        delivered: true,
        reason: "ELIGIBLE",
      });
    });
  });

  describe("buildStatusTimeline", () => {
    it("includes cancelled terminal state", () => {
      const timeline = buildStatusTimeline({
        status: "cancelled",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      });
      expect(timeline.some((step) => step.status === "cancelled")).toBe(true);
    });

    it("prefers deliveredAt for the delivered milestone", () => {
      const timeline = buildStatusTimeline({
        status: "delivered",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-10T00:00:00.000Z"),
        deliveredAt: new Date("2026-01-08T04:30:00.000Z"),
      });

      expect(timeline.find((step) => step.status === "delivered")).toEqual({
        status: "delivered",
        timestamp: "2026-01-08T04:30:00.000Z",
        label: "Delivered",
      });
    });
  });

  describe("order item SKU", () => {
    it("prefers variantSku snapshot over product.sku", () => {
      const sku = resolveOrderItemSku(
        { variantSku: "VAR-ORDER-001" },
        { sku: "BASE-SKU" }
      );
      expect(sku).toBe("VAR-ORDER-001");
    });

    it("falls back to product.sku when variantSku is missing", () => {
      const sku = resolveOrderItemSku({}, { sku: "BASE-SKU" });
      expect(sku).toBe("BASE-SKU");
    });

    it("returns null when no SKU snapshot exists", () => {
      expect(resolveOrderItemSku({}, {})).toBeNull();
      expect(resolveOrderItemSku({ variantSku: "   " }, { sku: "" })).toBeNull();
    });

    it("exposes sku on shopper order detail items", () => {
      const order = {
        ...baseOrder,
        items: [
          {
            ...baseOrder.items[0],
            variantSku: "HIST-VAR-SKU",
            product: { ...baseOrder.items[0].product, sku: "HIST-BASE-SKU" },
          },
        ],
      };

      const dto = shopperOrderDetailDTO(order);
      expect(dto.items[0].sku).toBe("HIST-VAR-SKU");

      const fallbackItems = buildItems({
        items: [
          {
            quantity: 1,
            price: 100,
            product: { name: "No Variant", sku: "ONLY-BASE" },
          },
        ],
      });
      expect(fallbackItems[0].sku).toBe("ONLY-BASE");
    });

    it("surfaces fulfilmentKind and sourceOrder when present on the order document", () => {
      const sourceOrderId = "507f1f77bcf86cd799439099";
      const dto = shopperOrderDetailDTO({
        ...baseOrder,
        fulfilmentKind: "replacement",
        sourceOrder: sourceOrderId,
      });

      expect(dto.fulfilmentKind).toBe("replacement");
      expect(dto.sourceOrder).toBe(sourceOrderId);
    });

    it("defaults fulfilmentKind to sale when absent", () => {
      const dto = shopperOrderDetailDTO(baseOrder);
      expect(dto.fulfilmentKind).toBe("sale");
      expect(dto.sourceOrder).toBeNull();
    });
  });
});
