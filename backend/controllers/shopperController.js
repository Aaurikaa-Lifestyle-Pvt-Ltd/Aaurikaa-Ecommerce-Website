const Shopper = require("../models/Shopper");
const Order = require("../models/Order");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const { sendRegistrationOTP, sendPasswordResetOTP, verifyOTP } = require("../utils/otpService");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");
const { normalizeVariantCombination, getVariantStock, getVariantPricing, getVariantMedia, productHasVariants, validateVariantCombination } = require("../utils/variantUtils");
const { addItemToShopperCart } = require("../services/cartAddService");
const { sanitizeShopperArrayFields } = require("../utils/sanitizeShopperArrays");

const SHOPPER_PROFILE_UPDATE_FIELDS = ["firstName", "lastName", "username", "phone"];

// ==============================================
// ✅ Shopper Auth Controllers
// ==============================================

// ➕ Register Shopper
exports.registerShopper = async (req, res) => {
  try {
    const { firstName, lastName, username, email, phone, password } = req.body;

    const existing = await Shopper.findOne({ $or: [{ email }, { username }] });
    if (existing) return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "❌ Email or username already exists", ERROR_CODES.RESOURCE_ALREADY_EXISTS);

    // Send OTP for registration verification
    const otpResult = await sendRegistrationOTP(email, 'shopper', `${firstName} ${lastName}`);

    if (!otpResult.success) {
      return res.status(400).json({
        message: otpResult.message,
        code: otpResult.code
      });
    }

    res.status(201).json({
      message: "✅ OTP sent to your email. Please verify to complete registration.",
      email,
      expiresAt: otpResult.expiresAt
    });
  } catch (err) {
    console.error("❌ Registration error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Server error", ERROR_CODES.INTERNAL_SERVER_ERROR);
  }
};

// ==============================
// ✅ Verify Shopper Registration OTP
// ==============================
exports.verifyShopperRegistration = async (req, res) => {
  try {
    const { firstName, lastName, username, email, phone, password, otp } = req.body;

    // Verify OTP
    const otpResult = await verifyOTP(email, otp, 'registration', 'shopper');

    if (!otpResult.success) {
      return res.status(400).json({
        message: otpResult.message,
        code: otpResult.code
      });
    }

    // Check if shopper already exists (double check)
    const existing = await Shopper.findOne({ $or: [{ email }, { username }] });
    if (existing) return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "❌ Email or username already exists", ERROR_CODES.RESOURCE_ALREADY_EXISTS);

    const hashed = await bcrypt.hash(password, 10);

    const shopper = new Shopper({
      firstName,
      lastName,
      username,
      email,
      phone,
      password: hashed,
      profileImage: req.file?.filename || "",
      role: "shopper",
    });

    await shopper.save();
    sendSuccessResponse(res, HTTP_STATUS.CREATED, "✅ Shopper registered and verified successfully");
  } catch (err) {
    console.error("❌ Verify registration error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Server error", ERROR_CODES.INTERNAL_SERVER_ERROR);
  }
};

// ==============================
// 📨 Resend Shopper Registration OTP
// ==============================
exports.resendRegistrationOTP = async (req, res) => {
  try {
    const { email, firstName, lastName } = req.body;

    if (!email) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "❌ Email is required", ERROR_CODES.INVALID_INPUT);
    }

    // Check if shopper is already registered
    const existing = await Shopper.findOne({ email });
    if (existing) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "❌ Email already registered. Please use password reset instead.", ERROR_CODES.RESOURCE_ALREADY_EXISTS);
    }

    // Get name from request body or use default
    const name = (firstName && lastName) ? `${firstName} ${lastName}` : 'User';

    // Resend registration OTP
    const otpResult = await sendRegistrationOTP(email, 'shopper', name);

    if (!otpResult.success) {
      return res.status(400).json({
        message: otpResult.message,
        code: otpResult.code
      });
    }

    res.json({
      message: "✅ OTP resent successfully",
      email,
      expiresAt: otpResult.expiresAt
    });
  } catch (err) {
    console.error("❌ Resend registration OTP error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Server error", ERROR_CODES.INTERNAL_SERVER_ERROR);
  }
};

// 🔐 Login Shopper
exports.loginShopper = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await Shopper.findOne({
      $or: [{ email: identifier }, { username: identifier }],
      role: "shopper",
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "❌ Invalid credentials" });
    }

    // Match seller JWT convention: AccountDropdown greets via decoded.name
    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.firstName || user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "✅ Login successful",
      token,
      shopper: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Server error", ERROR_CODES.INTERNAL_SERVER_ERROR);
  }
};

// 👤 Get Shopper Profile
exports.getShopperProfile = async (req, res) => {
  try {
    const shopper = await Shopper.findById(req.user.id).select("-password");
    if (!shopper) return res.status(404).json({ message: "❌ Shopper not found" });
    res.json({ shopper });
  } catch (err) {
    console.error("❌ Profile fetch error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Server error", ERROR_CODES.INTERNAL_SERVER_ERROR);
  }
};

// ✏️ Update Shopper Profile
exports.updateShopperProfile = async (req, res) => {
  try {
    const shopper = await Shopper.findById(req.user.id);
    if (!shopper) {
      return res.status(404).json({ message: "❌ Shopper not found" });
    }

    SHOPPER_PROFILE_UPDATE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        shopper[field] = req.body[field];
      }
    });

    if (req.file) {
      shopper.profileImage = req.file.filename;
    }

    if (req.body.password) {
      shopper.password = await bcrypt.hash(req.body.password, 10);
    }

    sanitizeShopperArrayFields(shopper);
    await shopper.save();

    const updatedShopper = shopper.toObject();
    delete updatedShopper.password;

    res.json({ message: "✅ Profile updated successfully", shopper: updatedShopper });
  } catch (err) {
    console.error("❌ Profile update error:", err);
    res.status(500).json({ message: "❌ Failed to update profile" });
  }
};

// 📦 Get Orders of Logged-in Shopper — use shopperOrderController.listShopperOrders via routes
exports.getShopperOrders = require("./shopperOrderController").listShopperOrders;

// 📊 Get Shopper Dashboard Statistics
exports.getShopperDashboardStats = async (req, res) => {
  try {
    const shopperId = req.user.id;

    // Get active orders count
    const activeOrders = await Order.countDocuments({
      buyer: shopperId,
      status: { $in: ['pending', 'processing', 'shipped'] }
    });

    // Get wishlist items count
    const shopper = await Shopper.findById(shopperId).populate('wishlist');
    const wishlistCount = shopper.wishlist ? shopper.wishlist.length : 0;

    // Get total spent
    const totalSpentResult = await Order.aggregate([
      { $match: { buyer: shopperId, status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalSpent = totalSpentResult.length > 0 ? totalSpentResult[0].total : 0;

    // Get recent orders (last 5)
    const recentOrders = await Order.find({ buyer: shopperId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('items.product', 'name image')
      .select('orderNumber status totalAmount createdAt');

    res.json({
      activeOrders,
      wishlistCount,
      totalSpent,
      recentOrders
    });
  } catch (err) {
    console.error("❌ Error fetching dashboard stats:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch dashboard statistics" });
  }
};

// 🔐 Reset Password via OTP
exports.resetPasswordWithOTP = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "❌ Passwords do not match" });
    }

    // Verify OTP using the new OTP service
    const otpResult = await verifyOTP(email, otp, 'password_reset', 'shopper');

    if (!otpResult.success) {
      return res.status(400).json({
        message: otpResult.message,
        code: otpResult.code
      });
    }

    // Find and update shopper password
    const shopper = await Shopper.findOne({ email });
    if (!shopper) {
      return res.status(404).json({ message: "❌ Shopper not found" });
    }

    // Clean invalid cart/compare/wishlist entries before saving password
    sanitizeShopperArrayFields(shopper);

    shopper.password = await bcrypt.hash(newPassword, 10);
    await shopper.save();

    res.json({ message: "✅ Password reset successfully" });
  } catch (err) {
    console.error("❌ Reset password error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Server error", ERROR_CODES.INTERNAL_SERVER_ERROR);
  }
};

// ==============================================
// 🔧 Admin Shopper Management
// ==============================================

// 🔍 Get All Shoppers
exports.getAllShoppers = async (req, res) => {
  try {
    const shoppers = await Shopper.find({ role: "shopper" }).sort({ createdAt: -1 });
    res.json(shoppers);
  } catch (err) {
    console.error("❌ Fetch shoppers error:", err);
    res.status(500).json({ message: "❌ Failed to fetch shoppers" });
  }
};

// ➕ Create Shopper (Admin)
exports.createShopper = async (req, res) => {
  try {
    const { firstName, lastName, username, email, phone, password } = req.body;

    const existing = await Shopper.findOne({ $or: [{ email }, { username }] });
    if (existing) return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "❌ Email or username already exists", ERROR_CODES.RESOURCE_ALREADY_EXISTS);

    const hashed = await bcrypt.hash(password, 10);

    const newShopper = new Shopper({
      firstName,
      lastName,
      username,
      email,
      phone,
      password: hashed,
      profileImage: req.file?.filename || "",
      role: "shopper",
    });

    await newShopper.save();
    res.status(201).json({ message: "✅ Shopper created successfully" });
  } catch (err) {
    console.error("❌ Error creating shopper:", err);
    res.status(500).json({ message: "❌ Failed to create shopper" });
  }
};

// ✏️ Update Shopper (Admin)
exports.updateShopper = async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (req.file?.filename) updateData.profileImage = req.file.filename;
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const updated = await Shopper.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!updated) return res.status(404).json({ message: "❌ Shopper not found" });

    res.json({ message: "✅ Shopper updated successfully", shopper: updated });
  } catch (err) {
    console.error("❌ Error updating shopper:", err);
    res.status(500).json({ message: "❌ Failed to update shopper" });
  }
};

// 🗑️ Delete Shopper (Admin)
exports.deleteShopper = async (req, res) => {
  try {
    const deleted = await Shopper.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "❌ Shopper not found" });

    res.json({ message: "✅ Shopper deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting shopper:", err);
    res.status(500).json({ message: "❌ Failed to delete shopper" });
  }
};

// (Optional) Get Profile by ID
exports.getShopperProfileById = async (req, res) => {
  try {
    const shopper = await Shopper.findById(req.userId);
    if (!shopper) return res.status(404).json({ message: "❌ Shopper not found" });
    res.json({ shopper });
  } catch (err) {
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Server error", ERROR_CODES.INTERNAL_SERVER_ERROR);
  }
};

// ==============================================
// 📩 OTP System (Send + Verify)
// ==============================================

let otpStore = {}; // In-memory OTP store (can be moved to DB or Redis)

// 📨 Send OTP for Password Reset
exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "❌ Email is required" });

    // Check if shopper exists
    const shopper = await Shopper.findOne({ email });
    if (!shopper) {
      return res.status(404).json({ message: "❌ Shopper not found" });
    }

    // Send password reset OTP using the new OTP service
    const otpResult = await sendPasswordResetOTP(email, 'shopper', `${shopper.firstName} ${shopper.lastName}`);

    if (!otpResult.success) {
      return res.status(400).json({
        message: otpResult.message,
        code: otpResult.code
      });
    }

    res.json({
      message: "✅ OTP sent successfully",
      expiresAt: otpResult.expiresAt
    });
  } catch (err) {
    console.error("❌ Send OTP error:", err);
    res.status(500).json({ message: "❌ Failed to send OTP" });
  }
};

// ✅ Verify OTP
exports.verifyOTP = (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore[email];

  if (!record || record.otp !== otp || record.expiresAt < Date.now()) {
    return res.status(400).json({ message: "❌ Invalid or expired OTP" });
  }

  delete otpStore[email];
  res.json({ message: "✅ OTP verified successfully" });
};

// ==============================================
// ❤️ Shopper Wishlist Controllers
// ==============================================

// 📄 Get Wishlist
exports.getWishlist = async (req, res) => {
  try {
    const shopper = await Shopper.findById(req.user.id).populate("wishlist");
    if (!shopper) return res.status(404).json({ message: "❌ Shopper not found" });
    res.json(shopper.wishlist);
  } catch (err) {
    console.error("❌ Wishlist fetch error:", err);
    res.status(500).json({ message: "❌ Failed to fetch wishlist" });
  }
};

// ➕ Add to Wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const shopper = await Shopper.findById(req.user.id);
    if (!shopper) return res.status(404).json({ message: "❌ Shopper not found" });

    if (!shopper.wishlist.some(item => item.toString() === productId)) {
      shopper.wishlist.push(productId);
      await shopper.save();
    }
    const updatedShopper = await Shopper.findById(req.user.id).populate("wishlist");
    res.json({ message: "✅ Product added to wishlist", wishlist: updatedShopper.wishlist });
  } catch (err) {
    console.error("❌ Add to wishlist error:", err);
    res.status(500).json({ message: "❌ Failed to add to wishlist" });
  }
};

// 🗑️ Remove from Wishlist
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const shopper = await Shopper.findById(req.user.id);
    if (!shopper) return res.status(404).json({ message: "❌ Shopper not found" });

    shopper.wishlist = shopper.wishlist.filter((item) => item.toString() !== productId);
    await shopper.save();

    const updatedShopper = await Shopper.findById(req.user.id).populate("wishlist");
    res.json({ message: "✅ Product removed from wishlist", wishlist: updatedShopper.wishlist });
  } catch (err) {
    console.error("❌ Remove from wishlist error:", err);
    res.status(500).json({ message: "❌ Failed to remove from wishlist" });
  }
};

// ==============================================
// 🛒 Shopper Cart Controllers
// ==============================================

// 📄 Get Cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID not found in token."
      });
    }

    // Performance optimization: Only populate fields required for cart rendering
    // Includes bulkDiscount for frontend bulk pricing calculations, variantPricing for variant price resolution, variantMedia for variant image fallback, and variants for validation
    const shopper = await Shopper.findById(userId).populate({
      path: "cart.product",
      select: "name mainImage regularPrice salePrice stock sku weight bulkDiscount variantPricing variantMedia variants taxIncluded taxRate"
    });
    if (!shopper) {
      return res.status(404).json({
        success: false,
        message: "Shopper not found."
      });
    }

    // Ensure cart is initialized as an array
    if (!Array.isArray(shopper.cart)) {
      shopper.cart = [];
    }

    // Clean up invalid cart items:
    // 1. Items with missing or null products
    // 2. Items with variant products that are missing variant selection
    let validCartItems = shopper.cart.filter(item =>
      item &&
      item.product &&
      (mongoose.Types.ObjectId.isValid(item.product) ||
        (typeof item.product === 'object' && item.product._id && mongoose.Types.ObjectId.isValid(item.product._id)))
    );

    // Additional validation: Remove items with variant products that are missing variant selection
    const itemsBeforeVariantValidation = validCartItems.length;
    validCartItems = validCartItems.filter(item => {
      // Only check if product is populated as an object
      if (!item.product || typeof item.product !== 'object' || !item.product._id) {
        return true; // Keep items with unpopulated products (will be handled by normalizeCartItems)
      }

      // Check if product has variants
      const hasVariants = productHasVariants(item.product);

      // If product has variants, variantKey and variantCombination are required
      if (hasVariants) {
        if (!item.variantKey || !item.variantCombination) {
          // Invalid item: product has variants but missing variant selection
          console.warn(`⚠️ Removing invalid cart item: Product ${item.product._id} has variants but missing variant selection`);
          return false;
        }

        // Validate variantCombination against product's actual variant definitions
        const validation = validateVariantCombination(item.product, item.variantCombination);
        if (!validation.valid) {
          console.warn(`⚠️ Removing invalid cart item: Product ${item.product._id} has invalid variant combination - ${validation.error}`);
          return false;
        }
      }

      return true;
    });

    // If we found invalid items, clean them up and save
    if (validCartItems.length !== shopper.cart.length || itemsBeforeVariantValidation !== validCartItems.length) {
      shopper.cart = validCartItems;
      await shopper.save();
    }

    // Normalize cart items to match guest cart structure exactly:
    // - Ensure product is populated (object, not just ID)
    // - Normalize qty → quantity
    // - Include all variant fields if they exist
    const normalizedItems = normalizeCartItems(validCartItems);

    return res.json({
      success: true,
      cart: { items: normalizedItems }
    });
  } catch (err) {
    console.error("❌ Cart fetch error:", err);
    return res.status(500).json({
      success: false,
      message: "❌ Failed to fetch cart. Please try again."
    });
  }
};

// Helper function to normalize cart items to match guest cart structure exactly
// Ensures: product is populated object, quantity (not qty), and all variant fields are included
function normalizeCartItems(cartItems) {
  return cartItems
    .map(item => {
      // Ensure product is an object (should already be populated, but double-check)
      if (!item || !item.product) {
        return null; // Filter out invalid items
      }

      // Handle both ObjectId and populated product objects
      const product = typeof item.product === 'object' && item.product._id
        ? item.product
        : null;

      if (!product) {
        return null; // Filter out items with unpopulated products
      }

      // Build normalized item matching guest cart structure
      const normalizedItem = {
        product: product, // Already populated
        quantity: item.quantity || item.qty || 1, // Normalize qty → quantity
      };

      // Add variant fields if they exist
      if (item.variantKey !== null && item.variantKey !== undefined) {
        normalizedItem.variantKey = item.variantKey;
      }
      if (item.variantCombination !== null && item.variantCombination !== undefined) {
        normalizedItem.variantCombination = item.variantCombination;
      }
      if (item.variantPriceSnapshot !== null && item.variantPriceSnapshot !== undefined) {
        normalizedItem.variantPriceSnapshot = item.variantPriceSnapshot;
      }
      // Include stored variant/product image; for legacy items without image, resolve from product.variantMedia if variant
      if (item.image) {
        normalizedItem.image = item.image;
      } else if (item.variantKey && item.variantCombination && product.variantMedia) {
        const variantMedia = getVariantMedia(product, item.variantCombination);
        normalizedItem.image = (variantMedia && variantMedia.mainImage) ? variantMedia.mainImage : (product.mainImage || undefined);
      } else if (product.mainImage) {
        normalizedItem.image = product.mainImage;
      }

      return normalizedItem;
    })
    .filter(Boolean); // Remove any null items
}

// Helper function to match cart items by productId + variantKey
function findCartItemIndex(cart, productId, variantKey) {
  return cart.findIndex(item => {
    if (!item || !item.product) return false;
    const itemProductId = item.product._id ? item.product._id.toString() : item.product.toString();
    if (itemProductId !== String(productId)) return false;

    // If variantKey provided, match by variantKey; otherwise match legacy items (no variantKey)
    if (variantKey) {
      return item.variantKey === variantKey;
    } else {
      // Legacy item: no variantKey or empty variantKey
      return !item.variantKey || item.variantKey === '';
    }
  });
}

// ➕ Add to Cart
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity, variantCombination } = req.body;
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID not found in token.",
      });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    const shopper = await Shopper.findById(userId);
    if (!shopper) {
      return res.status(404).json({
        success: false,
        message: "Shopper not found.",
      });
    }

    sanitizeShopperArrayFields(shopper);

    const result = await addItemToShopperCart(shopper, {
      productId,
      quantity,
      variantCombination,
    });

    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        success: false,
        message: result.message,
      });
    }

    await shopper.save();

    await shopper.populate({
      path: "cart.product",
      select: "name mainImage regularPrice salePrice stock sku weight bulkDiscount variantPricing variants taxIncluded taxRate",
    });

    return res.json({
      success: true,
      message: "✅ Product added to cart",
      cart: { items: shopper.cart },
    });
  } catch (err) {
    console.error("❌ Add to cart error:", err);
    return res.status(500).json({
      success: false,
      message: "❌ Failed to add to cart. Please try again.",
    });
  }
};

// ✏️ Update Cart Quantity
exports.updateCartQuantity = async (req, res) => {
  try {
    const { productId, quantity, variantKey } = req.body;
    const userId = req.user.id;

    // Validate userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID not found in token."
      });
    }

    // Validate productId
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required."
      });
    }

    // Validate productId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format."
      });
    }

    // Validate quantity
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive number (minimum 1)."
      });
    }

    // Find shopper
    const shopper = await Shopper.findById(userId);
    if (!shopper) {
      return res.status(404).json({
        success: false,
        message: "Shopper not found."
      });
    }

    // Ensure cart is initialized as an array
    if (!Array.isArray(shopper.cart)) {
      shopper.cart = [];
    }

    // Find cart item by productId + variantKey (or productId only for legacy items)
    const itemIndex = findCartItemIndex(shopper.cart, productId, variantKey || null);

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found in cart."
      });
    }

    const cartItem = shopper.cart[itemIndex];

    // Verify product exists and get stock information
    const Product = require("../models/Product");
    const product = await Product.findById(productId).select("stock name weight variants variantStock");
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found."
      });
    }

    // Phase 4: Stock Enforcement Hardening
    const hasVariants = productHasVariants(product);
    let availableStock = null;

    if (hasVariants) {
      // Variant products: variant stock is mandatory
      if (!cartItem.variantKey || !cartItem.variantCombination) {
        return res.status(400).json({
          success: false,
          message: "This product requires variant selection. Please remove this item and add it again with variant selection."
        });
      }

      const variantStock = getVariantStock(product, cartItem.variantCombination);
      if (variantStock === null) {
        return res.status(400).json({
          success: false,
          message: `Stock information not available for selected variant. Please remove this item and select a different variant.`
        });
      }
      availableStock = variantStock;
    } else {
      // Non-variant products: use product-level stock
      availableStock = product.stock;
    }

    // Validate stock availability
    if (qty > availableStock) {
      const variantMessage = hasVariants ? ' for selected variant' : '';
      return res.status(400).json({
        success: false,
        message: `Only ${availableStock} items available in stock${variantMessage} for ${product.name}. Please reduce quantity or select a different variant.`
      });
    }

    // Update quantity directly (not increment)
    shopper.cart[itemIndex].quantity = qty;

    await shopper.save();

    // Performance optimization: Populate directly on existing shopper instance instead of re-fetching
    // Only populate fields required for cart rendering to minimize payload size
    // Includes bulkDiscount for frontend bulk pricing calculations
    await shopper.populate({
      path: "cart.product",
      select: "name mainImage regularPrice salePrice stock sku weight bulkDiscount variantPricing variants taxIncluded taxRate"
    });

    return res.json({
      success: true,
      message: "✅ Cart quantity updated",
      cart: { items: shopper.cart }
    });
  } catch (err) {
    console.error("❌ Update cart quantity error:", err);
    return res.status(500).json({
      success: false,
      message: "❌ Failed to update cart quantity. Please try again."
    });
  }
};

// 🗑️ Remove from Cart
exports.removeFromCart = async (req, res) => {
  try {
    const { productId, variantKey } = req.body;
    const userId = req.user.id;

    // Validate userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID not found in token."
      });
    }

    // Validate productId
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required."
      });
    }

    // Validate productId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format."
      });
    }

    const shopper = await Shopper.findById(userId);
    if (!shopper) {
      return res.status(404).json({
        success: false,
        message: "Shopper not found."
      });
    }

    // Ensure cart is initialized as an array
    if (!Array.isArray(shopper.cart)) {
      shopper.cart = [];
    }

    // Remove item from cart by productId + variantKey (or productId only for legacy items)
    // If variantKey provided, remove only that variant; otherwise remove legacy item (backward compatibility)
    const targetVariantKey = variantKey || null;
    shopper.cart = shopper.cart.filter(item => {
      if (!item || !item.product) return true; // Keep items with missing products (will be cleaned up elsewhere)
      // Handle both ObjectId and populated product objects
      const itemProductId = item.product._id ? item.product._id.toString() : item.product.toString();
      if (itemProductId !== String(productId)) return true;

      // If variantKey provided, match by variantKey; otherwise match legacy items
      if (targetVariantKey) {
        return item.variantKey !== targetVariantKey;
      } else {
        // Legacy behavior: remove item if it has no variantKey or empty variantKey
        return item.variantKey && item.variantKey !== '';
      }
    });

    await shopper.save();

    // Performance optimization: Populate directly on existing shopper instance instead of re-fetching
    // Only populate fields required for cart rendering to minimize payload size
    // Includes bulkDiscount for frontend bulk pricing calculations
    await shopper.populate({
      path: "cart.product",
      select: "name mainImage regularPrice salePrice stock sku weight bulkDiscount variantPricing variants taxIncluded taxRate"
    });

    return res.json({
      success: true,
      message: "✅ Product removed from cart",
      cart: { items: shopper.cart }
    });
  } catch (err) {
    console.error("❌ Remove from cart error:", err);
    return res.status(500).json({
      success: false,
      message: "❌ Failed to remove from cart. Please try again."
    });
  }
};

// 🗑️ Clear Entire Cart
exports.clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID not found in token."
      });
    }

    const shopper = await Shopper.findById(userId);
    if (!shopper) {
      return res.status(404).json({
        success: false,
        message: "Shopper not found."
      });
    }

    // Clear the entire cart
    shopper.cart = [];
    await shopper.save();

    return res.json({
      success: true,
      message: "✅ Cart cleared successfully",
      cart: { items: [] }
    });
  } catch (err) {
    console.error("❌ Clear cart error:", err);
    return res.status(500).json({
      success: false,
      message: "❌ Failed to clear cart. Please try again."
    });
  }
};

// Get shopper's compare list
exports.getCompareList = async (req, res) => {
  try {
    const shopperId = req.user.id;

    const shopper = await Shopper.findById(shopperId).populate('compareList.product', 'name price salePrice mainImage image features stock');

    if (!shopper) {
      return res.status(404).json({ message: "❌ Shopper not found" });
    }

    sanitizeShopperArrayFields(shopper);
    if (shopper.isModified("compareList") || shopper.isModified("cart") || shopper.isModified("wishlist")) {
      await shopper.save();
    }

    res.json({
      success: true,
      compareList: shopper.compareList || []
    });
  } catch (error) {
    console.error("Error fetching compare list:", error);
    res.status(500).json({ message: "❌ Server error", error: error.message });
  }
};

// Add product to compare list
exports.addToCompare = async (req, res) => {
  try {
    const shopperId = req.user.id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "❌ Product ID is required" });
    }

    const shopper = await Shopper.findById(shopperId);
    if (!shopper) {
      return res.status(404).json({ message: "❌ Shopper not found" });
    }

    sanitizeShopperArrayFields(shopper);

    // Check if product already in compare list
    const existingItem = shopper.compareList.find(
      (item) => item?.product && item.product.toString() === productId
    );
    if (existingItem) {
      return res.status(400).json({ message: "❌ Product already in compare list" });
    }

    // Check compare list limit (max 4 products)
    if (shopper.compareList.length >= 4) {
      return res.status(400).json({ message: "❌ Compare list is full (maximum 4 products)" });
    }

    // Add product to compare list
    shopper.compareList.push({ product: productId, addedAt: new Date() });
    await shopper.save();

    // Populate the added product
    await shopper.populate('compareList.product', 'name price salePrice mainImage image features stock');

    res.json({
      success: true,
      message: "✅ Product added to compare list",
      compareList: shopper.compareList
    });
  } catch (error) {
    console.error("Error adding to compare list:", error);
    res.status(500).json({ message: "❌ Server error", error: error.message });
  }
};

// Remove product from compare list
exports.removeFromCompare = async (req, res) => {
  try {
    const shopperId = req.user.id;
    const { productId } = req.params;

    if (!productId || productId === "undefined" || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "❌ Valid product ID is required" });
    }

    const shopper = await Shopper.findById(shopperId);
    if (!shopper) {
      return res.status(404).json({ message: "❌ Shopper not found" });
    }

    // Remove product from compare list
    sanitizeShopperArrayFields(shopper);
    shopper.compareList = shopper.compareList.filter(
      (item) => item?.product && item.product.toString() !== productId
    );
    await shopper.save();

    res.json({
      success: true,
      message: "✅ Product removed from compare list",
      compareList: shopper.compareList
    });
  } catch (error) {
    console.error("Error removing from compare list:", error);
    res.status(500).json({ message: "❌ Server error", error: error.message });
  }
};

// Clear compare list
exports.clearCompareList = async (req, res) => {
  try {
    const shopperId = req.user.id;

    const shopper = await Shopper.findById(shopperId);
    if (!shopper) {
      return res.status(404).json({ message: "❌ Shopper not found" });
    }

    // Clear compare list
    shopper.compareList = [];
    await shopper.save();

    res.json({
      success: true,
      message: "✅ Compare list cleared",
      compareList: []
    });
  } catch (error) {
    console.error("Error clearing compare list:", error);
    res.status(500).json({ message: "❌ Server error", error: error.message });
  }
};
