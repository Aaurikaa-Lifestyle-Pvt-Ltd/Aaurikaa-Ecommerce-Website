// backend/tests/services/r2UploadService.test.js
const {
  generateSecureFilename,
  generatePresignedUploadUrl,
  uploadFileToR2,
  deleteFileFromR2,
  checkFileExistsInR2,
  getPublicUrl,
  extractKeyFromUrl
} = require('../../services/r2UploadService');

// Mock the AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('R2 Upload Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSecureFilename', () => {
    test('should generate secure filename with folder', () => {
      const result = generateSecureFilename('test-image.jpg', 'images');
      expect(result).toMatch(/^images\/\d+_[a-f0-9]{32}_test-image\.jpg$/);
    });

    test('should generate secure filename without folder', () => {
      const result = generateSecureFilename('test-image.jpg');
      expect(result).toMatch(/^\d+_[a-f0-9]{32}_test-image\.jpg$/);
    });

    test('should handle undefined originalname', () => {
      const result = generateSecureFilename(undefined, 'images');
      expect(result).toMatch(/^images\/\d+_[a-f0-9]{32}_file$/);
    });

    test('should sanitize dangerous characters in filename', () => {
      const result = generateSecureFilename('test<>:"|?*image.jpg', 'images');
      expect(result).toMatch(/^images\/\d+_[a-f0-9]{32}_test______image\.jpg$/);
    });
  });

  describe('getPublicUrl', () => {
    test('should generate public URL from key', () => {
      const result = getPublicUrl('images/test-image.jpg');
      expect(result).toMatch(/^https:\/\/.*\/images\/test-image\.jpg$/);
    });

    test('should return null for empty key', () => {
      const result = getPublicUrl('');
      expect(result).toBeNull();
    });

    test('should return URL as-is if already a full URL', () => {
      const url = 'https://example.com/test-image.jpg';
      const result = getPublicUrl(url);
      expect(result).toBe(url);
    });

    test('should remove leading slash from key', () => {
      const result = getPublicUrl('/images/test-image.jpg');
      expect(result).toMatch(/^https:\/\/.*\/images\/test-image\.jpg$/);
    });
  });

  describe('extractKeyFromUrl', () => {
    test('should extract key from valid URL', () => {
      const url = 'https://example.com/images/test-image.jpg';
      const result = extractKeyFromUrl(url);
      expect(result).toBe('images/test-image.jpg');
    });

    test('should return null for invalid URL', () => {
      const result = extractKeyFromUrl('invalid-url');
      expect(result).toBeNull();
    });

    test('should return null for empty URL', () => {
      const result = extractKeyFromUrl('');
      expect(result).toBeNull();
    });
  });

  describe('generatePresignedUploadUrl', () => {
    test('should handle missing environment variables', async () => {
      // Mock missing environment variables
      const originalEnv = process.env;
      process.env = {};

      const result = await generatePresignedUploadUrl('test-key', 'image/jpeg');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required R2 environment variables');

      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('uploadFileToR2', () => {
    test('should handle missing environment variables', async () => {
      // Mock missing environment variables
      const originalEnv = process.env;
      process.env = {};

      const result = await uploadFileToR2(Buffer.from('test'), 'test-key', 'image/jpeg');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required R2 environment variables');

      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('deleteFileFromR2', () => {
    test('should handle missing environment variables', async () => {
      // Mock missing environment variables
      const originalEnv = process.env;
      process.env = {};

      const result = await deleteFileFromR2('test-key');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required R2 environment variables');

      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('checkFileExistsInR2', () => {
    test('should handle missing environment variables', async () => {
      // Mock missing environment variables
      const originalEnv = process.env;
      process.env = {};

      const result = await checkFileExistsInR2('test-key');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required R2 environment variables');

      // Restore environment
      process.env = originalEnv;
    });
  });
});
