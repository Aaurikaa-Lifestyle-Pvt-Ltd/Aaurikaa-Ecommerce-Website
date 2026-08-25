const mongoose = require("mongoose");
const { sanitizeShopperArrayFields } = require("../utils/sanitizeShopperArrays");

describe("sanitizeShopperArrayFields", () => {
  test("removes empty strings from compareList", () => {
    const shopper = {
      cart: [],
      wishlist: [],
      compareList: [""],
      markModified: jest.fn(),
    };

    const modified = sanitizeShopperArrayFields(shopper);

    expect(modified).toBe(true);
    expect(shopper.compareList).toEqual([]);
    expect(shopper.markModified).toHaveBeenCalledWith("compareList");
  });

  test("keeps valid compareList entries", () => {
    const productId = new mongoose.Types.ObjectId();
    const shopper = {
      cart: [],
      wishlist: [],
      compareList: [{ product: productId, addedAt: new Date() }],
      markModified: jest.fn(),
    };

    const modified = sanitizeShopperArrayFields(shopper);

    expect(modified).toBe(false);
    expect(shopper.compareList).toHaveLength(1);
  });
});
