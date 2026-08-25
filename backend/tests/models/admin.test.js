const mongoose = require('mongoose');
const Admin = require('../../models/Admin');

describe('Admin Model Validation', () => {
  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test_ecommerce');
  });

  afterAll(async () => {
    // Clean up and disconnect
    await Admin.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await Admin.deleteMany({});
  });

  describe('Required Fields Validation', () => {
    it('should require name field', async () => {
      const admin = new Admin({
        username: 'testadmin',
        email: 'test@example.com',
        password: 'Test123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Admin name is required');
    });

    it('should require username field', async () => {
      const admin = new Admin({
        name: 'Test Admin',
        email: 'test@example.com',
        password: 'Test123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Username is required');
    });

    it('should require email field', async () => {
      const admin = new Admin({
        name: 'Test Admin',
        username: 'testadmin',
        password: 'Test123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Email is required');
    });

    it('should require password field', async () => {
      const admin = new Admin({
        name: 'Test Admin',
        username: 'testadmin',
        email: 'test@example.com'
      });

      await expect(admin.save()).rejects.toThrow('Password is required');
    });
  });

  describe('Name Validation', () => {
    it('should accept valid name', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.name).toBe('John Doe');
    });

    it('should reject name with less than 2 characters', async () => {
      const admin = new Admin({
        name: 'J',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Name must be at least 2 characters long');
    });

    it('should reject name with more than 50 characters', async () => {
      const admin = new Admin({
        name: 'A'.repeat(51),
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Name cannot exceed 50 characters');
    });

    it('should reject name with special characters', async () => {
      const admin = new Admin({
        name: 'John123',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Name can only contain letters and spaces');
    });
  });

  describe('Username Validation', () => {
    it('should accept valid username', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe123',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.username).toBe('johndoe123');
    });

    it('should convert username to lowercase', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'JOHN_DOE',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.username).toBe('john_doe');
    });

    it('should reject username with less than 3 characters', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'jo',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Username must be at least 3 characters long');
    });

    it('should reject username with special characters', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'john@doe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Username can only contain letters, numbers, and underscores');
    });
  });

  describe('Email Validation', () => {
    it('should accept valid email', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.email).toBe('john@example.com');
    });

    it('should convert email to lowercase', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'JOHN@EXAMPLE.COM',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.email).toBe('john@example.com');
    });

    it('should reject invalid email format', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'invalid-email',
        password: 'Test123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Please provide a valid email address');
    });
  });

  describe('Password Validation', () => {
    it('should accept valid password', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.password).toBeDefined();
      expect(savedAdmin.password).not.toBe('Test123!@#'); // Should be hashed
    });

    it('should reject password with less than 8 characters', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test1!'
      });

      await expect(admin.save()).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should reject password without uppercase letter', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'test123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    });

    it('should reject password without lowercase letter', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'TEST123!@#'
      });

      await expect(admin.save()).rejects.toThrow('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    });

    it('should reject password without number', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'TestPassword!@#'
      });

      await expect(admin.save()).rejects.toThrow('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    });

    it('should reject password without special character', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'TestPassword123'
      });

      await expect(admin.save()).rejects.toThrow('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    });
  });

  describe('Phone Validation', () => {
    it('should accept valid phone number', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#',
        phone: '+1234567890'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.phone).toBe('+1234567890');
    });

    it('should accept empty phone number', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.phone).toBeUndefined();
    });

    it('should reject invalid phone number', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#',
        phone: 'invalid-phone'
      });

      await expect(admin.save()).rejects.toThrow('Please provide a valid phone number');
    });
  });

  describe('Profile Image Validation', () => {
    it('should accept valid image file', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#',
        profileImage: 'profile.jpg'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.profileImage).toBe('profile.jpg');
    });

    it('should accept empty profile image', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.profileImage).toBeUndefined();
    });

    it('should reject invalid image file', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#',
        profileImage: 'document.pdf'
      });

      await expect(admin.save()).rejects.toThrow('Profile image must be a valid image file (jpg, jpeg, png, gif, webp)');
    });
  });

  describe('Unique Constraints', () => {
    it('should enforce unique username', async () => {
      const admin1 = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const admin2 = new Admin({
        name: 'Jane Doe',
        username: 'johndoe',
        email: 'jane@example.com',
        password: 'Test123!@#'
      });

      await admin1.save();
      await expect(admin2.save()).rejects.toThrow('duplicate key error');
    });

    it('should enforce unique email', async () => {
      const admin1 = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const admin2 = new Admin({
        name: 'Jane Doe',
        username: 'janedoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      await admin1.save();
      await expect(admin2.save()).rejects.toThrow('duplicate key error');
    });
  });

  describe('Model Methods', () => {
    it('should hash password before saving', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.password).not.toBe('Test123!@#');
      expect(savedAdmin.password.length).toBeGreaterThan(50); // bcrypt hash length
    });

    it('should compare password correctly', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      const isMatch = await savedAdmin.comparePassword('Test123!@#');
      expect(isMatch).toBe(true);

      const isNotMatch = await savedAdmin.comparePassword('WrongPassword');
      expect(isNotMatch).toBe(false);
    });

    it('should find admin by credentials', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      await admin.save();

      const foundByEmail = await Admin.findByCredentials('john@example.com');
      expect(foundByEmail).toBeDefined();
      expect(foundByEmail.email).toBe('john@example.com');

      const foundByUsername = await Admin.findByCredentials('johndoe');
      expect(foundByUsername).toBeDefined();
      expect(foundByUsername.username).toBe('johndoe');
    });
  });

  describe('Default Values', () => {
    it('should set default role to admin', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.role).toBe('admin');
    });

    it('should set default isActive to true', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.isActive).toBe(true);
    });

    it('should set default loginAttempts to 0', async () => {
      const admin = new Admin({
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const savedAdmin = await admin.save();
      expect(savedAdmin.loginAttempts).toBe(0);
    });
  });
});
