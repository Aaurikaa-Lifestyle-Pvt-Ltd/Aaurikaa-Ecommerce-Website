// backend/middleware/validateRegistration.js

const { validateRegistrationData, sanitizeInput } = require('../utils/validation');

/**
 * Middleware to validate registration data based on user type
 * @param {string} userType - Type of user (admin, seller, shopper)
 * @returns {function} - Express middleware function
 */
const validateRegistration = (userType) => {
  return (req, res, next) => {
    try {
      // Sanitize input data
      const sanitizedData = sanitizeInput(req.body);
      req.body = sanitizedData;
      
      console.log("🔍 Validating data for", userType, ":", Object.keys(sanitizedData));
      
      // Validate registration data
      const validation = validateRegistrationData(sanitizedData, userType);
      
      if (!validation.isValid) {
        console.log("❌ Validation failed for", userType, ":", validation.errors);
        return res.status(400).json({
          message: "❌ Validation failed",
          errors: validation.errors
        });
      }
      
      // If validation passes, continue to next middleware
      next();
    } catch (error) {
      console.error("❌ Validation middleware error:", error);
      return res.status(500).json({
        message: "❌ Internal server error during validation"
      });
    }
  };
};

/**
 * OTP verification validation middleware
 */
const validateOTPVerification = (req, res, next) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({
        message: "❌ Email and OTP are required",
        errors: ["Missing required fields: email, otp"]
      });
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        message: "❌ Invalid email format",
        errors: ["Invalid email format"]
      });
    }
    
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: "❌ OTP must be 6 digits",
        errors: ["Invalid OTP format"]
      });
    }
    
    next();
  } catch (error) {
    console.error("❌ OTP validation middleware error:", error);
    return res.status(500).json({
      message: "❌ Internal server error during validation"
    });
  }
};

/**
 * Specific validation middlewares for each user type
 */
const validateAdminRegistration = validateRegistration('admin');
const validateSellerRegistration = validateRegistration('seller');
const validateShopperRegistration = validateRegistration('shopper');

module.exports = {
  validateRegistration,
  validateAdminRegistration,
  validateSellerRegistration,
  validateShopperRegistration,
  validateOTPVerification
};
