const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Import models and controllers
const Admin = require('../../models/Admin');
const Seller = require('../../models/Seller');
const Shopper = require('../../models/Shopper');
const OTP = require('../../models/OTP');

// Import controllers
const adminController = require('../../controllers/adminController');
const sellerController = require('../../controllers/sellerController');
const shopperController = require('../../controllers/shopperController');

// Mock sendMail
jest.mock('../../utils/sendMail', () => jest.fn());

describe('Password Reset OTP Integration Tests', () => {
  let mongoServer;
  let app;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to in-memory database
    await mongoose.connect(mongoUri);
    
    // Create test app
    app = express();
    app.use(express.json());
    
    // Admin routes
    app.post('/admin/send-password-reset-otp', adminController.sendAdminPasswordResetOTP);
    app.post('/admin/reset-password', adminController.resetAdminPasswordWithOTP);
    
    // Seller routes
    app.post('/seller/send-password-reset-otp', sellerController.sendSellerPasswordResetOTP);
    app.post('/seller/reset-password', sellerController.resetSellerPasswordWithOTP);
    
    // Shopper routes
    app.post('/shopper/send-otp', shopperController.sendOTP);
    app.post('/shopper/reset-password', shopperController.resetPasswordWithOTP);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up collections before each test
    await Admin.deleteMany({});
    await Seller.deleteMany({});
    await Shopper.deleteMany({});
    await OTP.deleteMany({});
  });

  describe('Admin Password Reset OTP Flow', () => {
    let admin;

    beforeEach(async () => {
      // Create a test admin
      admin = new Admin({
        name: 'Admin User',
        username: 'admin123',
        email: 'admin@example.com',
        phone: '1234567890',
        password: 'HashedPassword123!'
      });
      await admin.save();
    });

    it('should complete admin password reset with OTP verification', async () => {
      // Step 1: Send password reset OTP
      const sendOTPResponse = await request(app)
        .post('/admin/send-password-reset-otp')
        .send({ email: admin.email })
        .expect(200);

      expect(sendOTPResponse.body.message).toContain('OTP sent successfully');
      expect(sendOTPResponse.body.data.expiresAt).toBeDefined();

      // Check that OTP was created
      const otpRecord = await OTP.findOne({ email: admin.email });
      expect(otpRecord).toBeTruthy();
      expect(otpRecord.purpose).toBe('password_reset');
      expect(otpRecord.userType).toBe('admin');

      // Step 2: Reset password with OTP
      const resetData = {
        email: admin.email,
        otp: otpRecord.otp,
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!'
      };

      const resetResponse = await request(app)
        .post('/admin/reset-password')
        .send(resetData)
        .expect(200);

      expect(resetResponse.body.message).toContain('Password reset successfully');

      // Check that OTP was marked as used
      const usedOTP = await OTP.findOne({ email: admin.email });
      expect(usedOTP.isUsed).toBe(true);
    });

    it('should reject password reset with invalid OTP', async () => {
      // Send OTP first
      await request(app)
        .post('/admin/send-password-reset-otp')
        .send({ email: admin.email })
        .expect(200);

      // Try to reset with invalid OTP
      const resetData = {
        email: admin.email,
        otp: '000000',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!'
      };

      const resetResponse = await request(app)
        .post('/admin/reset-password')
        .send(resetData)
        .expect(400);

      expect(resetResponse.body.message).toContain('Invalid or expired OTP');
    });

    it('should reject password reset when passwords do not match', async () => {
      // Send OTP first
      await request(app)
        .post('/admin/send-password-reset-otp')
        .send({ email: admin.email })
        .expect(200);

      const otpRecord = await OTP.findOne({ email: admin.email });

      const resetData = {
        email: admin.email,
        otp: otpRecord.otp,
        newPassword: 'NewPassword123!',
        confirmPassword: 'differentpassword123'
      };

      const resetResponse = await request(app)
        .post('/admin/reset-password')
        .send(resetData)
        .expect(400);

      expect(resetResponse.body.message).toContain('Passwords do not match');
    });
  });

  describe('Seller Password Reset OTP Flow', () => {
    let seller;

    beforeEach(async () => {
      // Create a test seller
      seller = new Seller({
        firstName: 'John',
        lastName: 'Doe',
        username: 'seller123',
        email: 'seller@example.com',
        phone: '1234567890',
        shopName: 'My Shop',
        shopUrl: 'https://myshop.com',
        password: 'HashedPassword123!',
        isApproved: true
      });
      await seller.save();
    });

    it('should complete seller password reset with OTP verification', async () => {
      // Step 1: Send password reset OTP
      const sendOTPResponse = await request(app)
        .post('/seller/send-password-reset-otp')
        .send({ email: seller.email })
        .expect(200);

      expect(sendOTPResponse.body.message).toContain('OTP sent successfully');

      // Check that OTP was created
      const otpRecord = await OTP.findOne({ email: seller.email });
      expect(otpRecord).toBeTruthy();
      expect(otpRecord.userType).toBe('seller');

      // Step 2: Reset password with OTP
      const resetData = {
        email: seller.email,
        otp: otpRecord.otp,
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!'
      };

      const resetResponse = await request(app)
        .post('/seller/reset-password')
        .send(resetData)
        .expect(200);

      expect(resetResponse.body.message).toContain('Password reset successfully');
    });
  });

  describe('Shopper Password Reset OTP Flow', () => {
    let shopper;

    beforeEach(async () => {
      // Create a test shopper
      shopper = new Shopper({
        firstName: 'Jane',
        lastName: 'Smith',
        username: 'shopper123',
        email: 'shopper@example.com',
        phone: '1234567890',
        password: 'HashedPassword123!'
      });
      await shopper.save();
    });

    it('should complete shopper password reset with OTP verification', async () => {
      // Step 1: Send password reset OTP
      const sendOTPResponse = await request(app)
        .post('/shopper/send-otp')
        .send({ email: shopper.email })
        .expect(200);

      expect(sendOTPResponse.body.message).toContain('OTP sent successfully');

      // Check that OTP was created
      const otpRecord = await OTP.findOne({ email: shopper.email });
      expect(otpRecord).toBeTruthy();
      expect(otpRecord.userType).toBe('shopper');

      // Step 2: Reset password with OTP
      const resetData = {
        email: shopper.email,
        otp: otpRecord.otp,
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!'
      };

      const resetResponse = await request(app)
        .post('/shopper/reset-password')
        .send(resetData)
        .expect(200);

      expect(resetResponse.body.message).toContain('Password reset successfully');
    });
  });

  describe('Rate Limiting for Password Reset', () => {
    const testEmail = 'ratelimit@example.com';

    beforeEach(async () => {
      // Create a test admin
      const admin = new Admin({
        name: 'Test Admin',
        username: 'testadmin',
        email: testEmail,
        phone: '1234567890',
        password: 'HashedPassword123!'
      });
      await admin.save();
    });

    it('should enforce rate limiting for admin password reset', async () => {
      // Send 3 password reset OTPs
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/admin/send-password-reset-otp')
          .send({ email: testEmail })
          .expect(200);
        
        expect(response.body.message).toContain('OTP sent successfully');
      }

      // 4th attempt should be rate limited
      const response = await request(app)
        .post('/admin/send-password-reset-otp')
        .send({ email: testEmail })
        .expect(400);

      expect(response.body.message).toContain('Rate limit exceeded');
    });
  });

  describe('User Not Found Scenarios', () => {
    it('should return 404 when admin email does not exist', async () => {
      const response = await request(app)
        .post('/admin/send-password-reset-otp')
        .send({ email: 'nonexistent@example.com' })
        .expect(404);

      expect(response.body.message).toContain('Admin not found');
    });

    it('should return 404 when seller email does not exist', async () => {
      const response = await request(app)
        .post('/seller/send-password-reset-otp')
        .send({ email: 'nonexistent@example.com' })
        .expect(404);

      expect(response.body.message).toContain('Seller not found');
    });

    it('should return 404 when shopper email does not exist', async () => {
      const response = await request(app)
        .post('/shopper/send-otp')
        .send({ email: 'nonexistent@example.com' })
        .expect(404);

      expect(response.body.message).toContain('Shopper not found');
    });
  });
});
