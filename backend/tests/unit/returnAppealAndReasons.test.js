/**
 * Unit tests: status guards for appeal + resolution reasons.
 */

const {
  isAllowedAfterSalesTransition,
  canShopperAppeal,
  canAdminDecideAppeal,
  hasCompletedAfterSalesWalletRefund,
  canChangeResolutionAfterWalletRefund,
  normalizeResolutionReasonPayload,
  AFTER_SALES_ALLOWED_TRANSITIONS,
} = require("../../utils/returnStatusGuards");
const {
  buildAppealDTO,
  computeAppealWindowEndsAt,
} = require("../../services/returnAppealService");

describe("returnStatusGuards post-UAT", () => {
  test("includes under_admin_review transitions", () => {
    expect(AFTER_SALES_ALLOWED_TRANSITIONS.resolved).toContain("under_admin_review");
    expect(AFTER_SALES_ALLOWED_TRANSITIONS.rejected).toContain("under_admin_review");
    expect(AFTER_SALES_ALLOWED_TRANSITIONS.under_admin_review).toEqual(
      expect.arrayContaining(["resolved", "rejected", "closed"])
    );
  });

  test("shopper may appeal after seller resolution", () => {
    expect(canShopperAppeal("resolved", { caseFlow: "after_sales" })).toBe(true);
    expect(canShopperAppeal("rejected", { caseFlow: "after_sales" })).toBe(true);
    expect(canShopperAppeal("pending_review", { caseFlow: "after_sales" })).toBe(false);
    expect(canShopperAppeal("resolved", { caseFlow: "legacy" })).toBe(false);
  });

  test("shopper cannot appeal after wallet refund", () => {
    expect(
      canShopperAppeal("resolved", {
        caseFlow: "after_sales",
        request: { walletCreditProcessedAt: new Date() },
      })
    ).toBe(false);
    expect(
      hasCompletedAfterSalesWalletRefund({ walletCreditProcessedAt: new Date() })
    ).toBe(true);
    expect(
      canChangeResolutionAfterWalletRefund(
        { walletCreditProcessedAt: new Date() },
        "rejected"
      )
    ).toBe(false);
    expect(
      canChangeResolutionAfterWalletRefund(
        { walletCreditProcessedAt: new Date() },
        "refund"
      )
    ).toBe(true);
  });

  test("admin decides appeal only under_admin_review", () => {
    expect(canAdminDecideAppeal("under_admin_review", { caseFlow: "after_sales" })).toBe(
      true
    );
    expect(canAdminDecideAppeal("resolved", { caseFlow: "after_sales" })).toBe(false);
  });

  test("appeal transition is allowed", () => {
    expect(isAllowedAfterSalesTransition("resolved", "under_admin_review")).toBe(true);
    expect(isAllowedAfterSalesTransition("under_admin_review", "closed")).toBe(true);
  });

  test("resolution reason is mandatory and typed", () => {
    expect(
      normalizeResolutionReasonPayload("refund", "MANUFACTURING_DEFECT").valid
    ).toBe(true);
    expect(normalizeResolutionReasonPayload("refund", "").valid).toBe(false);
    expect(
      normalizeResolutionReasonPayload("rejected", "USED_PRODUCT").valid
    ).toBe(true);
    expect(
      normalizeResolutionReasonPayload("rejected", "MANUFACTURING_DEFECT").valid
    ).toBe(false);
    expect(normalizeResolutionReasonPayload("refund", "OTHER").valid).toBe(false);
    expect(
      normalizeResolutionReasonPayload("refund", "OTHER", "Custom goodwill").valid
    ).toBe(true);
  });

  test("appeal DTO does not treat missing window as open forever", () => {
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const dto = buildAppealDTO({
      caseFlow: "after_sales",
      status: "rejected",
      updatedAt: past,
      createdAt: past,
      appeal: { appealCount: 0 },
    });
    expect(dto.canAppeal).toBe(false);
    expect(dto.windowEndsAt).toBeTruthy();
  });

  test("appeal DTO allows appeal within stored window", () => {
    const now = new Date();
    const dto = buildAppealDTO({
      caseFlow: "after_sales",
      status: "rejected",
      updatedAt: now,
      createdAt: now,
      appeal: {
        appealCount: 0,
        windowEndsAt: computeAppealWindowEndsAt(now),
      },
    });
    expect(dto.canAppeal).toBe(true);
  });
});
