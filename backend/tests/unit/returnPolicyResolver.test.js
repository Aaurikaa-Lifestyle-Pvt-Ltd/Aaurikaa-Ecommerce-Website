/**
 * Unit tests: seller-owned return policy (platform retired).
 */

const {
  resolveProductReturnPolicy,
  resolveOrderReturnPolicy,
  normalizeSellerReturnPolicyFields,
  normalizeProductReturnPolicyFields,
  isSellerReturnPolicyConfigured,
  assertSellerReturnPolicyReady,
} = require("../../utils/returnPolicyResolver");

describe("returnPolicyResolver (seller-owned)", () => {
  const configuredSeller = {
    returnAllowed: true,
    returnWindowDays: 14,
    returnConditions: "Unused with tags",
  };

  test("seller policy is required and explicit", () => {
    expect(isSellerReturnPolicyConfigured({})).toBe(false);
    expect(isSellerReturnPolicyConfigured(configuredSeller)).toBe(true);
    expect(assertSellerReturnPolicyReady({}).valid).toBe(false);
    expect(assertSellerReturnPolicyReady(configuredSeller).valid).toBe(true);
  });

  test("returnAllowed false is a complete seller policy", () => {
    const noReturnsSeller = { returnAllowed: false };
    expect(isSellerReturnPolicyConfigured(noReturnsSeller)).toBe(true);
    expect(assertSellerReturnPolicyReady(noReturnsSeller).valid).toBe(true);
    expect(isSellerReturnPolicyConfigured({ returnAllowed: false, returnWindowDays: null })).toBe(
      true
    );
  });

  test("returnAllowed true without window or conditions is not configured", () => {
    expect(isSellerReturnPolicyConfigured({ returnAllowed: true })).toBe(false);
    expect(isSellerReturnPolicyConfigured({ returnAllowed: true, returnWindowDays: 14 })).toBe(
      false
    );
    expect(assertSellerReturnPolicyReady({ returnAllowed: true }).valid).toBe(false);
  });

  test("normalizeSellerReturnPolicyFields allows false without window/conditions", () => {
    const result = normalizeSellerReturnPolicyFields({
      returnAllowed: "false",
      returnWindowDays: "",
      returnConditions: "",
    });
    expect(result).toMatchObject({
      valid: true,
      changed: true,
      returnAllowed: false,
    });
    expect(result).not.toHaveProperty("returnWindowDays");
    expect(result).not.toHaveProperty("returnConditions");
  });

  test("normalizeSellerReturnPolicyFields requires window/conditions when allowed", () => {
    expect(
      normalizeSellerReturnPolicyFields({
        returnAllowed: "true",
        returnWindowDays: "",
        returnConditions: "",
      }).valid
    ).toBe(false);

    expect(
      normalizeSellerReturnPolicyFields({
        returnAllowed: "true",
        returnWindowDays: "7",
        returnConditions: "Unused",
      })
    ).toMatchObject({
      valid: true,
      returnAllowed: true,
      returnWindowDays: 7,
      returnConditions: "Unused",
    });
  });

  test("normalizeSellerReturnPolicyFields accepts optional window/conditions when not allowed", () => {
    expect(
      normalizeSellerReturnPolicyFields({
        returnAllowed: "false",
        returnWindowDays: "14",
        returnConditions: "Unused with tags",
      })
    ).toMatchObject({
      valid: true,
      returnAllowed: false,
      returnWindowDays: 14,
      returnConditions: "Unused with tags",
    });
  });

  test("product inherit uses seller policy only", () => {
    expect(
      resolveProductReturnPolicy({
        product: { returnPolicyMode: "inherit" },
        seller: configuredSeller,
      })
    ).toMatchObject({
      returnAllowed: true,
      returnWindowDays: 14,
      returnConditions: "Unused with tags",
      source: "seller",
      configured: true,
    });
  });

  test("unconfigured seller blocks eligibility", () => {
    expect(
      resolveProductReturnPolicy({
        product: { returnPolicyMode: "inherit" },
        seller: { returnAllowed: true },
      })
    ).toMatchObject({
      returnAllowed: false,
      configured: false,
      source: "seller_unconfigured",
    });
  });

  test("product override wins without platform fallback", () => {
    expect(
      resolveProductReturnPolicy({
        product: {
          returnPolicyMode: "override",
          returnAllowed: false,
          returnWindowDays: 3,
          returnConditions: "Sealed only",
        },
        seller: configuredSeller,
      })
    ).toMatchObject({
      returnAllowed: false,
      returnWindowDays: 3,
      returnConditions: "Sealed only",
      source: "product",
    });
  });

  test("order policy uses min window among allowed items", () => {
    const order = {
      items: [
        {
          product: {
            returnPolicyMode: "inherit",
            seller: { ...configuredSeller, returnWindowDays: 10 },
          },
        },
        {
          product: {
            returnPolicyMode: "override",
            returnAllowed: true,
            returnWindowDays: 5,
            seller: configuredSeller,
          },
        },
      ],
    };
    expect(resolveOrderReturnPolicy({ order })).toMatchObject({
      returnAllowed: true,
      returnWindowDays: 5,
      configured: true,
      source: "order",
    });
  });

  test("normalizeSellerReturnPolicyFields rejects inherit", () => {
    expect(
      normalizeSellerReturnPolicyFields({
        returnAllowed: "inherit",
        returnWindowDays: 7,
        returnConditions: "ok",
      }).valid
    ).toBe(false);

    expect(
      normalizeSellerReturnPolicyFields({
        returnAllowed: "true",
        returnWindowDays: "7",
        returnConditions: "Unused",
      })
    ).toMatchObject({
      valid: true,
      returnAllowed: true,
      returnWindowDays: 7,
      returnConditions: "Unused",
    });
  });

  test("product override requires window only when returns allowed", () => {
    expect(
      normalizeProductReturnPolicyFields({
        returnPolicyMode: "override",
        returnAllowed: "true",
        returnWindowDays: "",
      }).valid
    ).toBe(false);

    expect(
      normalizeProductReturnPolicyFields({
        returnPolicyMode: "override",
        returnAllowed: "true",
        returnWindowDays: "12",
      })
    ).toMatchObject({
      valid: true,
      returnWindowDays: 12,
    });

    const noReturnsOverride = normalizeProductReturnPolicyFields({
      returnPolicyMode: "override",
      returnAllowed: "false",
      returnWindowDays: "",
    });
    expect(noReturnsOverride).toMatchObject({
      valid: true,
      returnAllowed: false,
    });
    expect(noReturnsOverride).not.toHaveProperty("returnWindowDays");
  });

  test("product inherit mode normalizes to null overrides", () => {
    expect(
      normalizeProductReturnPolicyFields({
        returnPolicyMode: "inherit",
      })
    ).toMatchObject({
      valid: true,
      returnPolicyMode: "inherit",
      returnAllowed: null,
      returnWindowDays: null,
      returnConditions: null,
    });
  });

  test("publish readiness with seller returnAllowed false", () => {
    expect(assertSellerReturnPolicyReady({ returnAllowed: false }).valid).toBe(true);
    expect(assertSellerReturnPolicyReady({}).valid).toBe(false);
  });
});
