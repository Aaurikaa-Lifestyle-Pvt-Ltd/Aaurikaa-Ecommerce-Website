// backend/routes/sellerAuthRoutes.js
const express = require("express");
const router = express.Router();

const sellerDocsUpload = require("../middleware/sellerDocsUpload");
const verifySeller = require("../middleware/verifySeller");
const { validateSellerRegistration, validateOTPVerification } = require("../middleware/validateRegistration");
const { rejectPublicSellerOnboarding } = require("../middleware/aaurikaaMarketplaceGuard");

const {
  registerSeller,
  verifySellerRegistration,
  resendRegistrationOTP,
  sendSellerPasswordResetOTP,
  resetSellerPasswordWithOTP,
  loginSeller,
  getSellerProfile,
  updateSellerProfile,
} = require("../controllers/sellerController");

// 📝 Seller Register (with file uploads) — public onboarding disabled for AAURIKAA
router.post("/register", rejectPublicSellerOnboarding, sellerDocsUpload.upload, sellerDocsUpload.handleUploadError, validateSellerRegistration, registerSeller);

// ✅ Verify Seller Registration OTP
router.post("/verify-registration", rejectPublicSellerOnboarding, validateOTPVerification, verifySellerRegistration);

// 📨 Resend Seller Registration OTP
router.post("/resend-registration-otp", rejectPublicSellerOnboarding, express.json(), resendRegistrationOTP);

// 🔐 Seller Login
router.post("/login", loginSeller);

// 📨 Send Seller Password Reset OTP
router.post("/send-password-reset-otp", express.json(), sendSellerPasswordResetOTP);

// 🔐 Reset Seller Password via OTP
router.post("/reset-password", express.json(), resetSellerPasswordWithOTP);

// 👤 Seller Profile (Protected Route)
router.get("/me", verifySeller, getSellerProfile);

// ✏️ Update Seller Profile (Protected Route)
router.put("/update", verifySeller, sellerDocsUpload.upload, sellerDocsUpload.handleUploadError, updateSellerProfile);

module.exports = router;
