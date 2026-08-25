const { normalizeProductTagsForWrite } = require("../../utils/productTags");

describe("tagController getAllUniqueTags normalization", () => {
  it("flattens comma-separated distinct values into deduped canonical tags", () => {
    const productTags = [
      "robot toy, remote car, wonder jeep, kids vehicle, super tots, anbazar",
      "robot toy",
      "remote car",
    ];
    const blogTags = ["anbazar", "blog tag"];
    const allTags = normalizeProductTagsForWrite([...productTags, ...blogTags]);
    expect(allTags).toEqual([
      "robot toy",
      "remote car",
      "wonder jeep",
      "kids vehicle",
      "super tots",
      "anbazar",
      "blog tag",
    ]);
  });
});
