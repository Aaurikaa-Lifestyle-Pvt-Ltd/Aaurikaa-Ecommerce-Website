const {
  registerSeller,
  loginSeller,
  getSellerProfile,
  getAllSellers
} = require('../../controllers/sellerController');

const Seller = require('../../models/Seller');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendRegistrationOTP } = require('../../utils/otpService');

// Mock the models and utilities
jest.mock('../../models/Seller');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('../../utils/otpService');
jest.mock('../../utils/notificationService');

describe('SellerController Error Handling Standardization', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      body: {},
      user: { _id: 'seller123' }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('registerSeller', () => {
    it('should return standardized error for missing required fields', async () => {
      mockReq.body = {
        firstName: 'John',
        // Missing other required fields
      };

      await registerSeller(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'All required fields must be filled',
        timestamp: expect.any(String)
      });
    });

    it('should return standardized error for password mismatch', async () => {
      mockReq.body = {
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        phone: '1234567890',
        shopName: 'Test Shop',
        shopUrl: 'testshop',
        password: 'password123',
        confirmPassword: 'different123',
        address1: '123 Main St',
        pincode: '12345',
        country: 'US',
        state: 'CA',
        district: 'LA'
      };

      await registerSeller(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Passwords do not match',
        timestamp: expect.any(String)
      });
    });

    it('should return standardized error for duplicate email/username', async () => {
      mockReq.body = {
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        phone: '1234567890',
        shopName: 'Test Shop',
        shopUrl: 'testshop',
        password: 'password123',
        confirmPassword: 'password123',
        address1: '123 Main St',
        pincode: '12345',
        country: 'US',
        state: 'CA',
        district: 'LA'
      };

      Seller.findOne.mockResolvedValue({ email: 'john@example.com' });

      await registerSeller(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Email or username already exists',
        timestamp: expect.any(String)
      });
    });
  });

  describe('loginSeller', () => {
    it('should return standardized error for missing fields', async () => {
      mockReq.body = {
        identifier: 'john@example.com'
        // Missing password
      };

      await loginSeller(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'All fields required',
        timestamp: expect.any(String)
      });
    });

    it('should return standardized error for invalid credentials', async () => {
      mockReq.body = {
        identifier: 'john@example.com',
        password: 'wrongpassword'
      };

      Seller.findOne.mockResolvedValue(null);

      await loginSeller(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials',
        timestamp: expect.any(String)
      });
    });

    it('should return standardized error for unapproved account', async () => {
      mockReq.body = {
        identifier: 'john@example.com',
        password: 'password123'
      };

      const mockSeller = {
        _id: 'seller123',
        email: 'john@example.com',
        password: 'hashedpassword',
        isApproved: false
      };

      Seller.findOne.mockResolvedValue(mockSeller);
      bcrypt.compare.mockResolvedValue(true);

      await loginSeller(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Your account is not yet approved.',
        timestamp: expect.any(String)
      });
    });
  });

  describe('getSellerProfile', () => {
    it('should return standardized error for seller not found', async () => {
      Seller.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      await getSellerProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Seller not found',
        code: 'RESOURCE_NOT_FOUND',
        timestamp: expect.any(String)
      });
    });

    it('should return standardized success response for valid seller', async () => {
      const mockSeller = {
        _id: 'seller123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      };

      Seller.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockSeller)
      });

      await getSellerProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Seller profile retrieved successfully',
        data: { seller: mockSeller },
        timestamp: expect.any(String)
      });
    });
  });

  describe('getAllSellers', () => {
    it('should return standardized success response', async () => {
      const mockSellers = [
        { _id: 'seller1', firstName: 'John' },
        { _id: 'seller2', firstName: 'Jane' }
      ];

      Seller.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockSellers)
      });

      await getAllSellers(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Sellers retrieved successfully',
        data: { sellers: mockSellers },
        timestamp: expect.any(String)
      });
    });
  });
});
