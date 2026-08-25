const jwt = require('jsonwebtoken');
const verifyAdmin = require('../../middleware/verifyAdmin');

// Mock environment variable
process.env.JWT_SECRET = 'test-secret-key';

describe('verifyAdmin Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Validation', () => {
    it('should return 401 when no authorization header is provided', () => {
      verifyAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "❌ No token provided" });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header does not start with Bearer', () => {
      req.headers.authorization = 'Invalid token';

      verifyAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "❌ No token provided" });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when token is invalid', () => {
      req.headers.authorization = 'Bearer invalid-token';

      verifyAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "❌ Invalid token" });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Role Validation', () => {
    it('should allow access when user has admin role', () => {
      const adminToken = jwt.sign(
        { id: 'admin-id', role: 'admin', name: 'Admin User' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      req.headers.authorization = `Bearer ${adminToken}`;

      verifyAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(req.user).toMatchObject({
        id: 'admin-id',
        _id: 'admin-id',
        role: 'admin',
        name: 'Admin User'
      });
      expect(req.user).toHaveProperty('iat', expect.any(Number));
      expect(req.user).toHaveProperty('exp', expect.any(Number));
    });

    it('should deny access when user has seller role', () => {
      const sellerToken = jwt.sign(
        { id: 'seller-id', role: 'seller', name: 'Seller User' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      req.headers.authorization = `Bearer ${sellerToken}`;

      verifyAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        message: "❌ Access denied. Admin role required." 
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access when user has shopper role', () => {
      const shopperToken = jwt.sign(
        { id: 'shopper-id', role: 'shopper', name: 'Shopper User' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      req.headers.authorization = `Bearer ${shopperToken}`;

      verifyAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        message: "❌ Access denied. Admin role required." 
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access when token has no role field', () => {
      const tokenWithoutRole = jwt.sign(
        { id: 'user-id', name: 'User' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      req.headers.authorization = `Bearer ${tokenWithoutRole}`;

      verifyAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        message: "❌ Access denied. Admin role required." 
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access when token has null role', () => {
      const tokenWithNullRole = jwt.sign(
        { id: 'user-id', role: null, name: 'User' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      req.headers.authorization = `Bearer ${tokenWithNullRole}`;

      verifyAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        message: "❌ Access denied. Admin role required." 
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle expired tokens', () => {
      const expiredToken = jwt.sign(
        { id: 'admin-id', role: 'admin', name: 'Admin User' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );
      req.headers.authorization = `Bearer ${expiredToken}`;

      verifyAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "❌ Invalid token" });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle malformed Bearer token', () => {
      req.headers.authorization = 'Bearer ';

      verifyAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "❌ Invalid token" });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
