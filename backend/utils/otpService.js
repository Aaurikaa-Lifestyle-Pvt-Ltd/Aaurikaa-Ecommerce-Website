// backend/utils/otpService.js

const OTP = require('../models/OTP');
const sendMail = require('./sendMail');

/**
 * Generate a 6-digit OTP
 * @returns {string} - 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP for registration
 * @param {string} email - User email
 * @param {string} userType - Type of user (admin, seller, shopper)
 * @param {string} name - User name for personalization
 * @returns {Promise<Object>} - Result object
 */
const sendRegistrationOTP = async (email, userType, name) => {
  try {
    // Check if there's an existing unused OTP for registration
    const existingOTP = await OTP.findOne({
      email,
      purpose: 'registration',
      userType,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (existingOTP) {
      // Check if user has exceeded rate limit (3 attempts per hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentOTPs = await OTP.countDocuments({
        email,
        purpose: 'registration',
        userType,
        createdAt: { $gte: oneHourAgo }
      });

      if (recentOTPs >= 3) {
        return {
          success: false,
          message: 'Rate limit exceeded. Maximum 3 OTP requests per hour.',
          code: 'RATE_LIMIT_EXCEEDED'
        };
      }

      // Mark existing OTP as used
      existingOTP.isUsed = true;
      await existingOTP.save();
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    const otpRecord = new OTP({
      email,
      otp: otpCode,
      purpose: 'registration',
      userType,
      expiresAt
    });

    await otpRecord.save();

    // Send email
    const subject = `Verify Your ${userType.charAt(0).toUpperCase() + userType.slice(1)} Registration`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome ${name}!</h2>
        <p>Thank you for registering as a ${userType}. Please verify your email address using the OTP below:</p>
        
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${otpCode}</h1>
        </div>
        
        <p><strong>This OTP will expire in 10 minutes.</strong></p>
        <p>If you didn't request this verification, please ignore this email.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    `;

    await sendMail(email, subject, html);

    return {
      success: true,
      message: 'OTP sent successfully',
      expiresAt
    };

  } catch (error) {
    console.error('❌ Send registration OTP error:', error);
    return {
      success: false,
      message: 'Failed to send OTP',
      code: 'SEND_ERROR'
    };
  }
};

/**
 * Send OTP for password reset
 * @param {string} email - User email
 * @param {string} userType - Type of user (admin, seller, shopper)
 * @param {string} name - User name for personalization
 * @returns {Promise<Object>} - Result object
 */
const sendPasswordResetOTP = async (email, userType, name) => {
  try {
    // Check rate limit
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOTPs = await OTP.countDocuments({
      email,
      purpose: 'password_reset',
      userType,
      createdAt: { $gte: oneHourAgo }
    });

    if (recentOTPs >= 3) {
      return {
        success: false,
        message: 'Rate limit exceeded. Maximum 3 OTP requests per hour.',
        code: 'RATE_LIMIT_EXCEEDED'
      };
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    const otpRecord = new OTP({
      email,
      otp: otpCode,
      purpose: 'password_reset',
      userType,
      expiresAt
    });

    await otpRecord.save();

    // Send email
    const subject = `Password Reset OTP - ${userType.charAt(0).toUpperCase() + userType.slice(1)} Account`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${name},</p>
        <p>You have requested to reset your password. Please use the OTP below to proceed:</p>
        
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #dc3545; font-size: 32px; margin: 0; letter-spacing: 5px;">${otpCode}</h1>
        </div>
        
        <p><strong>This OTP will expire in 10 minutes.</strong></p>
        <p>If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    `;

    await sendMail(email, subject, html);

    return {
      success: true,
      message: 'OTP sent successfully',
      expiresAt
    };

  } catch (error) {
    console.error('❌ Send password reset OTP error:', error);
    return {
      success: false,
      message: 'Failed to send OTP',
      code: 'SEND_ERROR'
    };
  }
};

/**
 * Verify OTP
 * @param {string} email - User email
 * @param {string} otp - OTP code
 * @param {string} purpose - Purpose (registration, password_reset)
 * @param {string} userType - Type of user (admin, seller, shopper)
 * @returns {Promise<Object>} - Result object
 */
const verifyOTP = async (email, otp, purpose, userType) => {
  try {
    const otpRecord = await OTP.findOne({
      email,
      otp,
      purpose,
      userType,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      // Increment attempts for failed verification
      await OTP.updateOne(
        { email, purpose, userType, isUsed: false },
        { $inc: { attempts: 1 } }
      );

      return {
        success: false,
        message: 'Invalid or expired OTP',
        code: 'INVALID_OTP'
      };
    }

    // Mark OTP as used
    otpRecord.isUsed = true;
    await otpRecord.save();

    return {
      success: true,
      message: 'OTP verified successfully'
    };

  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    return {
      success: false,
      message: 'Failed to verify OTP',
      code: 'VERIFY_ERROR'
    };
  }
};

/**
 * Clean up expired OTPs (can be called periodically)
 * @returns {Promise<number>} - Number of deleted records
 */
const cleanupExpiredOTPs = async () => {
  try {
    const result = await OTP.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    
    console.log(`✅ Cleaned up ${result.deletedCount} expired OTPs`);
    return result.deletedCount;
  } catch (error) {
    console.error('❌ Cleanup expired OTPs error:', error);
    return 0;
  }
};

module.exports = {
  generateOTP,
  sendRegistrationOTP,
  sendPasswordResetOTP,
  verifyOTP,
  cleanupExpiredOTPs
};
