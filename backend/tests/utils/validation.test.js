const {
  isValidEmail,
  isValidPhone,
  isValidUsername,
  isValidPassword,
  isValidUrl,
  isValidPincode,
  validateRequiredFields,
  validateRegistrationData,
  sanitizeInput,
  VALIDATION_RULES
} = require('../../utils/validation');

describe('Validation Utils', () => {
  describe('isValidEmail', () => {
    it('should validate correct email formats', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('admin+tag@company.org')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@domain')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('should validate correct phone formats', () => {
      expect(isValidPhone('1234567890')).toBe(true);
      expect(isValidPhone('+1234567890')).toBe(true);
      expect(isValidPhone('9876543210')).toBe(true);
    });

    it('should reject invalid phone formats', () => {
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('abc1234567')).toBe(false);
      expect(isValidPhone('123-456-7890')).toBe(false);
      expect(isValidPhone('')).toBe(false);
    });
  });

  describe('isValidUsername', () => {
    it('should validate correct username formats', () => {
      expect(isValidUsername('user123')).toBe(true);
      expect(isValidUsername('test_user')).toBe(true);
      expect(isValidUsername('user-name')).toBe(true);
      expect(isValidUsername('abc')).toBe(true);
      expect(isValidUsername('a'.repeat(30))).toBe(true);
    });

    it('should reject invalid username formats', () => {
      expect(isValidUsername('ab')).toBe(false); // too short
      expect(isValidUsername('a'.repeat(31))).toBe(false); // too long
      expect(isValidUsername('user@name')).toBe(false); // invalid character
      expect(isValidUsername('user name')).toBe(false); // space
      expect(isValidUsername('')).toBe(false);
    });
  });

  describe('isValidPassword', () => {
    it('should validate strong passwords', () => {
      expect(isValidPassword('password123')).toBe(true);
      expect(isValidPassword('MyPass123')).toBe(true);
      expect(isValidPassword('Test@123')).toBe(true);
    });

    it('should reject weak passwords', () => {
      expect(isValidPassword('password')).toBe(false); // no number
      expect(isValidPassword('12345678')).toBe(false); // no letter
      expect(isValidPassword('pass123')).toBe(false); // too short
      expect(isValidPassword('')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('should validate correct URL formats', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://www.example.com')).toBe(true);
      expect(isValidUrl('https://subdomain.example.co.uk')).toBe(true);
      expect(isValidUrl('example.com')).toBe(true); // Now supports domain-only URLs
      expect(isValidUrl('www.example.com')).toBe(true); // Now supports www without protocol
      expect(isValidUrl('myshop.com/vendor/store-name')).toBe(true); // Now supports paths
    });

    it('should reject invalid URL formats', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('just-text')).toBe(false);
    });
  });

  describe('isValidPincode', () => {
    it('should validate correct pincode formats', () => {
      expect(isValidPincode('123456')).toBe(true);
      expect(isValidPincode('000000')).toBe(true);
      expect(isValidPincode('999999')).toBe(true);
      expect(isValidPincode('1234')).toBe(true); // Now supports 4 digits
      expect(isValidPincode('1234567890')).toBe(true); // Now supports up to 10 digits
    });

    it('should reject invalid pincode formats', () => {
      expect(isValidPincode('123')).toBe(false); // too short (less than 4)
      expect(isValidPincode('12345678901')).toBe(false); // too long (more than 10)
      expect(isValidPincode('12345a')).toBe(false); // non-numeric
      expect(isValidPincode('')).toBe(false);
    });
  });

  describe('validateRequiredFields', () => {
    it('should pass when all required fields are present', () => {
      const data = { name: 'John', email: 'john@example.com', phone: '1234567890' };
      const required = ['name', 'email', 'phone'];
      const result = validateRequiredFields(data, required);
      
      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should fail when required fields are missing', () => {
      const data = { name: 'John' };
      const required = ['name', 'email', 'phone'];
      const result = validateRequiredFields(data, required);
      
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toEqual(['email', 'phone']);
    });

    it('should fail when required fields are empty strings', () => {
      const data = { name: 'John', email: '', phone: '   ' };
      const required = ['name', 'email', 'phone'];
      const result = validateRequiredFields(data, required);
      
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toEqual(['email', 'phone']);
    });
  });

  describe('validateRegistrationData', () => {
    describe('Admin validation', () => {
      it('should validate correct admin data', () => {
        const data = {
          name: 'Admin User',
          username: 'admin123',
          email: 'admin@example.com',
          phone: '1234567890',
          password: 'password123'
        };
        
        const result = validateRegistrationData(data, 'admin');
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should fail with missing required fields', () => {
        const data = {
          name: 'Admin User',
          email: 'admin@example.com'
        };
        
        const result = validateRegistrationData(data, 'admin');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing required fields: username, phone, password');
      });

      it('should fail with invalid field formats', () => {
        const data = {
          name: 'A', // too short
          username: 'ab', // too short
          email: 'invalid-email',
          phone: '123',
          password: 'weak'
        };
        
        const result = validateRegistrationData(data, 'admin');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('Seller validation', () => {
      it('should validate correct seller data', () => {
        const data = {
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
        
        const result = validateRegistrationData(data, 'seller');
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should fail when passwords do not match', () => {
        const data = {
          firstName: 'John',
          lastName: 'Doe',
          username: 'seller123',
          email: 'seller@example.com',
          phone: '1234567890',
          shopName: 'My Shop',
          shopUrl: 'https://myshop.com',
          password: 'password123',
          confirmPassword: 'different123',
          address1: '123 Main Street',
          pincode: '123456',
          country: 'India',
          state: 'Maharashtra',
          district: 'Mumbai'
        };
        
        const result = validateRegistrationData(data, 'seller');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid confirmPassword format');
      });
    });

    describe('Shopper validation', () => {
      it('should validate correct shopper data', () => {
        const data = {
          firstName: 'Jane',
          lastName: 'Smith',
          username: 'shopper123',
          email: 'shopper@example.com',
          phone: '1234567890',
          password: 'password123'
        };
        
        const result = validateRegistrationData(data, 'shopper');
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });

    it('should fail with invalid user type', () => {
      const data = { name: 'Test' };
      const result = validateRegistrationData(data, 'invalid');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid user type');
    });
  });

  describe('sanitizeInput', () => {
    it('should trim string values', () => {
      const data = {
        name: '  John Doe  ',
        email: 'test@example.com',
        age: 25,
        active: true
      };
      
      const result = sanitizeInput(data);
      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('test@example.com');
      expect(result.age).toBe(25);
      expect(result.active).toBe(true);
    });

    it('should handle empty object', () => {
      const result = sanitizeInput({});
      expect(result).toEqual({});
    });
  });
});
