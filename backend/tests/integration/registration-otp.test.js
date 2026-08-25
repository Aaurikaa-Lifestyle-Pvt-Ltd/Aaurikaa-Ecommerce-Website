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

// Import middleware
const { validateAdminRegistration, validateSellerRegistration, validateShopperRegistration, validateOTPVerification } = require('../../middleware/validateRegistration');

// Mock file upload middleware
const mockUpload = (req, res, next) => {
  req.file = { filename: 'test-image.jpg' };
  next();
};

// Mock sendMail
jest.mock('../../utils/sendMail', () => jest.fn());

describe('Registration OTP Integration Tests', () => {
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
    app.post('/admin/register', validateAdminRegistration, mockUpload, adminController.registerAdmin);
    app.post('/admin/verify-registration', validateAdminRegistration, mockUpload, adminController.verifyAdminRegistration);
    
    // Seller routes
    app.post('/seller/register', validateSellerRegistration, mockUpload, sellerController.registerSeller);
    app.post('/seller/verify-registration', validateOTPVerification, sellerController.verifySellerRegistration);
    
    // Shopper routes
    app.post('/shopper/register', validateShopperRegistration, mockUpload, shopperController.registerShopper);
    app.post('/shopper/verify-registration', validateShopperRegistration, mockUpload, shopperController.verifyShopperRegistration);
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

  describe('Admin Registration OTP Flow', () => {
    const validAdminData = {
      name: 'Admin User',
      username: 'admin123',
      email: 'admin@example.com',
      phone: '1234567890',
      password: 'password123'
    };

    it('should complete admin registration with OTP verification', async () => {
      // Step 1: Register admin (should send OTP)
      const registerResponse = await request(app)
        .post('/admin/register')
        .send(validAdminData)
        .expect(201);

      expect(registerResponse.body.message).toContain('OTP sent to your email');
      expect(registerResponse.body.data.email).toBe(validAdminData.email);

      // Check that admin was not created yet
      const adminBeforeVerification = await Admin.findOne({ email: validAdminData.email });
      expect(adminBeforeVerification).toBeNull();

      // Check that OTP was created
      const otpRecord = await OTP.findOne({ email: validAdminData.email });
      expect(otpRecord).toBeTruthy();
      expect(otpRecord.purpose).toBe('registration');
      expect(otpRecord.userType).toBe('admin');

      // Step 2: Verify OTP and complete registration
      const verifyData = { ...validAdminData, otp: otpRecord.otp };
      const verifyResponse = await request(app)
        .post('/admin/verify-registration')
        .send(verifyData)
        .expect(201);

      expect(verifyResponse.body.message).toContain('registered and verified successfully');

      // Check that admin was created
      const adminAfterVerification = await Admin.findOne({ email: validAdminData.email });
      expect(adminAfterVerification).toBeTruthy();
      expect(adminAfterVerification.name).toBe(validAdminData.name);
      expect(adminAfterVerification.username).toBe(validAdminData.username);

      // Check that OTP was marked as used
      const usedOTP = await OTP.findOne({ email: validAdminData.email });
      expect(usedOTP.isUsed).toBe(true);
    });

    it('should reject invalid OTP during verification', async () => {
      // Register admin first
      await request(app)
        .post('/admin/register')
        .send(validAdminData)
        .expect(201);

      // Try to verify with invalid OTP
      const verifyData = { ...validAdminData, otp: '000000' };
      const verifyResponse = await request(app)
        .post('/admin/verify-registration')
        .send(verifyData)
        .expect(400);

      expect(verifyResponse.body.message).toContain('Invalid or expired OTP');

      // Check that admin was not created
      const admin = await Admin.findOne({ email: validAdminData.email });
      expect(admin).toBeNull();
    });
  });

  describe('Seller Registration OTP Flow', () => {
    const validSellerData = {
      firstName: 'John',
      lastName: 'Doe',
      username: 'seller123',
      email: 'seller@example.com',
      phone: '1234567890',
      shopName: 'My Shop',
      shopUrl: 'https://myshop.com',
      password: 'password123',
      confirmPassword: 'password123',
      address1: '123 Main Street, City Center',
      pincode: '123456',
      country: 'India',
      state: 'Maharashtra',
      district: 'Mumbai'
    };

    it('should complete seller registration with OTP verification', async () => {
      // Step 1: Register seller (should create account and send OTP)
      const registerResponse = await request(app)
        .post('/seller/register')
        .send(validSellerData)
        .expect(201);

      expect(registerResponse.body.message).toContain('OTP sent to your email');

      // Check that seller was created but not verified
      const sellerBeforeVerification = await Seller.findOne({ email: validSellerData.email });
      expect(sellerBeforeVerification).toBeTruthy();
      expect(sellerBeforeVerification.firstName).toBe(validSellerData.firstName);
      expect(sellerBeforeVerification.shopName).toBe(validSellerData.shopName);
      expect(sellerBeforeVerification.isVerified).toBe(false);
      expect(sellerBeforeVerification.isApproved).toBe(false);

      // Check that OTP was created
      const otpRecord = await OTP.findOne({ email: validSellerData.email });
      expect(otpRecord).toBeTruthy();
      expect(otpRecord.userType).toBe('seller');

      // Step 2: Verify OTP (only needs email and OTP)
      const verifyData = { email: validSellerData.email, otp: otpRecord.otp };
      const verifyResponse = await request(app)
        .post('/seller/verify-registration')
        .send(verifyData)
        .expect(200);

      expect(verifyResponse.body.message).toContain('Email verified successfully');

      // Check that seller is now verified
      const sellerAfterVerification = await Seller.findOne({ email: validSellerData.email });
      expect(sellerAfterVerification).toBeTruthy();
      expect(sellerAfterVerification.isVerified).toBe(true);
      expect(sellerAfterVerification.isApproved).toBe(false);
    });

    it('should reject invalid OTP during seller verification', async () => {
      // Register seller first
      await request(app)
        .post('/seller/register')
        .send(validSellerData)
        .expect(201);

      // Try to verify with invalid OTP
      const verifyData = { email: validSellerData.email, otp: '000000' };
      const verifyResponse = await request(app)
        .post('/seller/verify-registration')
        .send(verifyData)
        .expect(400);

      expect(verifyResponse.body.message).toContain('Invalid or expired OTP');

      // Check that seller is still not verified
      const seller = await Seller.findOne({ email: validSellerData.email });
      expect(seller.isVerified).toBe(false);
    });
  });

  describe('Shopper Registration OTP Flow', () => {
    const validShopperData = {
      firstName: 'Jane',
      lastName: 'Smith',
      username: 'shopper123',
      email: 'shopper@example.com',
      phone: '1234567890',
      password: 'password123'
    };

    it('should complete shopper registration with OTP verification', async () => {
      // Step 1: Register shopper (should send OTP)
      const registerResponse = await request(app)
        .post('/shopper/register')
        .send(validShopperData)
        .expect(201);

      expect(registerResponse.body.message).toContain('OTP sent to your email');

      // Check that shopper was not created yet
      const shopperBeforeVerification = await Shopper.findOne({ email: validShopperData.email });
      expect(shopperBeforeVerification).toBeNull();

      // Check that OTP was created
      const otpRecord = await OTP.findOne({ email: validShopperData.email });
      expect(otpRecord).toBeTruthy();
      expect(otpRecord.userType).toBe('shopper');

      // Step 2: Verify OTP and complete registration
      const verifyData = { ...validShopperData, otp: otpRecord.otp };
      const verifyResponse = await request(app)
        .post('/shopper/verify-registration')
        .send(verifyData)
        .expect(201);

      expect(verifyResponse.body.message).toContain('registered and verified successfully');

      // Check that shopper was created
      const shopperAfterVerification = await Shopper.findOne({ email: validShopperData.email });
      expect(shopperAfterVerification).toBeTruthy();
      expect(shopperAfterVerification.firstName).toBe(validShopperData.firstName);
      expect(shopperAfterVerification.role).toBe('shopper');
    });
  });

  describe('Rate Limiting', () => {
    const testData = {
      name: 'Test User',
      username: 'testuser',
      email: 'ratelimit@example.com',
      phone: '1234567890',
      password: 'password123'
    };

    it('should enforce rate limiting for admin registration', async () => {
      // Send 3 registration requests with the same email
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/admin/register')
          .send({ ...testData, username: `testuser${i}` })
          .expect(201);
        
        expect(response.body.message).toContain('OTP sent');
      }

      // 4th request should be rate limited
      const response = await request(app)
        .post('/admin/register')
        .send({ ...testData, username: 'testuser4' })
        .expect(400);

      expect(response.body.message).toContain('Rate limit exceeded');
    });
  });

  describe('Duplicate Prevention', () => {
    const adminData = {
      name: 'Admin User',
      username: 'admin123',
      email: 'admin@example.com',
      phone: '1234567890',
      password: 'password123'
    };

    it('should prevent duplicate admin registration', async () => {
      // Register admin first
      await request(app)
        .post('/admin/register')
        .send(adminData)
        .expect(201);

      // Get OTP and verify
      const otpRecord = await OTP.findOne({ email: adminData.email });
      const verifyData = { ...adminData, otp: otpRecord.otp };
      await request(app)
        .post('/admin/verify-registration')
        .send(verifyData)
        .expect(201);

      // Try to register again with same email
      const duplicateResponse = await request(app)
        .post('/admin/register')
        .send(adminData)
        .expect(409);

      expect(duplicateResponse.body.message).toContain('already exists');
    });

    it('should prevent duplicate seller registration', async () => {
      const sellerData = {
        firstName: 'John',
        lastName: 'Doe',
        username: 'seller123',
        email: 'seller@example.com',
        phone: '1234567890',
        shopName: 'My Shop',
        shopUrl: 'https://myshop.com',
        password: 'password123',
        confirmPassword: 'password123',
        address1: '123 Main Street',
        pincode: '123456',
        country: 'India',
        state: 'Maharashtra',
        district: 'Mumbai'
      };

      // Register seller first (creates account immediately)
      await request(app)
        .post('/seller/register')
        .send(sellerData)
        .expect(201);

      // Try to register again with same email
      const duplicateResponse = await request(app)
        .post('/seller/register')
        .send(sellerData)
        .expect(400);

      expect(duplicateResponse.body.message).toContain('already exists');
    });
  });
});
