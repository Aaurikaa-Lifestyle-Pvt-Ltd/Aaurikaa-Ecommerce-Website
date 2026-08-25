const mongoose = require("mongoose");

/**
 * Remove invalid entries from shopper cart, compareList, and wishlist.
 * Mutates the shopper document in place; call markModified when length changes.
 * @returns {boolean} true if any array was modified
 */
function sanitizeShopperArrayFields(shopper) {
  if (!shopper) return false;

  let modified = false;

  if (!Array.isArray(shopper.cart)) {
    shopper.cart = [];
    shopper.markModified("cart");
    modified = true;
  } else {
    const originalLength = shopper.cart.length;
    shopper.cart = shopper.cart.filter((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item) || item === "") {
        return false;
      }
      return item.product && mongoose.Types.ObjectId.isValid(item.product);
    });
    if (shopper.cart.length !== originalLength) {
      shopper.markModified("cart");
      modified = true;
    }
  }

  if (!Array.isArray(shopper.compareList)) {
    shopper.compareList = [];
    shopper.markModified("compareList");
    modified = true;
  } else {
    const originalLength = shopper.compareList.length;
    shopper.compareList = shopper.compareList.filter((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item) || item === "") {
        return false;
      }
      return item.product && mongoose.Types.ObjectId.isValid(item.product);
    });
    if (shopper.compareList.length !== originalLength) {
      shopper.markModified("compareList");
      modified = true;
    }
  }

  if (!Array.isArray(shopper.wishlist)) {
    shopper.wishlist = [];
    shopper.markModified("wishlist");
    modified = true;
  } else {
    const originalLength = shopper.wishlist.length;
    shopper.wishlist = shopper.wishlist.filter((item) => {
      if (!item || item === "" || typeof item === "string") {
        return false;
      }
      return mongoose.Types.ObjectId.isValid(item);
    });
    if (shopper.wishlist.length !== originalLength) {
      shopper.markModified("wishlist");
      modified = true;
    }
  }

  return modified;
}

module.exports = { sanitizeShopperArrayFields };
