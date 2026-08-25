const {
  validateInput,
  validateFileUpload,
  validateCategory,
  validateBrand,
  validateVariant,
  validatePayment,
  validateAddress,
  validateShipping,
  validateCommission,
  VALIDATION_RULES
} = require('../../middleware/validation');

describe('Validation Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      file: null
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('validateInput', () => {
    it('should pass validation for valid category data', () => {
      mockReq.body = {
        name: 'Electronics',
        description: 'Electronic products'
      };

      const middleware = validateInput(VALIDATION_RULES.category);
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should fail validation for missing required fields', () => {
      mockReq.body = {
        description: 'Electronic products'
      };

      const middleware = validateInput(VALIDATION_RULES.category);
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed',
        code: 'VALIDATION_FAILED',
        timestamp: expect.any(String),
        details: {
          errors: ['Missing required fields: name']
        }
      });
    });

    it('should fail validation for invalid field format', () => {
      mockReq.body = {
        name: 'A' // Too short
      };

      const middleware = validateInput(VALIDATION_RULES.category);
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed',
        code: 'VALIDATION_FAILED',
        timestamp: expect.any(String),
        details: {
          errors: ['Invalid name format']
        }
      });
    });

    it('should sanitize input data', () => {
      mockReq.body = {
        name: '  Electronics  ',
        description: '  Electronic products  '
      };

      const middleware = validateInput(VALIDATION_RULES.category);
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.name).toBe('Electronics');
      expect(mockReq.body.description).toBe('Electronic products');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept multipart array values for structured content fields', () => {
      const doc = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] });
      mockReq.body = {
        name: 'Test product',
        regularPrice: '100',
        category: '507f1f77bcf86cd799439011',
        featuresContent: ['', doc],
        usageSafetyContent: [doc],
      };

      const middleware = validateInput(VALIDATION_RULES.product);
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('validateFileUpload', () => {
    it('should pass validation for valid image file', () => {
      mockReq.file = {
        mimetype: 'image/jpeg',
        size: 1024 * 1024, // 1MB
        originalname: 'test-image.jpg'
      };

      const middleware = validateFileUpload();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid file type', () => {
      mockReq.file = {
        mimetype: 'text/plain',
        size: 1024,
        originalname: 'test.txt'
      };

      const middleware = validateFileUpload();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid file type. Allowed types: image/jpeg, image/png, image/gif, image/webp',
        code: 'VALIDATION_FAILED',
        timestamp: expect.any(String)
      });
    });

    it('should fail validation for file too large', () => {
      mockReq.file = {
        mimetype: 'image/jpeg',
        size: 10 * 1024 * 1024, // 10MB
        originalname: 'large-image.jpg'
      };

      const middleware = validateFileUpload({ maxSize: 5 * 1024 * 1024 });
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File too large. Maximum size: 5MB',
        code: 'VALIDATION_FAILED',
        timestamp: expect.any(String)
      });
    });

    it('should require file when required option is true', () => {
      const middleware = validateFileUpload({ required: true });
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File is required',
        code: 'VALIDATION_REQUIRED_FIELDS',
        timestamp: expect.any(String)
      });
    });

    it('should sanitize filename', () => {
      mockReq.file = {
        mimetype: 'image/jpeg',
        size: 1024,
        originalname: 'test file with spaces & symbols!.jpg'
      };

      const middleware = validateFileUpload();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.file.originalname).toBe('test_file_with_spaces___symbols_.jpg');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Predefined validation middlewares', () => {
    it('should validate brand data correctly', () => {
      mockReq.body = {
        name: 'Nike',
        description: 'Sports brand'
      };

      validateBrand(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate variant data correctly', () => {
      mockReq.body = {
        name: 'Color',
        values: ['Red', 'Blue', 'Green']
      };

      validateVariant(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate payment data correctly', () => {
      mockReq.body = {
        amount: 100.50,
        currency: 'USD'
      };

      validatePayment(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate address data correctly', () => {
      mockReq.body = {
        address1: '123 Main Street',
        pincode: '12345',
        country: 'US',
        state: 'CA',
        district: 'Los Angeles'
      };

      validateAddress(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate shipping data correctly', () => {
      mockReq.body = {
        name: 'Standard Shipping',
        cost: 9.99,
        description: 'Standard delivery'
      };

      validateShipping(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate commission data correctly', () => {
      mockReq.body = {
        percentage: 15.5
      };

      validateCommission(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle validation errors gracefully', () => {
      // Mock a validation function that throws an error
      const errorRules = {
        required: ['name'],
        validations: {
          name: () => {
            throw new Error('Validation error');
          }
        }
      };

      mockReq.body = { name: 'Test' };

      const middleware = validateInput(errorRules);
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal server error during validation',
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: expect.any(String)
      });
    });
  });
});
