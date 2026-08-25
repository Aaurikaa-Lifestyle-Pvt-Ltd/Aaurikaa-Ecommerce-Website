const {
  validateReturnReason,
  validateEvidence,
} = require("../../services/returnRequestService");

describe("returnRequestService Need Help intake validation", () => {
  const originalR2 = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  const buyerId = "507f1f77bcf86cd799439011";
  const orderId = "507f1f77bcf86cd799439012";
  const platformBase = "https://cdn.example.com";

  beforeAll(() => {
    process.env.CLOUDFLARE_R2_PUBLIC_URL = platformBase;
  });

  afterAll(() => {
    process.env.CLOUDFLARE_R2_PUBLIC_URL = originalR2;
  });

  function platformEvidence(file = "a.jpg") {
    return {
      url: `${platformBase}/returns/evidence/${buyerId}/${orderId}/${file}`,
      mediaType: "image",
      fileName: file,
    };
  }

  it("accepts issueCategory and description", () => {
    expect(
      validateReturnReason({
        issueCategory: "DEFECTIVE_DAMAGED",
        description: "Broken zipper",
      })
    ).toMatchObject({
      valid: true,
      reasonCode: "DEFECTIVE_DAMAGED",
      issueCategory: "DEFECTIVE_DAMAGED",
      reasonText: "Broken zipper",
    });
  });

  it("requires description for OTHER", () => {
    expect(
      validateReturnReason({
        issueCategory: "OTHER",
        description: "",
      })
    ).toMatchObject({ valid: false });
  });

  it("keeps legacy reasonCode compatible", () => {
    expect(
      validateReturnReason({
        reasonCode: "WRONG_ITEM",
        reasonText: "Got blue instead of red",
      })
    ).toMatchObject({
      valid: true,
      issueCategory: "WRONG_ITEM",
      reasonCode: "WRONG_ITEM",
    });
  });

  it("requires at least one evidence file", () => {
    expect(validateEvidence([])).toMatchObject({
      valid: false,
      message:
        "Please upload at least one photo or video before submitting your request.",
    });
    expect(validateEvidence(null)).toMatchObject({ valid: false });
    expect(validateEvidence(undefined)).toMatchObject({ valid: false });
  });

  it("accepts platform-managed evidence refs", () => {
    expect(
      validateEvidence([platformEvidence()], { buyerId, orderId }).valid
    ).toBe(true);
  });

  it("rejects arbitrary external evidence URLs", () => {
    expect(
      validateEvidence(
        [
          {
            url: "https://evil.example/a.jpg",
            mediaType: "image",
            fileName: "a.jpg",
          },
        ],
        { buyerId, orderId }
      ).valid
    ).toBe(false);
  });

  it("rejects evidence that does not belong to the order", () => {
    expect(
      validateEvidence(
        [
          {
            url: `${platformBase}/returns/evidence/other-buyer/${orderId}/a.jpg`,
            mediaType: "image",
          },
        ],
        { buyerId, orderId }
      ).valid
    ).toBe(false);
  });

  it("rejects invalid evidence refs", () => {
    expect(
      validateEvidence([{ url: "not-a-url", mediaType: "image" }], {
        buyerId,
        orderId,
      }).valid
    ).toBe(false);
  });
});
