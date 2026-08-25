const {
  mapPaymentType,
  mapPaymentStatus,
  extractChannelFromPhonePePayload,
  buildPaymentDetails,
  toPaymentVisibilityDTO,
} = require("../../services/paymentVisibilityService");

describe("paymentVisibilityService", () => {
  describe("mapPaymentType", () => {
    it("maps cod to COD", () => {
      expect(mapPaymentType("cod")).toEqual({ paymentType: "COD", gateway: null });
    });

    it("maps phonepe to ONLINE/PHONEPE", () => {
      expect(mapPaymentType("phonepe")).toEqual({ paymentType: "ONLINE", gateway: "PHONEPE" });
    });

    it("maps upi_manual to OFFLINE", () => {
      expect(mapPaymentType("upi_manual")).toEqual({ paymentType: "OFFLINE", gateway: null });
    });
  });

  describe("mapPaymentStatus", () => {
    it("maps success to PAID", () => {
      expect(mapPaymentStatus("success", "paid", "phonepe", "TXN1")).toBe("PAID");
    });

    it("maps failed to FAILED", () => {
      expect(mapPaymentStatus("failed", "cancelled", "phonepe", "TXN1")).toBe("FAILED");
    });

    it("maps phonepe pending with txn to PROCESSING", () => {
      expect(mapPaymentStatus("pending", "pending", "phonepe", "TXN1")).toBe("PROCESSING");
    });
  });

  describe("extractChannelFromPhonePePayload", () => {
    it("extracts channel from paymentInstrument", () => {
      const channel = extractChannelFromPhonePePayload({
        paymentInstrument: { type: "UPI" },
      });
      expect(channel).toBe("UPI");
    });

    it("returns null when absent", () => {
      expect(extractChannelFromPhonePePayload({})).toBeNull();
    });
  });

  describe("buildPaymentDetails", () => {
    it("builds COD details", () => {
      const details = buildPaymentDetails({
        paymentMethod: "cod",
        paymentStatus: "pending",
        status: "processing",
      });
      expect(details.paymentType).toBe("COD");
      expect(details.gateway).toBeNull();
      expect(details.paymentStatus).toBe("PENDING");
    });

    it("builds phonepe success with channel from payload", () => {
      const details = buildPaymentDetails(
        {
          paymentMethod: "phonepe",
          paymentStatus: "success",
          status: "paid",
          paymentTransactionId: "TXN_abc",
        },
        {
          phonePePayload: { paymentInstrument: { type: "CARD" } },
          paidAt: new Date("2026-01-01"),
        }
      );
      expect(details.paymentType).toBe("ONLINE");
      expect(details.gateway).toBe("PHONEPE");
      expect(details.channel).toBe("CARD");
      expect(details.paymentStatus).toBe("PAID");
      expect(details.transactionId).toBe("TXN_abc");
    });
  });

  describe("toPaymentVisibilityDTO", () => {
    it("uses stored paymentDetails when present", () => {
      const dto = toPaymentVisibilityDTO({
        paymentMethod: "phonepe",
        paymentDetails: {
          paymentType: "ONLINE",
          gateway: "PHONEPE",
          channel: "UPI",
          paymentStatus: "PAID",
          transactionId: "TXN1",
          paidAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      });
      expect(dto).toEqual({
        paymentMethod: "ONLINE",
        paymentGateway: "PHONEPE",
        paymentChannel: "UPI",
        paymentStatus: "PAID",
        transactionId: "TXN1",
        paidAt: "2026-05-01T00:00:00.000Z",
      });
    });

    it("falls back for legacy orders without paymentDetails", () => {
      const dto = toPaymentVisibilityDTO({
        paymentMethod: "cod",
        paymentStatus: "pending",
        status: "processing",
      });
      expect(dto.paymentMethod).toBe("COD");
      expect(dto.paymentGateway).toBeNull();
      expect(dto.paymentChannel).toBeNull();
      expect(dto.paymentStatus).toBe("PENDING");
    });
  });
});
