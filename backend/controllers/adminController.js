const Admin = require("../models/Admin");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendRegistrationOTP, sendPasswordResetOTP, verifyOTP } = require("../utils/otpService");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");
const { formatAdminAuthPayload } = require("../utils/adminPermissions");
const {
  isValidAdminPassword,
  ADMIN_PASSWORD_MESSAGE,
} = require("../utils/adminPasswordPolicy");

// ==============================
// ✅ Register Admin
// ==============================
exports.registerAdmin = asyncHandler(async (req, res) => {
  const { name, username, email, phone, password } = req.body;

  const exists = await Admin.findOne({ $or: [{ email }, { username }] });
  if (exists) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      ERROR_MESSAGES.EMAIL_ALREADY_EXISTS,
      ERROR_CODES.RESOURCE_ALREADY_EXISTS
    );
  }

  // Send OTP for registration verification
  const otpResult = await sendRegistrationOTP(email, 'admin', name);
  
  if (!otpResult.success) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      otpResult.message,
      otpResult.code
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.CREATED,
    "✅ OTP sent to your email. Please verify to complete registration.",
    { email, expiresAt: otpResult.expiresAt }
  );
});

// ==============================
// ✅ Verify Admin Registration OTP
// ==============================
exports.verifyAdminRegistration = asyncHandler(async (req, res) => {
  const { name, username, email, phone, password, otp } = req.body;

  // Verify OTP
  const otpResult = await verifyOTP(email, otp, 'registration', 'admin');
  
  if (!otpResult.success) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      otpResult.message,
      otpResult.code
    );
  }

  // Check if admin already exists (double check)
  const exists = await Admin.findOne({ $or: [{ email }, { username }] });
  if (exists) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      ERROR_MESSAGES.EMAIL_ALREADY_EXISTS,
      ERROR_CODES.RESOURCE_ALREADY_EXISTS
    );
  }

  const profileImage = req.file ? req.file.filename : "";

  const newAdmin = new Admin({
    name,
    username,
    email,
    phone,
    password,
    profileImage,
  });

  await newAdmin.save();
  return sendSuccessResponse(
    res,
    HTTP_STATUS.CREATED,
    "✅ Admin registered and verified successfully"
  );
});

// ==============================
// 📨 Send Admin Password Reset OTP
// ==============================
exports.sendAdminPasswordResetOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Email is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Check if admin exists
  const admin = await Admin.findOne({ email });
  if (!admin) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.ADMIN_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Send password reset OTP
  const otpResult = await sendPasswordResetOTP(email, 'admin', admin.name);
  
  if (!otpResult.success) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      otpResult.message,
      otpResult.code
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ OTP sent successfully",
    { expiresAt: otpResult.expiresAt }
  );
});

// ==============================
// 🔐 Reset Admin Password via OTP
// ==============================
exports.resetAdminPasswordWithOTP = asyncHandler(async (req, res) => {
  const { email, otp, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.PASSWORDS_DO_NOT_MATCH,
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  // Verify OTP
  const otpResult = await verifyOTP(email, otp, 'password_reset', 'admin');
  
  if (!otpResult.success) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      otpResult.message,
      otpResult.code
    );
  }

  // Find and update admin password
  const admin = await Admin.findOne({ email });
  if (!admin) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.ADMIN_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  admin.password = newPassword;
  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Password reset successfully"
  );
});

// ==============================
// ✅ Login Admin
// ==============================
exports.loginAdmin = asyncHandler(async (req, res) => {
  const { emailOrUsername, password } = req.body;

  if (!emailOrUsername || !password) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Email/Username and password are required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const admin = await Admin.findOne({
    $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
  });

  if (!admin) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.ADMIN_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  if (!admin.isActive) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      "Admin account is deactivated",
      ERROR_CODES.AUTH_ACCESS_DENIED
    );
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      "Invalid credentials",
      ERROR_CODES.AUTHENTICATION_FAILED
    );
  }

  admin.lastLogin = new Date();
  await admin.save({ validateBeforeSave: false });

  const token = jwt.sign(
    {
      id: admin._id,
      role: "admin",
      name: admin.name,
      isSuperAdmin: admin.isSuperAdmin ?? false,
      tokenVersion: admin.tokenVersion ?? 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Login successful",
    {
      token,
      admin: formatAdminAuthPayload(admin),
    }
  );
});

// ==============================
// ✅ Get Admin Profile (Protected)
// ==============================
exports.getAdminProfile = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.user.id).select("-password");
  if (!admin) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.ADMIN_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  const profile = admin.toObject();
  Object.assign(profile, formatAdminAuthPayload(admin));

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Admin profile retrieved successfully",
    profile
  );
});

// ==============================
// ✅ Update Admin Profile (Protected)
// ==============================
exports.updateAdminProfile = asyncHandler(async (req, res) => {
  const { name, email, phone, username, password } = req.body;
  const admin = await Admin.findById(req.user.id); // from token

  if (!admin) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.ADMIN_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Update fields
  if (name) admin.name = name;
  if (email) admin.email = email;
  if (phone) admin.phone = phone;
  if (username) admin.username = username;

  // Update password if provided (hashed once by Admin pre-save hook)
  if (password?.trim()) {
    admin.password = password;
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  }

  // Update profile image if uploaded
  if (req.file) {
    admin.profileImage = req.file.filename;
  }

  await admin.save();

  const { password: _, ...adminData } = admin.toObject(); // omit password

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Admin profile updated successfully",
    adminData
  );
});

// ==============================
// 🔐 Change Admin Password (Protected, self-service)
// ==============================
exports.changeAdminPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Old password and new password are required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  if (!isValidAdminPassword(newPassword)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_PASSWORD_FORMAT,
      ERROR_CODES.VALIDATION_FAILED,
      { validationErrors: [ADMIN_PASSWORD_MESSAGE] }
    );
  }

  const admin = await Admin.findById(req.user.id);
  if (!admin) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.ADMIN_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  const isMatch = await admin.comparePassword(oldPassword);
  if (!isMatch) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      "Current password is incorrect",
      ERROR_CODES.AUTHENTICATION_FAILED
    );
  }

  admin.password = newPassword;
  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Password changed successfully. Please sign in again with your new password."
  );
});
