const {
  sanitizePdfText,
  sanitizeSeller,
  pdfEmptyCell,
} = require("../../utils/pdfTextSanitizer");

describe("pdfTextSanitizer", () => {
  test("removes emoji and keeps ASCII company name", () => {
    const raw = "\u{1F4DE}+91 915 356 1076";
    expect(sanitizePdfText(raw, { allowNewlines: false })).toBe("+91 915 356 1076");
  });

  test("replaces em dash with hyphen", () => {
    expect(sanitizePdfText("NA\u2014value")).toBe("NA-value");
  });

  test("sanitizeSeller strips icons from footer fields", () => {
    const s = sanitizeSeller({
      companyName: "\u{1F3EA}AnBazar",
      phone: "\u{1F4DE} +91 915 356 1076",
      email: "\u{1F4E7} support@test.in",
      address: "Line 1",
      gstin: "29abc1234f1z5",
    });
    expect(s.companyName).toBe("AnBazar");
    expect(s.phone).toMatch(/\+91/);
    expect(s.email).toContain("support@test.in");
    expect(s.gstin).toBe("29ABC1234F1Z5");
  });

  test("pdfEmptyCell is ASCII", () => {
    expect(pdfEmptyCell()).toBe("NA");
  });
});
