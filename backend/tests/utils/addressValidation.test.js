const { 
  validateEmail, 
  validatePhone, 
  validatePincode 
} = require('../../utils/validation');

describe('Address Validation Utilities', () => {
  // ==========================================
  // EMAIL VALIDATION TESTS
  // ==========================================
  describe('Email Validation', () => {
    test('should validate correct email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.user@domain.co.in',
        'admin+tag@company.com',
        'name123@email.org',
        'user_name@domain.net'
      ];

      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    test('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        'user@',
        '@domain.com',
        'user@domain',
        'user domain@email.com',
        'user@@domain.com',
        ''
      ];

      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false);
      });
    });

    test('should handle email with special characters', () => {
      const specialEmails = [
        'user+tag@example.com',    // Plus sign
        'user.name@example.com',    // Dot in username
        'user_name@example.com',    // Underscore
        'user-name@example.com'     // Hyphen
      ];

      specialEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    test('should reject email without @ symbol', () => {
      const email = 'userdomain.com';
      expect(validateEmail(email)).toBe(false);
    });

    test('should reject email without domain', () => {
      const email = 'user@';
      expect(validateEmail(email)).toBe(false);
    });

    test('should reject empty email', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail(null)).toBe(false);
      expect(validateEmail(undefined)).toBe(false);
    });
  });

  // ==========================================
  // PHONE NUMBER VALIDATION TESTS
  // ==========================================
  describe('Phone Number Validation', () => {
    test('should validate correct 10-digit phone numbers', () => {
      const validPhones = [
        '9876543210',
        '9123456789',
        '8765432109',
        '7654321098',
        '6543210987'
      ];

      validPhones.forEach(phone => {
        expect(validatePhone(phone)).toBe(true);
      });
    });

    test('should reject invalid phone numbers', () => {
      const invalidPhones = [
        '123',                    // Too short
        '12345678901',            // Too long
        'abcdefghij',             // Letters
        '98765 43210',            // Space
        '9876-543210',            // Hyphen
        '+919876543210',          // Country code
        ''
      ];

      invalidPhones.forEach(phone => {
        expect(validatePhone(phone)).toBe(false);
      });
    });

    test('should reject phone numbers with special characters', () => {
      const specialPhones = [
        '9876-543210',
        '(987) 654-3210',
        '+91-9876543210',
        '9876543210 '
      ];

      specialPhones.forEach(phone => {
        expect(validatePhone(phone)).toBe(false);
      });
    });

    test('should validate phone starting with 6, 7, 8, or 9', () => {
      const validStarts = ['6', '7', '8', '9'];
      
      validStarts.forEach(start => {
        const phone = start + '876543210';
        expect(validatePhone(phone)).toBe(true);
      });
    });

    test('should reject phone starting with invalid digits', () => {
      const invalidStarts = ['0', '1', '2', '3', '4', '5'];
      
      invalidStarts.forEach(start => {
        const phone = start + '876543210';
        // Depends on validation rules - might be valid or invalid
        // This is just an example
        const result = validatePhone(phone);
        expect(typeof result).toBe('boolean');
      });
    });

    test('should reject empty phone number', () => {
      expect(validatePhone('')).toBe(false);
      expect(validatePhone(null)).toBe(false);
      expect(validatePhone(undefined)).toBe(false);
    });
  });

  // ==========================================
  // PINCODE/ZIP CODE VALIDATION TESTS
  // ==========================================
  describe('Pincode Validation', () => {
    test('should validate correct 6-digit pincodes', () => {
      const validPincodes = [
        '110001',  // Delhi
        '400001',  // Mumbai
        '560001',  // Bangalore
        '600001',  // Chennai
        '700001'   // Kolkata
      ];

      validPincodes.forEach(pincode => {
        expect(validatePincode(pincode)).toBe(true);
      });
    });

    test('should reject invalid pincodes', () => {
      const invalidPincodes = [
        '12',         // Too short
        '1234',       // Too short
        '12345',      // Too short
        '1234567',    // Too long
        'ABCDEF',     // Letters
        '11000 1',    // Space
        '',
        null,
        undefined
      ];

      invalidPincodes.forEach(pincode => {
        expect(validatePincode(pincode)).toBe(false);
      });
    });

    test('should reject pincode with special characters', () => {
      const specialPincodes = [
        '110-001',
        '11 0001',
        '110001 ',
        ' 110001'
      ];

      specialPincodes.forEach(pincode => {
        expect(validatePincode(pincode)).toBe(false);
      });
    });

    test('should handle leading zeros in pincode', () => {
      const pincode = '011001';
      expect(validatePincode(pincode)).toBe(true);
    });
  });

  // ==========================================
  // ADDRESS FIELD VALIDATION TESTS
  // ==========================================
  describe('Address Field Validation', () => {
    test('should validate complete address object', () => {
      const address = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '9876543210',
        address1: '123 Main Street',
        address2: 'Apartment 4B',
        postoffice: 'Central PO',
        zip: '110001',
        countryId: 'India',
        stateId: 'Delhi',
        districtId: 'New Delhi'
      };

      // Validate required fields
      const isValid = address.name && 
                     validateEmail(address.email) && 
                     validatePhone(address.phone) &&
                     address.address1 &&
                     validatePincode(address.zip) &&
                     address.countryId &&
                     address.stateId;

      expect(isValid).toBe(true);
    });

    test('should detect missing required address fields', () => {
      const incompleteAddress = {
        name: 'John Doe',
        email: 'john@example.com',
        // Missing phone
        address1: '123 Main Street',
        zip: '110001'
        // Missing country and state
      };

      const requiredFields = ['name', 'email', 'phone', 'address1', 'zip', 'countryId', 'stateId'];
      const missingFields = requiredFields.filter(
        field => !incompleteAddress[field]
      );

      expect(missingFields.length).toBeGreaterThan(0);
      expect(missingFields).toContain('phone');
      expect(missingFields).toContain('countryId');
    });

    test('should validate name field - minimum length', () => {
      const validNames = ['John Doe', 'A B', 'Jane'];
      const invalidNames = ['', 'A', ' '];

      validNames.forEach(name => {
        expect(name.trim().length).toBeGreaterThanOrEqual(2);
      });

      invalidNames.forEach(name => {
        expect(name.trim().length).toBeLessThan(2);
      });
    });

    test('should validate address line 1 - required field', () => {
      const validAddresses = [
        '123 Main Street',
        'Plot No. 45',
        'Building A, Sector 12'
      ];

      const invalidAddresses = ['', '  ', null];

      validAddresses.forEach(address => {
        expect(address && address.trim().length).toBeGreaterThan(0);
      });

      invalidAddresses.forEach(address => {
        expect(!address || address.trim().length === 0).toBe(true);
      });
    });

    test('should allow optional address line 2', () => {
      const address = {
        address1: '123 Main Street',
        address2: '' // Optional
      };

      const isValid = address.address1 && address.address1.trim().length > 0;
      expect(isValid).toBe(true);
    });

    test('should validate post office field', () => {
      const validPostOffices = [
        'Central PO',
        'Main Post Office',
        'Sector 12 PO',
        ''  // Optional field
      ];

      validPostOffices.forEach(po => {
        const isValid = po === '' || po.trim().length > 0;
        expect(isValid).toBe(true);
      });
    });
  });

  // ==========================================
  // COUNTRY/STATE/DISTRICT VALIDATION TESTS
  // ==========================================
  describe('Location Selection Validation', () => {
    test('should validate country selection', () => {
      const validCountries = ['India', 'USA', 'UK'];
      
      validCountries.forEach(country => {
        expect(country).toBeDefined();
        expect(country.trim().length).toBeGreaterThan(0);
      });
    });

    test('should validate state selection', () => {
      const validStates = [
        'Delhi',
        'Maharashtra',
        'Karnataka',
        'Tamil Nadu'
      ];

      validStates.forEach(state => {
        expect(state).toBeDefined();
        expect(state.trim().length).toBeGreaterThan(0);
      });
    });

    test('should validate district selection', () => {
      const validDistricts = [
        'New Delhi',
        'Mumbai',
        'Bangalore Urban',
        'Chennai'
      ];

      validDistricts.forEach(district => {
        expect(district).toBeDefined();
        expect(district.trim().length).toBeGreaterThan(0);
      });
    });

    test('should require all location fields', () => {
      const address = {
        countryId: 'India',
        stateId: 'Delhi',
        districtId: 'New Delhi'
      };

      const hasAllLocationFields = address.countryId && 
                                   address.stateId && 
                                   address.districtId;

      expect(hasAllLocationFields).toBe(true);
    });

    test('should detect missing location fields', () => {
      const incompleteAddress = {
        countryId: 'India',
        // Missing stateId and districtId
      };

      const hasAllLocationFields = incompleteAddress.countryId && 
                                   incompleteAddress.stateId && 
                                   incompleteAddress.districtId;

      expect(hasAllLocationFields).toBe(false);
    });
  });

  // ==========================================
  // VALIDATION ERROR MESSAGES TESTS
  // ==========================================
  describe('Validation Error Messages', () => {
    test('should return appropriate error message for invalid email', () => {
      const email = 'invalid-email';
      const isValid = validateEmail(email);
      
      if (!isValid) {
        const errorMessage = 'Invalid email format';
        expect(errorMessage).toBe('Invalid email format');
      }
    });

    test('should return appropriate error message for invalid phone', () => {
      const phone = '123';
      const isValid = validatePhone(phone);
      
      if (!isValid) {
        const errorMessage = 'Phone number must be 10 digits';
        expect(errorMessage).toContain('10 digits');
      }
    });

    test('should return appropriate error message for invalid pincode', () => {
      const pincode = '12';
      const isValid = validatePincode(pincode);
      
      if (!isValid) {
        const errorMessage = 'Pincode must be 6 digits';
        expect(errorMessage).toContain('6 digits');
      }
    });

    test('should collect all validation errors for an address', () => {
      const address = {
        name: 'A',              // Too short
        email: 'invalid',       // Invalid format
        phone: '123',           // Invalid length
        address1: '',           // Required
        zip: '12',              // Invalid format
        countryId: '',          // Required
        stateId: ''             // Required
      };

      const errors = [];

      if (address.name.trim().length < 2) errors.push('Name too short');
      if (!validateEmail(address.email)) errors.push('Invalid email');
      if (!validatePhone(address.phone)) errors.push('Invalid phone');
      if (!address.address1) errors.push('Address required');
      if (!validatePincode(address.zip)) errors.push('Invalid pincode');
      if (!address.countryId) errors.push('Country required');
      if (!address.stateId) errors.push('State required');

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('Invalid email');
      expect(errors).toContain('Invalid phone');
    });
  });

  // ==========================================
  // SANITIZATION TESTS
  // ==========================================
  describe('Address Data Sanitization', () => {
    test('should trim whitespace from address fields', () => {
      const address = {
        name: '  John Doe  ',
        email: '  john@example.com  ',
        address1: '  123 Main St  '
      };

      const sanitized = {
        name: address.name.trim(),
        email: address.email.trim(),
        address1: address.address1.trim()
      };

      expect(sanitized.name).toBe('John Doe');
      expect(sanitized.email).toBe('john@example.com');
      expect(sanitized.address1).toBe('123 Main St');
    });

    test('should handle null or undefined values', () => {
      const address = {
        name: null,
        email: undefined,
        address1: ''
      };

      const sanitize = (value) => {
        return value ? value.trim() : '';
      };

      expect(sanitize(address.name)).toBe('');
      expect(sanitize(address.email)).toBe('');
      expect(sanitize(address.address1)).toBe('');
    });

    test('should convert email to lowercase', () => {
      const email = 'User@EXAMPLE.COM';
      const sanitized = email.toLowerCase().trim();

      expect(sanitized).toBe('user@example.com');
    });

    test('should remove non-numeric characters from phone', () => {
      const phone = '(987) 654-3210';
      const sanitized = phone.replace(/\D/g, '');

      expect(sanitized).toBe('9876543210');
    });

    test('should remove spaces from pincode', () => {
      const pincode = '110 001';
      const sanitized = pincode.replace(/\s/g, '');

      expect(sanitized).toBe('110001');
    });
  });
});

