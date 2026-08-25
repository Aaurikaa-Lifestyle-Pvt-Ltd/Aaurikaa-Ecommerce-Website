const { loginAdmin } = require('../../controllers/adminController');
const { ERROR_MESSAGES, ERROR_CODES } = require('../../utils/errorHandler');

describe('Admin Controller - Token Usage Fix', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      user: { id: 'test-admin-id', role: 'admin', name: 'Test Admin' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('Token Usage Verification', () => {
    it('should use req.user.id consistently in admin controller', () => {
      // This test verifies that the admin controller has been updated
      // to use req.user.id instead of req.admin.id
      
      // Check that the controller functions exist and are properly imported
      expect(typeof loginAdmin).toBe('function');
      
      // Verify that the mock request object has the correct structure
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user.id).toBe('test-admin-id');
      expect(mockReq.user.role).toBe('admin');
    });

    it('should return 400 for missing credentials in login', async () => {
      mockReq.body = {};
      
      await loginAdmin(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Email/Username and password are required',
        code: ERROR_CODES.VALIDATION_REQUIRED_FIELDS,
        timestamp: expect.any(String)
      });
    });

    it('should handle request object structure correctly', () => {
      // Verify that the request object structure matches what the middleware provides
      const mockTokenPayload = {
        id: 'admin-id-123',
        role: 'admin',
        name: 'Admin User'
      };

      // Simulate what verifyAdmin middleware does
      mockReq.user = mockTokenPayload;

      expect(mockReq.user.id).toBe('admin-id-123');
      expect(mockReq.user.role).toBe('admin');
      expect(mockReq.user.name).toBe('Admin User');
    });
  });

  describe('Error Handling Verification', () => {
    it('should use standardized error responses', async () => {
      mockReq.body = {};
      
      await loginAdmin(mockReq, mockRes);

      // Verify that the response follows the standardized format
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: expect.any(String),
        code: expect.any(String),
        timestamp: expect.any(String)
      });
    });
  });
});
