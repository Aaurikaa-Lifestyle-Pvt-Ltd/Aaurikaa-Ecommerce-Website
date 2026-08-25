const {
  isAllowedReturnStatusTransition,
  isAllowedLegacyTransition,
  isAllowedAfterSalesTransition,
  resolveReturnReviewTarget,
  resolveRefundReviewTarget,
  canReviewReturn,
  canReviewRefund,
  canCompleteRefund,
  canSelectResolution,
  isTerminalReturnStatus,
  ALLOWED_TRANSITIONS,
  LEGACY_ALLOWED_TRANSITIONS,
  AFTER_SALES_ALLOWED_TRANSITIONS,
} = require("../../utils/returnStatusGuards");

describe("returnStatusGuards", () => {
  describe("certified legacy workflow transitions", () => {
    const allowedPairs = [
      ["pending_review", "approved"],
      ["pending_review", "rejected"],
      ["approved", "refund_approved"],
      ["approved", "refund_rejected"],
      ["refund_approved", "refund_completed"],
    ];

    it.each(allowedPairs)("allows legacy %s → %s", (from, to) => {
      expect(isAllowedLegacyTransition(from, to)).toBe(true);
      expect(isAllowedReturnStatusTransition(from, to)).toBe(true);
    });
  });

  describe("after-sales lifecycle transitions", () => {
    const allowedPairs = [
      ["pending_review", "awaiting_pickup"],
      ["pending_review", "awaiting_inspection"],
      ["pending_review", "rejected"],
      ["pending_review", "resolved"],
      ["awaiting_pickup", "in_transit"],
      ["awaiting_pickup", "awaiting_inspection"],
      ["in_transit", "awaiting_inspection"],
      ["awaiting_inspection", "resolved"],
      ["awaiting_inspection", "rejected"],
      ["resolved", "closed"],
    ];

    it.each(allowedPairs)("allows after-sales %s → %s", (from, to) => {
      expect(isAllowedAfterSalesTransition(from, to)).toBe(true);
      expect(isAllowedReturnStatusTransition(from, to)).toBe(true);
    });
  });

  describe("admin governance transitions (Phase 5)", () => {
    const adminOverridePairs = [
      ["rejected", "pending_review"],
      ["rejected", "resolved"],
      ["rejected", "awaiting_inspection"],
      ["resolved", "rejected"],
      ["resolved", "awaiting_inspection"],
    ];

    it.each(adminOverridePairs)("allows admin override %s → %s", (from, to) => {
      expect(isAllowedReturnStatusTransition(from, to)).toBe(true);
    });
  });

  describe("illegal transitions", () => {
    const blockedPairs = [
      ["pending_review", "refund_approved"],
      ["pending_review", "refund_completed"],
      ["approved", "pending_review"],
      ["approved", "refund_completed"],
      ["rejected", "approved"],
      ["refund_rejected", "approved"],
      ["refund_completed", "approved"],
      ["refund_completed", "pending_review"],
      ["refund_completed", "refund_approved"],
      ["refund_approved", "approved"],
      ["refund_approved", "rejected"],
      ["resolved", "pending_review"],
      ["awaiting_inspection", "pending_review"],
      ["in_transit", "pending_review"],
    ];

    it.each(blockedPairs)("blocks %s → %s", (from, to) => {
      expect(isAllowedReturnStatusTransition(from, to)).toBe(false);
    });
  });

  describe("terminal states", () => {
    it("marks refund_rejected, refund_completed, and closed as terminal (rejected appealable)", () => {
      expect(isTerminalReturnStatus("rejected")).toBe(false);
      expect(isTerminalReturnStatus("refund_rejected")).toBe(true);
      expect(isTerminalReturnStatus("refund_completed")).toBe(true);
      expect(isTerminalReturnStatus("closed")).toBe(true);
      expect(isTerminalReturnStatus("resolved")).toBe(false);
    });

    it("allows resolved → closed while blocking legacy terminal outbound transitions", () => {
      expect(isAllowedReturnStatusTransition("resolved", "closed")).toBe(true);
      expect(isAllowedReturnStatusTransition("resolved", "pending_review")).toBe(false);

      for (const status of ["refund_rejected", "refund_completed", "closed"]) {
        const targets = ALLOWED_TRANSITIONS[status] || [];
        expect(targets).toHaveLength(0);
        for (const target of [
          "pending_review",
          "approved",
          "refund_approved",
          "refund_completed",
          "awaiting_pickup",
        ]) {
          expect(isAllowedReturnStatusTransition(status, target)).toBe(false);
        }
      }

      // rejected: seller terminal but admin may reopen/override (Phase 5)
      expect(ALLOWED_TRANSITIONS.rejected).toEqual(
        expect.arrayContaining(["pending_review", "resolved", "awaiting_inspection"])
      );
      expect(isAllowedReturnStatusTransition("rejected", "approved")).toBe(false);
    });
  });

  describe("dual-path merge", () => {
    it("keeps legacy graph intact inside ALLOWED_TRANSITIONS", () => {
      for (const [from, targets] of Object.entries(LEGACY_ALLOWED_TRANSITIONS)) {
        for (const to of targets) {
          expect(ALLOWED_TRANSITIONS[from]).toContain(to);
        }
      }
    });

    it("includes after-sales graph inside ALLOWED_TRANSITIONS", () => {
      for (const [from, targets] of Object.entries(AFTER_SALES_ALLOWED_TRANSITIONS)) {
        for (const to of targets) {
          expect(ALLOWED_TRANSITIONS[from]).toContain(to);
        }
      }
    });
  });

  describe("action resolvers", () => {
    it("maps return review actions", () => {
      expect(resolveReturnReviewTarget("approve")).toBe("approved");
      expect(resolveReturnReviewTarget("reject")).toBe("rejected");
      expect(resolveReturnReviewTarget("invalid")).toBeNull();
    });

    it("maps refund review actions", () => {
      expect(resolveRefundReviewTarget("approve")).toBe("refund_approved");
      expect(resolveRefundReviewTarget("reject")).toBe("refund_rejected");
    });
  });

  describe("capability helpers", () => {
    it("identifies review windows for certified legacy workflow", () => {
      expect(canReviewReturn("pending_review")).toBe(true);
      expect(canReviewReturn("approved")).toBe(false);
      expect(canReviewRefund("approved")).toBe(true);
      expect(canReviewRefund("pending_review")).toBe(false);
      expect(canReviewRefund("refund_pending")).toBe(false);
      expect(canCompleteRefund("refund_approved")).toBe(true);
      expect(canCompleteRefund("approved")).toBe(false);
    });

    it("blocks legacy refund actions on after_sales caseFlow", () => {
      expect(canReviewRefund("approved", { caseFlow: "after_sales" })).toBe(false);
      expect(canCompleteRefund("refund_approved", { caseFlow: "after_sales" })).toBe(false);
      expect(canCompleteRefund("refund_approved", { caseFlow: "legacy" })).toBe(true);
    });

    it("blocks legacy admin return review on after_sales caseFlow", () => {
      expect(canReviewReturn("pending_review", { caseFlow: "after_sales" })).toBe(false);
      expect(canReviewReturn("pending_review", { caseFlow: "legacy" })).toBe(true);
      expect(canReviewReturn("pending_review")).toBe(true);
    });

    it("allows resolution selection only on after_sales selectable statuses", () => {
      expect(canSelectResolution("awaiting_inspection", { caseFlow: "after_sales" })).toBe(true);
      expect(canSelectResolution("pending_review", { caseFlow: "after_sales" })).toBe(true);
      expect(canSelectResolution("awaiting_pickup", { caseFlow: "after_sales" })).toBe(false);
      expect(canSelectResolution("awaiting_inspection", { caseFlow: "legacy" })).toBe(false);
    });

    it("exposes seller review and receipt capabilities for after_sales", () => {
      const {
        canSellerReview,
        canConfirmReceipt,
        resolveSellerAcceptTarget,
        resolveSellerResolutionTargetStatus,
      } = require("../../utils/returnStatusGuards");

      expect(canSellerReview("pending_review", { caseFlow: "after_sales" })).toBe(true);
      expect(canSellerReview("pending_review", { caseFlow: "legacy" })).toBe(false);
      expect(canConfirmReceipt("awaiting_pickup", { caseFlow: "after_sales" })).toBe(true);
      expect(canConfirmReceipt("in_transit", { caseFlow: "after_sales" })).toBe(true);
      expect(canConfirmReceipt("pending_review", { caseFlow: "after_sales" })).toBe(false);
      expect(resolveSellerAcceptTarget(true)).toBe("awaiting_pickup");
      expect(resolveSellerAcceptTarget(false)).toBe("awaiting_inspection");
      expect(resolveSellerAcceptTarget(false, { withResolution: true })).toBe("resolved");
      expect(resolveSellerResolutionTargetStatus("refund")).toBe("resolved");
      expect(resolveSellerResolutionTargetStatus("rejected")).toBe("rejected");
    });
  });
});
