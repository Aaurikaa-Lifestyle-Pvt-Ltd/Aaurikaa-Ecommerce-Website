const express = require("express");
const router = express.Router();

// 🧠 Import controllers & middlewares
const shopperController = require("../controllers/shopperController");
const googleShopperAuthController = require("../controllers/googleShopperAuthController");
const verifyShopper = require("../middleware/verifyShopper");
const { upload, handleUploadError } = require("../middleware/shopperUpload");
const { validateShopperRegistration } = require("../middleware/validateRegistration");

// ================================
// 🛡️ Shopper Authentication
// ================================

// 🔐 Google Sign-In (ID token) + password-proven link for existing email accounts
router.post("/google", googleShopperAuthController.googleAuth);
router.post("/google/link", googleShopperAuthController.linkGoogleAccount);

// 📝 Register Shopper (with profile image)
router.post("/register", upload, handleUploadError, validateShopperRegistration, shopperController.registerShopper);

// ✅ Verify Shopper Registration OTP
router.post("/verify-registration", upload, handleUploadError, validateShopperRegistration, shopperController.verifyShopperRegistration);

// 📨 Resend Shopper Registration OTP
router.post("/resend-registration-otp", shopperController.resendRegistrationOTP);

// 🔐 Login Shopper
router.post("/login", shopperController.loginShopper);

// 📩 Send OTP (for password reset)
router.post("/send-otp", shopperController.sendOTP);

// ✅ Verify OTP
router.post("/verify-otp", shopperController.verifyOTP);

// 🔑 Reset Password using OTP
router.post("/reset-password", shopperController.resetPasswordWithOTP);

// ================================
// 👤 Shopper Profile
// ================================

// 📄 Get Profile (Protected)
router.get("/profile", verifyShopper, shopperController.getShopperProfile);

// ✏️ Update Profile (with optional profile image)
router.put("/update-profile", verifyShopper, upload, handleUploadError, shopperController.updateShopperProfile);

// 📊 Get Dashboard Statistics (Protected)
router.get("/dashboard/stats", verifyShopper, shopperController.getShopperDashboardStats);

// ================================
// 📊 Compare List Management
// ================================

// Get compare list
router.get("/compare", verifyShopper, shopperController.getCompareList);

// Add product to compare list
router.post("/compare", verifyShopper, shopperController.addToCompare);

// Remove product from compare list
router.delete("/compare/:productId", verifyShopper, shopperController.removeFromCompare);

// Clear compare list
router.delete("/compare", verifyShopper, shopperController.clearCompareList);

// ================================
// 📦 Shopper Orders
// ================================

// 🛒 Get Orders of Logged-in Shopper (delegates to shared listing controller — TD-007)
const { listShopperOrders } = require("../controllers/shopperOrderController");
router.get("/orders", verifyShopper, listShopperOrders);

// ================================
// ❤️ Shopper Wishlist
// ================================

// 📄 Get Wishlist (Protected)
router.get("/wishlist", verifyShopper, shopperController.getWishlist);

// ➕ Add to Wishlist (Protected)
router.post("/wishlist/add", verifyShopper, shopperController.addToWishlist);

// 🗑️ Remove from Wishlist (Protected)
router.post("/wishlist/remove", verifyShopper, shopperController.removeFromWishlist);

// ================================
// 🛒 Shopper Cart
// ================================

// 📄 Get Cart (Protected)
router.get("/cart", verifyShopper, shopperController.getCart);

// ➕ Add to Cart (Protected)
router.post("/cart/add", verifyShopper, shopperController.addToCart);

// ✏️ Update Cart Quantity (Protected)
router.put("/cart/update-quantity", verifyShopper, shopperController.updateCartQuantity);

// 🗑️ Remove from Cart (Protected)
router.post("/cart/remove", verifyShopper, shopperController.removeFromCart);

// 🗑️ Clear Entire Cart (Protected)
router.delete("/cart", verifyShopper, shopperController.clearCart);

// ✅ Export router
module.exports = router;
