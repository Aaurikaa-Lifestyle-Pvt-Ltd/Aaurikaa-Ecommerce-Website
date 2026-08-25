const {
  validateSellerInput,
  validateSellerFileUpload,
  validateSellerProfile,
  validateProduct,
  validateOrder,
  validatePayment,
  validateBankAccount,
  SELLER_VALIDATION_RULES
} = require('../../middleware/sellerValidation');

const { sendErrorResponse, ERROR_CODES, HTTP_STATUS } = require('../../utils/errorHandler');

// Mock the error handler
jest.mock('../../utils/errorHandler', () => ({
  sendErrorResponse: jest.fn(),
  ERROR_CODES: {
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
  },
  HTTP_STATUS: {
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500
  }
}));

describe('Seller Validation Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      body: {},
      params: {},
      query: {},
      files: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('validateSellerInput', () => {
    it('should pass validation for valid seller profile data', () => {
      mockReq.body = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        shopName: 'Test Shop'
      };

      const middleware = validateSellerInput(SELLER_VALIDATION_RULES.sellerProfile);
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(sendErrorResponse).not.toHaveBeenCalled();
    });

    it('should fail validation for missing required fields', () => {
      mockReq.body = {
        firstName: 'John'
        // Missing other required fields
      };

      const middleware = validateSellerInput(SELLER_VALIDATION_RULES.sellerProfile);
      middleware(mockReq, mockRes, mockNext);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        HTTP_STATUS.BAD_REQUEST,
        'Validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Missing required fields: lastName, email, phone, shopName'] }
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid email format', () => {
      mockReq.body = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
        phone: '+1234567890',
        shopName: 'Test Shop'
      };

      const middleware = validateSellerInput(SELLER_VALIDATION_RULES.sellerProfile);
      middleware(mockReq, mockRes, mockNext);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        HTTP_STATUS.BAD_REQUEST,
        'Validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Invalid email format or value'] }
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid phone format', () => {
      mockReq.body = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: 'invalid-phone',
        shopName: 'Test Shop'
      };

      const middleware = validateSellerInput(SELLER_VALIDATION_RULES.sellerProfile);
      middleware(mockReq, mockRes, mockNext);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        HTTP_STATUS.BAD_REQUEST,
        'Validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Invalid phone format or value'] }
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateProduct', () => {
    it('should pass validation for valid product data', () => {
      mockReq.body = {
        name: 'Test Product',
        regularPrice: 100.50,
        stock: 50,
        category: '507f1f77bcf86cd799439011' // Valid ObjectId format
      };

      const middleware = validateProduct;
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(sendErrorResponse).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid price', () => {
      mockReq.body = {
        name: 'Test Product',
        regularPrice: -10, // Invalid negative price
        stock: 50,
        category: '507f1f77bcf86cd799439011'
      };

      const middleware = validateProduct;
      middleware(mockReq, mockRes, mockNext);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        HTTP_STATUS.BAD_REQUEST,
        'Validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Invalid regularPrice format or value'] }
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateOrder', () => {
    it('should pass validation for valid order ID', () => {
      mockReq.params = {
        orderId: '507f1f77bcf86cd799439011'
      };

      const middleware = validateOrder;
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(sendErrorResponse).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid order ID', () => {
      mockReq.params = {
        orderId: 'invalid-id'
      };

      const middleware = validateOrder;
      middleware(mockReq, mockRes, mockNext);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        HTTP_STATUS.BAD_REQUEST,
        'Validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Invalid orderId format or value'] }
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validatePayment', () => {
    it('should pass validation for valid payment data', () => {
      mockReq.body = {
        amount: 1000.50,
        paymentMethod: 'bank_transfer',
        accountNumber: '1234567890',
        ifscCode: 'SBIN0001234',
        accountHolderName: 'John Doe'
      };

      const middleware = validatePayment;
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(sendErrorResponse).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid payment method', () => {
      mockReq.body = {
        amount: 1000.50,
        paymentMethod: 'invalid_method',
        accountNumber: '1234567890',
        ifscCode: 'SBIN0001234',
        accountHolderName: 'John Doe'
      };

      const middleware = validatePayment;
      middleware(mockReq, mockRes, mockNext);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        HTTP_STATUS.BAD_REQUEST,
        'Validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Invalid paymentMethod format or value'] }
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateBankAccount', () => {
    it('should pass validation for valid bank account data', () => {
      mockReq.body = {
        accountNumber: '1234567890',
        ifscCode: 'SBIN0001234',
        accountHolderName: 'John Doe'
      };

      const middleware = validateBankAccount;
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(sendErrorResponse).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid IFSC code', () => {
      mockReq.body = {
        accountNumber: '1234567890',
        ifscCode: 'INVALID',
        accountHolderName: 'John Doe'
      };

      const middleware = validateBankAccount;
      middleware(mockReq, mockRes, mockNext);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        HTTP_STATUS.BAD_REQUEST,
        'Validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Invalid ifscCode format or value'] }
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateSellerFileUpload', () => {
    it('should pass validation for valid file upload', () => {
      mockReq.files = {
        profileImage: {
          mimetype: 'image/jpeg',
          size: 1024 * 1024 // 1MB
        }
      };

      const middleware = validateSellerFileUpload();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(sendErrorResponse).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid file type', () => {
      mockReq.files = {
        profileImage: {
          mimetype: 'text/plain',
          size: 1024
        }
      };

      const middleware = validateSellerFileUpload();
      middleware(mockReq, mockRes, mockNext);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        HTTP_STATUS.BAD_REQUEST,
        'File validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Invalid file format or size for profileImage'] }
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should fail validation for file too large', () => {
      mockReq.files = {
        profileImage: {
          mimetype: 'image/jpeg',
          size: 10 * 1024 * 1024 // 10MB
        }
      };

      const middleware = validateSellerFileUpload();
      middleware(mockReq, mockRes, mockNext);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        HTTP_STATUS.BAD_REQUEST,
        'File validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Invalid file format or size for profileImage'] }
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle middleware errors gracefully', () => {
      // Simulate an error by making req.body undefined
      mockReq.body = undefined;

      const middleware = validateSellerInput(SELLER_VALIDATION_RULES.sellerProfile);
      middleware(mockReq, mockRes, mockNext);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Internal server error during validation',
        ERROR_CODES.INTERNAL_ERROR
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
