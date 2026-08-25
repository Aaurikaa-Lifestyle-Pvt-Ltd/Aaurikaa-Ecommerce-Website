const {
  REASON,
  getReturnEligibility,
  getReturnWindowExpiresAt,
  normalizeReturnWindowDays,
  toShopperReturnEligibility,
} = require("../../services/returnEligibilityService");

describe("returnEligibilityService", () => {
  const deliveredAt = "2026-07-01T04:30:00.000Z"; // July 1, 10:00 IST

  it("keeps the final IST calendar day inclusive", () => {
    const expiry = getReturnWindowExpiresAt(deliveredAt, 7);
    expect(expiry.toISOString()).toBe("2026-07-08T18:29:59.999Z");

    expect(
      getReturnEligibility(
        { status: "delivered", deliveredAt },
        null,
        { returnWindowDays: 7, now: expiry }
      )
    ).toMatchObject({ eligible: true, reason: REASON.ELIGIBLE });

    expect(
      getReturnEligibility(
        { status: "delivered", deliveredAt },
        null,
        {
          returnWindowDays: 7,
          now: new Date(expiry.getTime() + 1),
        }
      )
    ).toMatchObject({
      eligible: false,
      reason: REASON.RETURN_WINDOW_EXPIRED,
    });
  });

  it("handles month and year rollover in IST", () => {
    expect(
      getReturnWindowExpiresAt("2026-12-31T04:30:00.000Z", 7).toISOString()
    ).toBe("2027-01-07T18:29:59.999Z");
  });

  it("defaults missing or invalid settings to seven days", () => {
    expect(normalizeReturnWindowDays(undefined)).toBe(7);
    expect(normalizeReturnWindowDays("invalid")).toBe(7);
    expect(normalizeReturnWindowDays(0)).toBe(7);
    expect(normalizeReturnWindowDays(366)).toBe(7);
    expect(normalizeReturnWindowDays("30")).toBe(30);
  });

  it("maps missing and invalid delivery timestamps to the generic shopper reason", () => {
    for (const value of [null, undefined, "not-a-date"]) {
      const internal = getReturnEligibility({
        status: "delivered",
        deliveredAt: value,
      });
      expect(internal.reason).toBe(REASON.DELIVERY_TIMESTAMP_UNAVAILABLE);
      expect(toShopperReturnEligibility(internal)).toMatchObject({
        eligible: false,
        reason: REASON.ORDER_NOT_ELIGIBLE_STATUS,
        message: "Help requests are not available for this order.",
      });
    }
  });

  it("treats a future delivery timestamp as unavailable", () => {
    const internal = getReturnEligibility(
      { status: "delivered", deliveredAt: "2026-07-02T00:00:00.000Z" },
      null,
      { now: "2026-07-01T00:00:00.000Z" }
    );

    expect(toShopperReturnEligibility(internal).reason).toBe(
      REASON.ORDER_NOT_ELIGIBLE_STATUS
    );
  });

  it("preserves existing-request reason precedence", () => {
    const order = { status: "delivered", deliveredAt: null };

    expect(
      getReturnEligibility(order, { status: "pending_review" })
    ).toMatchObject({
      eligible: false,
      reason: REASON.ACTIVE_REQUEST_EXISTS,
    });
    expect(
      getReturnEligibility(order, { status: "refund_completed" })
    ).toMatchObject({
      eligible: false,
      reason: REASON.ALREADY_RESOLVED,
    });
  });

  it("blocks eligibility when return policy disallows returns", () => {
    expect(
      getReturnEligibility(
        { status: "delivered", deliveredAt },
        null,
        { returnWindowDays: 7, returnAllowed: false }
      )
    ).toMatchObject({
      eligible: false,
      reason: REASON.RETURN_NOT_ALLOWED,
    });
  });
});
