const {
  sendErrorResponse,
  sendSuccessResponse,
  ERROR_MESSAGES,
  ERROR_CODES,
  HTTP_STATUS,
  errorHandler,
  asyncHandler
} = require('../../utils/errorHandler');

describe('Error Handling Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      path: '/test',
      body: {},
      params: {},
      query: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
    
    // Mock console.error to avoid cluttering test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendErrorResponse', () => {
    it('should send basic error response with message and timestamp', () => {
      sendErrorResponse(mockRes, HTTP_STATUS.BAD_REQUEST, 'Test error message');

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Test error message',
          timestamp: expect.any(String)
        })
      );
    });

    it('should include error code when provided', () => {
      sendErrorResponse(
        mockRes,
        HTTP_STATUS.NOT_FOUND,
        'Resource not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Resource not found',
          code: ERROR_CODES.RESOURCE_NOT_FOUND
        })
      );
    });

    it('should include error details when provided', () => {
      const details = { field: 'email', reason: 'Invalid format' };
      
      sendErrorResponse(
        mockRes,
        HTTP_STATUS.BAD_REQUEST,
        'Validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        details
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Validation failed',
          code: ERROR_CODES.VALIDATION_FAILED,
          details
        })
      );
    });

    it('should use correct status codes for different error types', () => {
      // Unauthorized
      sendErrorResponse(mockRes, HTTP_STATUS.UNAUTHORIZED, 'Auth error');
      expect(mockRes.status).toHaveBeenCalledWith(401);

      // Forbidden
      sendErrorResponse(mockRes, HTTP_STATUS.FORBIDDEN, 'Access denied');
      expect(mockRes.status).toHaveBeenCalledWith(403);

      // Server error
      sendErrorResponse(mockRes, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Server error');
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should format timestamp as ISO string', () => {
      const beforeTime = new Date().toISOString();
      sendErrorResponse(mockRes, HTTP_STATUS.BAD_REQUEST, 'Test error');
      const afterTime = new Date().toISOString();

      const response = mockRes.json.mock.calls[0][0];
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(response.timestamp >= beforeTime && response.timestamp <= afterTime).toBe(true);
    });
  });

  describe('sendSuccessResponse', () => {
    it('should send basic success response with message and timestamp', () => {
      sendSuccessResponse(mockRes, HTTP_STATUS.OK, 'Operation successful');

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Operation successful',
          timestamp: expect.any(String)
        })
      );
    });

    it('should include data when provided', () => {
      const data = { userId: '123', name: 'Test User' };
      
      sendSuccessResponse(mockRes, HTTP_STATUS.OK, 'User retrieved', data);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'User retrieved',
          data
        })
      );
    });

    it('should use correct status codes for different success types', () => {
      // OK
      sendSuccessResponse(mockRes, HTTP_STATUS.OK, 'Retrieved');
      expect(mockRes.status).toHaveBeenCalledWith(200);

      // Created
      sendSuccessResponse(mockRes, HTTP_STATUS.CREATED, 'Created');
      expect(mockRes.status).toHaveBeenCalledWith(201);

      // No Content
      sendSuccessResponse(mockRes, HTTP_STATUS.NO_CONTENT, 'Deleted');
      expect(mockRes.status).toHaveBeenCalledWith(204);
    });

    it('should not include data field when data is null', () => {
      sendSuccessResponse(mockRes, HTTP_STATUS.OK, 'Success message', null);

      const response = mockRes.json.mock.calls[0][0];
      expect(response).not.toHaveProperty('data');
    });
  });

  describe('errorHandler middleware', () => {
    it('should handle Mongoose ValidationError', () => {
      const err = {
        name: 'ValidationError',
        errors: {
          email: { message: 'Email is required' },
          password: { message: 'Password is too short' }
        }
      };

      errorHandler(err, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_FAILED,
          code: ERROR_CODES.VALIDATION_FAILED,
          details: {
            validationErrors: expect.arrayContaining([
              'Email is required',
              'Password is too short'
            ])
          }
        })
      );
    });

    it('should handle Mongoose duplicate key error (code 11000)', () => {
      const err = {
        code: 11000,
        keyValue: { email: 'test@example.com' }
      };

      errorHandler(err, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.CONFLICT);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'email already exists',
          code: ERROR_CODES.RESOURCE_ALREADY_EXISTS,
          details: { field: 'email' }
        })
      );
    });

    it('should handle JsonWebTokenError', () => {
      const err = {
        name: 'JsonWebTokenError',
        message: 'invalid token'
      };

      errorHandler(err, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.UNAUTHORIZED);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: ERROR_MESSAGES.TOKEN_INVALID,
          code: ERROR_CODES.AUTH_TOKEN_INVALID
        })
      );
    });

    it('should handle TokenExpiredError', () => {
      const err = {
        name: 'TokenExpiredError',
        message: 'jwt expired'
      };

      errorHandler(err, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.UNAUTHORIZED);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Token has expired',
          code: ERROR_CODES.AUTH_TOKEN_INVALID
        })
      );
    });

    it('should handle unknown errors with default server error response', () => {
      const err = new Error('Unknown error');

      errorHandler(err, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          code: ERROR_CODES.INTERNAL_SERVER_ERROR
        })
      );
    });

    it('should log errors to console', () => {
      const err = new Error('Test error');

      errorHandler(err, mockReq, mockRes, mockNext);

      expect(console.error).toHaveBeenCalledWith('❌ Error:', err);
    });
  });

  describe('asyncHandler wrapper', () => {
    it('should wrap async controller and handle successful execution', async () => {
      const mockController = jest.fn().mockResolvedValue('success');
      const wrappedController = asyncHandler(mockController);

      await wrappedController(mockReq, mockRes, mockNext);

      expect(mockController).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch async errors and pass them to next middleware', async () => {
      const error = new Error('Async error');
      const mockController = jest.fn().mockRejectedValue(error);
      const wrappedController = asyncHandler(mockController);

      await wrappedController(mockReq, mockRes, mockNext);

      expect(mockController).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle synchronous errors in async controllers', async () => {
      const error = new Error('Sync error');
      const mockController = jest.fn().mockImplementation(() => {
        throw error;
      });
      const wrappedController = asyncHandler(mockController);

      await wrappedController(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should maintain controller context', async () => {
      const mockController = async function(req, res, next) {
        expect(req).toBe(mockReq);
        expect(res).toBe(mockRes);
        expect(next).toBe(mockNext);
        return 'success';
      };
      const wrappedController = asyncHandler(mockController);

      await wrappedController(mockReq, mockRes, mockNext);
    });
  });

  describe('ERROR_MESSAGES constants', () => {
    it('should have authentication error messages', () => {
      expect(ERROR_MESSAGES.INVALID_CREDENTIALS).toBeDefined();
      expect(ERROR_MESSAGES.TOKEN_REQUIRED).toBeDefined();
      expect(ERROR_MESSAGES.TOKEN_INVALID).toBeDefined();
      expect(ERROR_MESSAGES.ACCESS_DENIED).toBeDefined();
    });

    it('should have validation error messages', () => {
      expect(ERROR_MESSAGES.VALIDATION_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.REQUIRED_FIELDS_MISSING).toBeDefined();
      expect(ERROR_MESSAGES.INVALID_EMAIL_FORMAT).toBeDefined();
      expect(ERROR_MESSAGES.INVALID_PHONE_FORMAT).toBeDefined();
    });

    it('should have resource error messages', () => {
      expect(ERROR_MESSAGES.USER_NOT_FOUND).toBeDefined();
      expect(ERROR_MESSAGES.SELLER_NOT_FOUND).toBeDefined();
      expect(ERROR_MESSAGES.RESOURCE_NOT_FOUND).toBeDefined();
      expect(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS).toBeDefined();
    });

    it('should have server error messages', () => {
      expect(ERROR_MESSAGES.INTERNAL_SERVER_ERROR).toBeDefined();
      expect(ERROR_MESSAGES.DATABASE_ERROR).toBeDefined();
    });
  });

  describe('ERROR_CODES constants', () => {
    it('should have authentication error codes', () => {
      expect(ERROR_CODES.AUTH_INVALID_CREDENTIALS).toBe('AUTH_INVALID_CREDENTIALS');
      expect(ERROR_CODES.AUTH_TOKEN_REQUIRED).toBe('AUTH_TOKEN_REQUIRED');
      expect(ERROR_CODES.AUTH_TOKEN_INVALID).toBe('AUTH_TOKEN_INVALID');
    });

    it('should have validation error codes', () => {
      expect(ERROR_CODES.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
      expect(ERROR_CODES.VALIDATION_REQUIRED_FIELDS).toBe('VALIDATION_REQUIRED_FIELDS');
      expect(ERROR_CODES.VALIDATION_INVALID_FORMAT).toBe('VALIDATION_INVALID_FORMAT');
    });

    it('should have resource error codes', () => {
      expect(ERROR_CODES.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND');
      expect(ERROR_CODES.RESOURCE_ALREADY_EXISTS).toBe('RESOURCE_ALREADY_EXISTS');
    });

    it('should have server error codes', () => {
      expect(ERROR_CODES.INTERNAL_SERVER_ERROR).toBe('INTERNAL_SERVER_ERROR');
      expect(ERROR_CODES.DATABASE_ERROR).toBe('DATABASE_ERROR');
    });
  });

  describe('HTTP_STATUS constants', () => {
    it('should have success status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.NO_CONTENT).toBe(204);
    });

    it('should have client error status codes', () => {
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.CONFLICT).toBe(409);
    });

    it('should have server error status codes', () => {
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
      expect(HTTP_STATUS.SERVICE_UNAVAILABLE).toBe(503);
    });
  });
});

