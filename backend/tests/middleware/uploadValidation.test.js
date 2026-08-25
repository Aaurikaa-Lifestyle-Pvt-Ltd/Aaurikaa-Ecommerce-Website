// backend/tests/middleware/uploadValidation.test.js
const {
  validateFileType,
  validateFileContent,
  sanitizeFilename,
  ALLOWED_FILE_TYPES,
  FILE_SIZE_LIMITS
} = require('../../middleware/secureUpload');

describe('Upload Validation Middleware', () => {
  describe('validateFileType', () => {
    test('should validate allowed image types', () => {
      expect(validateFileType('image/jpeg', 'images')).toBe(true);
      expect(validateFileType('image/png', 'images')).toBe(true);
      expect(validateFileType('image/webp', 'images')).toBe(true);
      expect(validateFileType('image/gif', 'images')).toBe(true);
    });

    test('should validate allowed document types', () => {
      expect(validateFileType('application/pdf', 'documents')).toBe(true);
      expect(validateFileType('application/msword', 'documents')).toBe(true);
      expect(validateFileType('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'documents')).toBe(true);
    });

    test('should validate specific category types', () => {
      expect(validateFileType('image/jpeg', 'brands')).toBe(true);
      expect(validateFileType('image/png', 'products')).toBe(true);
      expect(validateFileType('image/webp', 'categories')).toBe(true);
      expect(validateFileType('application/pdf', 'sellers')).toBe(true);
    });

    test('should reject invalid file types', () => {
      expect(validateFileType('text/plain', 'images')).toBe(false);
      expect(validateFileType('application/zip', 'documents')).toBe(false);
      expect(validateFileType('video/mp4', 'brands')).toBe(false);
      expect(validateFileType('image/svg+xml', 'sellers')).toBe(false);
    });

    test('should reject unknown categories', () => {
      expect(validateFileType('image/jpeg', 'unknown')).toBe(false);
      expect(validateFileType('application/pdf', 'invalid')).toBe(false);
    });
  });

  describe('validateFileContent', () => {
    test('should validate JPEG file content', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      expect(validateFileContent(jpegBuffer, 'image/jpeg')).toBe(true);
    });

    test('should validate PNG file content', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
      expect(validateFileContent(pngBuffer, 'image/png')).toBe(true);
    });

    test('should validate GIF file content', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(validateFileContent(gifBuffer, 'image/gif')).toBe(true);
    });

    test('should validate PDF file content', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
      expect(validateFileContent(pdfBuffer, 'application/pdf')).toBe(true);
    });

    test('should reject mismatched content', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      expect(validateFileContent(jpegBuffer, 'image/png')).toBe(false);
      
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
      expect(validateFileContent(pngBuffer, 'image/jpeg')).toBe(false);
    });

    test('should handle empty or small buffers', () => {
      expect(validateFileContent(Buffer.alloc(0), 'image/jpeg')).toBe(false);
      expect(validateFileContent(Buffer.alloc(2), 'image/jpeg')).toBe(false);
      expect(validateFileContent(null, 'image/jpeg')).toBe(false);
    });

    test('should return true for unknown MIME types', () => {
      const buffer = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      expect(validateFileContent(buffer, 'unknown/type')).toBe(true);
    });
  });

  describe('sanitizeFilename', () => {
    test('should sanitize dangerous characters', () => {
      expect(sanitizeFilename('file<>:"/\\|?*.txt')).toBe('file_________.txt');
      expect(sanitizeFilename('file\x00\x01\x02.txt')).toBe('file___.txt');
    });

    test('should remove path traversal attempts', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBe('___etc_passwd');
      expect(sanitizeFilename('..\\..\\windows\\system32')).toBe('__windows_system32');
    });

    test('should handle null or undefined filenames', () => {
      expect(sanitizeFilename(null)).toBe('unnamed_file');
      expect(sanitizeFilename(undefined)).toBe('unnamed_file');
      expect(sanitizeFilename('')).toBe('unnamed_file');
    });

    test('should limit filename length', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const sanitized = sanitizeFilename(longName);
      expect(sanitized.length).toBeLessThanOrEqual(255);
      expect(sanitized.endsWith('.txt')).toBe(true);
    });

    test('should preserve valid filenames', () => {
      expect(sanitizeFilename('valid-file_name.txt')).toBe('valid-file_name.txt');
      expect(sanitizeFilename('image123.jpg')).toBe('image123.jpg');
    });
  });

  describe('ALLOWED_FILE_TYPES configuration', () => {
    test('should have proper file type configurations', () => {
      expect(ALLOWED_FILE_TYPES.images).toBeDefined();
      expect(ALLOWED_FILE_TYPES.documents).toBeDefined();
      expect(ALLOWED_FILE_TYPES.videos).toBeDefined();
      expect(ALLOWED_FILE_TYPES.brands).toBeDefined();
      expect(ALLOWED_FILE_TYPES.products).toBeDefined();
      expect(ALLOWED_FILE_TYPES.categories).toBeDefined();
      expect(ALLOWED_FILE_TYPES.banners).toBeDefined();
      expect(ALLOWED_FILE_TYPES.profiles).toBeDefined();
      expect(ALLOWED_FILE_TYPES.sellers).toBeDefined();
      expect(ALLOWED_FILE_TYPES.admins).toBeDefined();
    });

    test('should have appropriate file types for each category', () => {
      // Images should only have image types
      const imageTypes = Object.keys(ALLOWED_FILE_TYPES.images);
      expect(imageTypes.every(type => type.startsWith('image/'))).toBe(true);

      // Documents should have document types
      const docTypes = Object.keys(ALLOWED_FILE_TYPES.documents);
      expect(docTypes.some(type => type.includes('pdf'))).toBe(true);
      expect(docTypes.some(type => type.includes('word'))).toBe(true);

      // Sellers should allow both images and PDFs
      const sellerTypes = Object.keys(ALLOWED_FILE_TYPES.sellers);
      expect(sellerTypes.some(type => type.startsWith('image/'))).toBe(true);
      expect(sellerTypes.some(type => type.includes('pdf'))).toBe(true);
    });
  });

  describe('FILE_SIZE_LIMITS configuration', () => {
    test('should have appropriate size limits for each category', () => {
      expect(FILE_SIZE_LIMITS.images).toBe(5 * 1024 * 1024); // 5MB
      expect(FILE_SIZE_LIMITS.documents).toBe(10 * 1024 * 1024); // 10MB
      expect(FILE_SIZE_LIMITS.videos).toBe(50 * 1024 * 1024); // 50MB
      expect(FILE_SIZE_LIMITS.brands).toBe(2 * 1024 * 1024); // 2MB
      expect(FILE_SIZE_LIMITS.products).toBe(5 * 1024 * 1024); // 5MB
      expect(FILE_SIZE_LIMITS.categories).toBe(2 * 1024 * 1024); // 2MB
      expect(FILE_SIZE_LIMITS.banners).toBe(3 * 1024 * 1024); // 3MB
      expect(FILE_SIZE_LIMITS.profiles).toBe(2 * 1024 * 1024); // 2MB
      expect(FILE_SIZE_LIMITS.sellers).toBe(5 * 1024 * 1024); // 5MB
      expect(FILE_SIZE_LIMITS.admins).toBe(2 * 1024 * 1024); // 2MB
      expect(FILE_SIZE_LIMITS.default).toBe(5 * 1024 * 1024); // 5MB
    });

    test('should have reasonable size limits', () => {
      // Images should be smaller than documents
      expect(FILE_SIZE_LIMITS.images).toBeLessThan(FILE_SIZE_LIMITS.documents);
      
      // Documents should be smaller than videos
      expect(FILE_SIZE_LIMITS.documents).toBeLessThan(FILE_SIZE_LIMITS.videos);
      
      // Brand logos should be smaller than general images
      expect(FILE_SIZE_LIMITS.brands).toBeLessThan(FILE_SIZE_LIMITS.images);
      
      // Profile images should be smaller than general images
      expect(FILE_SIZE_LIMITS.profiles).toBeLessThan(FILE_SIZE_LIMITS.images);
    });
  });

});
