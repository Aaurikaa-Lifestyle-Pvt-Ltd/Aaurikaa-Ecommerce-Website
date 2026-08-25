// backend/controllers/sellerController.js
const Seller = require("../models/Seller");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendMail = require("../utils/sendMail");
const path = require("path");
const { sendRegistrationOTP, sendPasswordResetOTP, verifyOTP } = require("../utils/otpService");
const { notifyAdminNewSeller } = require("../utils/notificationService");
const { updateSellerApproval, bulkApproveSellers } = require("../services/sellerApprovalService");
const {
  normalizeSellerReturnPolicyFields,
} = require("../utils/returnPolicyResolver");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");
const { sanitizeBankAccount } = require("../utils/bankAccountMasking");

// =========================
// 🔐 Seller Registration
// =========================
exports.registerSeller = async (req, res) => {
  try {
    const {
      firstName, lastName, username, email, phone,
      shopName, shopUrl, password, confirmPassword,
      address1, address2, pincode, country, state, district
    } = req.body;

    // ✅ Required fields check
    if (!firstName || !lastName || !username || !email || !phone ||
      !shopName || !shopUrl || !password || !confirmPassword ||
      !address1 || !pincode || !country || !state || !district) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "All required fields must be filled", ERROR_CODES.INVALID_INPUT);
    }

    if (password !== confirmPassword) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Passwords do not match", ERROR_CODES.INVALID_INPUT);
    }

    // ✅ Duplicate check
    const existing = await Seller.findOne({ $or: [{ email }, { username }] });
    if (existing) return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Email or username already exists", ERROR_CODES.DUPLICATE_RESOURCE);

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create seller account (unverified)
    const seller = new Seller({
      firstName, lastName, username, email, phone,
      shopName, shopUrl,
      password: hashedPassword,
      isApproved: false,
      isVerified: false, // Mark as unverified until OTP is confirmed
      address: {
        address1,
        address2,
        pincode,
        country: country, // This should be an ObjectId from frontend
        state: state,     // This should be an ObjectId from frontend
        district: district // This should be an ObjectId from frontend
      },
      shopImage: req.files?.shopImage?.[0] ? req.files.shopImage[0].filename : "",
      aadhaarFront: req.files?.aadhaarFront?.[0] ? req.files.aadhaarFront[0].filename : "",
      aadhaarBack: req.files?.aadhaarBack?.[0] ? req.files.aadhaarBack[0].filename : "",
      tradeLicense: req.files?.tradeLicense?.[0] ? req.files.tradeLicense[0].filename : "",
      panCard: req.files?.panCard?.[0] ? req.files.panCard[0].filename : "",
      gst: req.files?.gst?.[0] ? req.files.gst[0].filename : "",
      otherDocs: req.files?.otherDocs?.map(doc => doc.filename) || [],
    });

    await seller.save();

    // Send OTP for registration verification
    const otpResult = await sendRegistrationOTP(email, 'seller', `${firstName} ${lastName}`);

    if (!otpResult.success) {
      // If OTP sending fails, delete the created seller account
      await Seller.findByIdAndDelete(seller._id);
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, otpResult.message, otpResult.code);
    }

    sendSuccessResponse(res, HTTP_STATUS.CREATED, "✅ OTP sent to your email. Please verify to complete registration.", {
      email,
      expiresAt: otpResult.expiresAt
    });
  } catch (err) {
    console.error("Register error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Registration failed", ERROR_CODES.INTERNAL_ERROR, { error: err.message });
  }
};

// =========================
// ✅ Verify Seller Registration OTP
// =========================
exports.verifySellerRegistration = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Verify OTP
    const otpResult = await verifyOTP(email, otp, 'registration', 'seller');

    if (!otpResult.success) {
      return res.status(400).json({
        message: otpResult.message,
        code: otpResult.code
      });
    }

    // Find the unverified seller account
    const seller = await Seller.findOne({ email, isVerified: false });
    if (!seller) {
      return res.status(400).json({
        message: "No pending registration found for this email"
      });
    }

    // Mark account as verified
    seller.isVerified = true;
    await seller.save();

    // Send notification to admin about new seller registration
    const notificationResult = await notifyAdminNewSeller(seller);
    if (!notificationResult.success) {
      console.log('⚠️ Admin notification failed:', notificationResult.message);
      // Don't fail the verification if notification fails
    }

    res.status(200).json({
      message: "✅ Email verified successfully! Your account is pending admin approval.",
      seller: {
        id: seller._id,
        name: `${seller.firstName} ${seller.lastName}`,
        email: seller.email,
        shopName: seller.shopName,
        isApproved: seller.isApproved,
        isVerified: seller.isVerified
      }
    });
  } catch (err) {
    console.error("Verify registration error:", err);
    res.status(500).json({ message: "Verification failed", error: err.message });
  }
};

// =========================
// 📨 Resend Seller Registration OTP
// =========================
exports.resendRegistrationOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "❌ Email is required", ERROR_CODES.INVALID_INPUT);
    }

    // Find the unverified seller account
    const seller = await Seller.findOne({ email, isVerified: false });

    if (!seller) {
      // Check if seller is already verified/registered
      const existingSeller = await Seller.findOne({ email });
      if (existingSeller && existingSeller.isVerified) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "❌ Email already registered. Please use password reset instead.", ERROR_CODES.RESOURCE_ALREADY_EXISTS);
      }

      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "❌ No pending registration found for this email. Please register first.", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    // Resend registration OTP using seller's name
    const otpResult = await sendRegistrationOTP(email, 'seller', `${seller.firstName} ${seller.lastName}`);

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

// =========================
// 📨 Send Seller Password Reset OTP
// =========================
exports.sendSellerPasswordResetOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "❌ Email is required" });

    // Check if seller exists
    const seller = await Seller.findOne({ email });
    if (!seller) {
      return res.status(404).json({ message: "❌ Seller not found" });
    }

    // Send password reset OTP
    const otpResult = await sendPasswordResetOTP(email, 'seller', `${seller.firstName} ${seller.lastName}`);

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
    console.error("❌ Send seller password reset OTP error:", err);
    res.status(500).json({ message: "❌ Server error" });
  }
};

// =========================
// 🔐 Reset Seller Password via OTP
// =========================
exports.resetSellerPasswordWithOTP = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "❌ Passwords do not match" });
    }

    // Verify OTP
    const otpResult = await verifyOTP(email, otp, 'password_reset', 'seller');

    if (!otpResult.success) {
      return res.status(400).json({
        message: otpResult.message,
        code: otpResult.code
      });
    }

    // Find and update seller password
    const seller = await Seller.findOne({ email });
    if (!seller) {
      return res.status(404).json({ message: "❌ Seller not found" });
    }

    seller.password = await bcrypt.hash(newPassword, 10);
    await seller.save();

    res.json({ message: "✅ Password reset successfully" });
  } catch (err) {
    console.error("❌ Reset seller password error:", err);
    res.status(500).json({ message: "❌ Server error" });
  }
};

// =========================
// 🔐 Seller Login
// =========================
exports.loginSeller = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "All fields required", ERROR_CODES.INVALID_INPUT);
    }

    // ✅ seller খোঁজা (email বা username দিয়ে)
    const seller = await Seller.findOne({
      $or: [{ email: identifier }, { username: identifier }]
    });

    if (!seller || !(await bcrypt.compare(password, seller.password))) {
      return sendErrorResponse(res, HTTP_STATUS.UNAUTHORIZED, "Invalid credentials", ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (!seller.isApproved) {
      return sendErrorResponse(res, HTTP_STATUS.FORBIDDEN, "Your account is not yet approved.", ERROR_CODES.ACCESS_DENIED);
    }

    // ✅ JWT তৈরি
    const token = jwt.sign(
      { id: seller._id, name: seller.firstName, email: seller.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // =========================
    // OPTION 1: Cookie based auth (httpOnly cookie)
    // =========================
    res.cookie("sellerToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // =========================
    // OPTION 2: JSON token response (frontend localStorage ব্যবহার করবে)
    // =========================
    // 👉 চাইলে শুধু নিচের অংশ ব্যবহার করুন, cookie বাদ দিয়ে
    sendSuccessResponse(res, HTTP_STATUS.OK, "Login successful", {
      token, // 🟢 যদি frontend localStorage এ রাখতে চান
      seller: {
        _id: seller._id,
        username: seller.username,
        email: seller.email,
        shopName: seller.shopName,
        isApproved: seller.isApproved,
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Login failed", ERROR_CODES.INTERNAL_ERROR, { error: err.message });
  }
};

// =========================
// 👤 Get Seller Profile
// =========================
exports.getSellerProfile = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const seller = await Seller.findById(sellerId)
      .populate('address.country', 'name')
      .populate('address.state', 'name')
      .populate('address.district', 'name')
      .select("-password");

    if (!seller) return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Seller not found", ERROR_CODES.RESOURCE_NOT_FOUND);

    // Convert populated ObjectIds to names for frontend compatibility
    let populatedSeller = seller.toObject();

    if (populatedSeller.address) {
      const address = { ...populatedSeller.address };

      // Convert populated objects to names
      if (address.country && typeof address.country === 'object') {
        address.country = address.country.name || '';
      }
      if (address.state && typeof address.state === 'object') {
        address.state = address.state.name || '';
      }
      if (address.district && typeof address.district === 'object') {
        address.district = address.district.name || '';
      }

      // Handle legacy data where ObjectIds might be stored as strings
      const Country = require("../models/location/Country");
      const State = require("../models/location/State");
      const District = require("../models/location/District");

      // Helper function to check if a string is an ObjectId
      const isObjectId = (str) => {
        return typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str);
      };

      // Check and populate country if it's still an ObjectId string
      if (address.country && isObjectId(address.country)) {
        try {
          const country = await Country.findById(address.country);
          if (country) address.country = country.name;
        } catch (err) {
          console.log("Country population failed:", err.message);
          address.country = '';
        }
      }

      // Check and populate state if it's still an ObjectId string
      if (address.state && isObjectId(address.state)) {
        try {
          const state = await State.findById(address.state);
          if (state) address.state = state.name;
        } catch (err) {
          console.log("State population failed:", err.message);
          address.state = '';
        }
      }

      // Check and populate district if it's still an ObjectId string
      if (address.district && isObjectId(address.district)) {
        try {
          const district = await District.findById(address.district);
          if (district) address.district = district.name;
        } catch (err) {
          console.log("District population failed:", err.message);
          address.district = '';
        }
      }

      populatedSeller.address = address;
    }

    // Mask sensitive bank details
    if (populatedSeller.bankAccount) {
      populatedSeller.bankAccount = sanitizeBankAccount(populatedSeller.bankAccount);
    }

    sendSuccessResponse(res, HTTP_STATUS.OK, "Seller profile retrieved successfully", { seller: populatedSeller });
  } catch (err) {
    console.error("Profile error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to fetch profile", ERROR_CODES.INTERNAL_ERROR, { error: err.message });
  }
};

// =========================
// ✏️ Update Seller Profile
// =========================
exports.updateSellerProfile = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { name, email, phone, shopName, address, newPassword, currentPassword } = req.body;

    // Find the seller
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Seller not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    // Handle password change if provided
    if (newPassword && currentPassword) {
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, seller.password);
      if (!isCurrentPasswordValid) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Current password is incorrect", ERROR_CODES.VALIDATION_FAILED);
      }

      // Hash new password
      const saltRounds = 10;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
      seller.password = hashedNewPassword;
    }

    // Handle profile image upload
    if (req.files && req.files.profileImage && req.files.profileImage[0]) {
      const profileImage = req.files.profileImage[0];
      seller.profileImage = profileImage.filename;
    }

    // Handle shop image upload
    if (req.files && req.files.shopImage && req.files.shopImage[0]) {
      const shopImage = req.files.shopImage[0];
      seller.shopImage = shopImage.filename;
    }

    // Update other fields
    if (name) {
      const nameParts = name.trim().split(' ');
      seller.firstName = nameParts[0] || '';
      seller.lastName = nameParts.slice(1).join(' ') || '';
    }

    if (email) seller.email = email;
    if (phone) seller.phone = phone;
    if (shopName) seller.shopName = shopName;

    // Update bank account fields (handle nested structure)
    if (!seller.bankAccount) seller.bankAccount = {};
    if (req.body.accountHolderName !== undefined) seller.bankAccount.accountHolderName = req.body.accountHolderName;
    if (req.body.accountNumber !== undefined) seller.bankAccount.accountNumber = req.body.accountNumber;
    if (req.body.accountNumberConfirm !== undefined) seller.bankAccount.accountNumberConfirm = req.body.accountNumberConfirm;
    if (req.body.ifscCode !== undefined) seller.bankAccount.ifscCode = req.body.ifscCode;
    if (req.body.bankName !== undefined) seller.bankAccount.bankName = req.body.bankName;
    if (req.body.branch !== undefined) seller.bankAccount.branch = req.body.branch;
    if (req.body.accountType !== undefined) seller.bankAccount.accountType = req.body.accountType;
    if (req.body.upiId !== undefined) seller.bankAccount.upiId = req.body.upiId;

    // Handle address field - it can be a string or object
    if (address) {
      if (typeof address === 'string') {
        // If address is a string, store it in address1 field
        seller.address = {
          address1: address,
          address2: seller.address?.address2 || '',
          pincode: seller.address?.pincode || '',
          country: seller.address?.country || null,
          state: seller.address?.state || null,
          district: seller.address?.district || null
        };
      } else if (typeof address === 'object') {
        // If address is an object, preserve existing ObjectIds or set to null
        seller.address = {
          address1: address.address1 || seller.address?.address1 || '',
          address2: address.address2 || seller.address?.address2 || '',
          pincode: address.pincode || seller.address?.pincode || '',
          country: address.country || seller.address?.country || null,
          state: address.state || seller.address?.state || null,
          district: address.district || seller.address?.district || null
        };
      }
    }

    const returnPolicyUpdate = normalizeSellerReturnPolicyFields(req.body);
    if (returnPolicyUpdate.changed) {
      if (returnPolicyUpdate.valid === false) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          returnPolicyUpdate.message,
          ERROR_CODES.VALIDATION_FAILED
        );
      }
      if (Object.prototype.hasOwnProperty.call(returnPolicyUpdate, "returnAllowed")) {
        seller.returnAllowed = returnPolicyUpdate.returnAllowed;
      }
      if (Object.prototype.hasOwnProperty.call(returnPolicyUpdate, "returnWindowDays")) {
        seller.returnWindowDays = returnPolicyUpdate.returnWindowDays;
      }
      if (Object.prototype.hasOwnProperty.call(returnPolicyUpdate, "returnConditions")) {
        seller.returnConditions = returnPolicyUpdate.returnConditions;
      }
    }

    // Save the updated seller
    const updatedSeller = await seller.save();

    // Remove password from response
    const sellerResponse = updatedSeller.toObject();
    delete sellerResponse.password;

    sendSuccessResponse(res, HTTP_STATUS.OK, "Profile updated successfully", {
      updatedSeller: sellerResponse
    });
  } catch (err) {
    console.error("Update profile error:", err);

    // Handle duplicate email error
    if (err.code === 11000 && err.keyPattern?.email) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Email already exists", ERROR_CODES.VALIDATION_FAILED);
    }

    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to update profile", ERROR_CODES.INTERNAL_ERROR, { error: err.message });
  }
};

// =========================
// 🛠 Admin Functions
// =========================
exports.getAllSellers = async (req, res) => {
  try {
    const sellers = await Seller.find().sort({ createdAt: -1 });
    sendSuccessResponse(res, HTTP_STATUS.OK, "Sellers retrieved successfully", { sellers });
  } catch (err) {
    console.error("Get all sellers error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to fetch sellers", ERROR_CODES.INTERNAL_ERROR, { error: err.message });
  }
};

exports.approveSeller = asyncHandler(async (req, res) => {
  console.warn('⚠️ DEPRECATED: Use adminSellerController.updateSellerApproval instead');

  const result = await updateSellerApproval(req.params.id, true, null, req.adminId);

  if (!result.success) {
    return sendErrorResponse(
      res,
      result.error === ERROR_MESSAGES.SELLER_NOT_FOUND ? HTTP_STATUS.NOT_FOUND : HTTP_STATUS.BAD_REQUEST,
      result.error,
      result.code
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    result.data.message,
    result.data
  );
});

exports.rejectSeller = asyncHandler(async (req, res) => {
  console.warn('⚠️ DEPRECATED: Use adminSellerController.updateSellerApproval instead');

  const { reason } = req.body;
  const result = await updateSellerApproval(req.params.id, false, reason, req.adminId);

  if (!result.success) {
    return sendErrorResponse(
      res,
      result.error === ERROR_MESSAGES.SELLER_NOT_FOUND ? HTTP_STATUS.NOT_FOUND : HTTP_STATUS.BAD_REQUEST,
      result.error,
      result.code
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    result.data.message,
    result.data
  );
});

exports.bulkApproveSellers = asyncHandler(async (req, res) => {
  console.warn('⚠️ DEPRECATED: Use adminSellerController.bulkApproveSellers instead');

  const { ids } = req.body;
  const result = await bulkApproveSellers(ids, req.adminId);

  if (!result.success) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      result.error,
      result.code
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    result.data.message,
    result.data
  );
});

