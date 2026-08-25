const {
  normalizeProductTagsForWrite,
  hasTagsField,
} = require("../../utils/productTags");

describe("normalizeProductTagsForWrite", () => {
  it("returns empty array for nullish and empty string", () => {
    expect(normalizeProductTagsForWrite(null)).toEqual([]);
    expect(normalizeProductTagsForWrite(undefined)).toEqual([]);
    expect(normalizeProductTagsForWrite("")).toEqual([]);
  });

  it("splits comma-separated strings and dedupes case-insensitively", () => {
    expect(normalizeProductTagsForWrite("Robot Toy, robot toy, RC Car")).toEqual([
      "Robot Toy",
      "RC Car",
    ]);
  });

  it("flattens mixed full-string and split array entries (corruption pattern)", () => {
    const corrupted = [
      "robot toy, remote car, wonder jeep",
      "robot toy",
      "remote car",
      "wonder jeep",
    ];
    expect(normalizeProductTagsForWrite(corrupted)).toEqual([
      "robot toy",
      "remote car",
      "wonder jeep",
    ]);
  });

  it("dedupes array elements without comma splitting", () => {
    expect(normalizeProductTagsForWrite(["tag1", "Tag1", "tag2"])).toEqual([
      "tag1",
      "tag2",
    ]);
  });
});

describe("hasTagsField", () => {
  it("detects explicit tags property including empty", () => {
    expect(hasTagsField({ tags: "" })).toBe(true);
    expect(hasTagsField({ tags: ["a"] })).toBe(true);
    expect(hasTagsField({ name: "x" })).toBe(false);
  });
});
