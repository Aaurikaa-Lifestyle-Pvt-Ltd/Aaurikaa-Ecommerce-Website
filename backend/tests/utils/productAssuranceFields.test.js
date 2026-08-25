const {
  pickAssuranceWriteFields,
  stripFlatAssuranceAliases,
  attachPublicProductAssurance,
  attachProductOccasions,
  normalizeManufacturerConditions,
} = require("../../utils/productAssuranceFields");

describe("productAssuranceFields (WS-3 / 1.4)", () => {
  test("omits keys when body has no assurance input (update-safe)", () => {
    expect(pickAssuranceWriteFields({})).toEqual({});
    expect(pickAssuranceWriteFields({ name: "X" })).toEqual({});
  });

  test("normalizes genuineProduct boolean from string", () => {
    expect(pickAssuranceWriteFields({ genuineProduct: "true" })).toEqual({
      genuineProduct: true,
    });
    expect(pickAssuranceWriteFields({ genuineProduct: "false" })).toEqual({
      genuineProduct: false,
    });
  });

  test("normalizes warranty from nested JSON string and flat aliases", () => {
    const fromJson = pickAssuranceWriteFields({
      warranty: JSON.stringify({
        available: true,
        duration: "12 months",
        coverage: "Manufacturing defects",
        terms: "Keep invoice.",
      }),
    });
    expect(fromJson.warranty).toEqual({
      available: true,
      duration: "12 months",
      coverage: "Manufacturing defects",
      terms: "Keep invoice.",
    });

    const fromFlat = pickAssuranceWriteFields({
      warrantyAvailable: true,
      warrantyDuration: "1 year",
      warrantyCoverage: "Parts",
      warrantyTerms: "T&C",
    });
    expect(fromFlat.warranty.available).toBe(true);
    expect(fromFlat.warranty.duration).toBe("1 year");
  });

  test("normalizes manufacturer conditions from flat aliases", () => {
    const fields = pickAssuranceWriteFields({
      manufacturerSummary: "Use as directed",
      manufacturerDetails: "Do not ingest.",
      manufacturerCountryOfOrigin: "India",
      manufacturerMarketedBy: "AAURIKAA",
      manufacturerGrievanceRedressal: "support@example.com",
    });
    expect(fields.manufacturerConditions).toEqual({
      summary: "Use as directed",
      details: "Do not ingest.",
      countryOfOrigin: "India",
      marketedBy: "AAURIKAA",
      grievanceRedressal: "support@example.com",
    });
  });

  test("normalizes manufacturer conditions from short flat aliases and nested JSON", () => {
    const fromShort = normalizeManufacturerConditions({
      countryOfOrigin: "India",
      marketedBy: "Brand Co",
      grievanceRedressal: "Call 1800",
      manufacturerSummary: "S",
      manufacturerDetails: "D",
    });
    expect(fromShort).toEqual({
      summary: "S",
      details: "D",
      countryOfOrigin: "India",
      marketedBy: "Brand Co",
      grievanceRedressal: "Call 1800",
    });

    const fromNested = pickAssuranceWriteFields({
      manufacturerConditions: JSON.stringify({
        summary: "Sum",
        details: "Det",
        countryOfOrigin: "IN",
        marketedBy: "Mkt",
        grievanceRedressal: "GR",
      }),
    });
    expect(fromNested.manufacturerConditions).toEqual({
      summary: "Sum",
      details: "Det",
      countryOfOrigin: "IN",
      marketedBy: "Mkt",
      grievanceRedressal: "GR",
    });
  });

  test("clips manufacturer enrichment fields to maxlength", () => {
    const long = "x".repeat(600);
    const longer = "y".repeat(5000);
    const detailsOversized = "z".repeat(100001);
    const result = normalizeManufacturerConditions({
      countryOfOrigin: long,
      marketedBy: long,
      grievanceRedressal: longer,
      manufacturerDetails: detailsOversized,
    });
    expect(result.countryOfOrigin).toHaveLength(500);
    expect(result.marketedBy).toHaveLength(500);
    expect(result.grievanceRedressal).toHaveLength(4000);
    expect(result.details).toHaveLength(100000);
  });

  test("strips flat aliases from payload including new manufacturer aliases", () => {
    const payload = {
      name: "P",
      warrantyDuration: "1y",
      manufacturerSummary: "S",
      countryOfOrigin: "India",
      marketedBy: "X",
      grievanceRedressal: "Y",
      manufacturerCountryOfOrigin: "IN",
    };
    stripFlatAssuranceAliases(payload);
    expect(payload).toEqual({ name: "P" });
  });

  test("attachPublicProductAssurance adds effectiveReturnPolicy without throwing on empty seller", () => {
    const product = {
      returnPolicyMode: "inherit",
      seller: { shopName: "Shop", returnAllowed: true, returnWindowDays: 7, returnConditions: "Unopened" },
    };
    attachPublicProductAssurance(product);
    expect(product.effectiveReturnPolicy.configured).toBe(true);
    expect(product.effectiveReturnPolicy.returnAllowed).toBe(true);
    expect(product.effectiveReturnPolicy.returnWindowDays).toBe(7);
  });

  test("existing products without assurance data stay omitted on write", () => {
    expect(pickAssuranceWriteFields({ deliveryTime: "3-5 days" })).toEqual({});
  });

  test("attachProductOccasions sets empty array when no product id", async () => {
    const product = { name: "X" };
    await attachProductOccasions(product, {
      find: () => {
        throw new Error("should not query");
      },
    });
    expect(product.occasions).toEqual([]);
  });

  test("attachProductOccasions maps active Occasion name/slug only", async () => {
    const product = { _id: "prod1" };
    const mockFind = jest.fn().mockReturnValue({
      select: () => ({
        sort: () => ({
          lean: async () => [
            { name: "Wedding", slug: "wedding" },
            { name: "Festive", slug: "festive" },
          ],
        }),
      }),
    });
    await attachProductOccasions(product, { find: mockFind });
    expect(mockFind).toHaveBeenCalledWith({
      isActive: true,
      productIds: "prod1",
    });
    expect(product.occasions).toEqual([
      { name: "Wedding", slug: "wedding" },
      { name: "Festive", slug: "festive" },
    ]);
  });
});
