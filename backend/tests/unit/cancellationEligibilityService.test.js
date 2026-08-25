const {
  getCancellationEligibility,
  canCancelOrder,
  validateCancellationReason,
} = require("../../services/cancellationEligibilityService");

describe("cancellationEligibilityService", () => {
  describe("getCancellationEligibility", () => {
    it("allows eligible pending orders", () => {
      const result = getCancellationEligibility({ status: "pending" });
      expect(result).toEqual({
        eligible: true,
        reason: "ELIGIBLE",
        message: "Order can be cancelled.",
      });
      expect(canCancelOrder({ status: "pending" })).toBe(true);
    });

    it("blocks already cancelled orders", () => {
      const result = getCancellationEligibility({ status: "cancelled" });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("ORDER_ALREADY_CANCELLED");
    });

    it("blocks shipped orders", () => {
      const result = getCancellationEligibility({ status: "shipped" });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("ORDER_ALREADY_SHIPPED");
    });

    it("blocks delivered orders", () => {
      const result = getCancellationEligibility({ status: "delivered" });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("ORDER_ALREADY_DELIVERED");
    });

    it("blocks orders with AWB", () => {
      const result = getCancellationEligibility({
        status: "paid",
        trackingNumber: "AWB123456",
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("AWB_ASSIGNED");
    });

    it("blocks orders with shipment records", () => {
      const result = getCancellationEligibility({
        status: "paid",
        shiprocketShipments: [{ status: "created", trackingNumber: null }],
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("SHIPMENT_CREATED");
    });

    it("blocks dispatched orders", () => {
      const result = getCancellationEligibility({ status: "dispatched" });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("ORDER_ALREADY_SHIPPED");
    });
  });

  describe("validateCancellationReason", () => {
    it("requires a reason code", () => {
      expect(validateCancellationReason({})).toEqual({
        valid: false,
        message: "Cancellation reason is required.",
      });
    });

    it("rejects invalid reason codes", () => {
      expect(validateCancellationReason({ reasonCode: "INVALID" })).toEqual({
        valid: false,
        message: "Invalid cancellation reason.",
      });
    });

    it("requires custom reason for OTHER", () => {
      expect(validateCancellationReason({ reasonCode: "OTHER" })).toEqual({
        valid: false,
        message: "Please provide a reason for cancellation.",
      });
    });

    it("accepts valid predefined reasons", () => {
      expect(
        validateCancellationReason({ reasonCode: "CHANGE_OF_MIND" })
      ).toEqual({
        valid: true,
        reasonCode: "CHANGE_OF_MIND",
        reasonText: null,
      });
    });

    it("accepts OTHER with custom reason", () => {
      expect(
        validateCancellationReason({
          reasonCode: "OTHER",
          customReason: "  Wrong address  ",
        })
      ).toEqual({
        valid: true,
        reasonCode: "OTHER",
        reasonText: "Wrong address",
      });
    });

    it("enforces custom reason max length", () => {
      const result = validateCancellationReason({
        reasonCode: "OTHER",
        customReason: "x".repeat(501),
      });
      expect(result.valid).toBe(false);
      expect(result.message).toContain("500");
    });
  });
});
