const { createSecureUpload, secureUploads, validateFileType, generateSecureFilename } = require('../../middleware/secureUpload');

describe('Secure Upload Middleware', () => {
  describe('validateFileType', () => {
    it('should validate image file types correctly', () => {
      expect(validateFileType('image/jpeg', 'images')).toBe(true);
      expect(validateFileType('image/png', 'images')).toBe(true);
      expect(validateFileType('image/webp', 'images')).toBe(true);
      expect(validateFileType('image/gif', 'images')).toBe(true);
    });

    it('should reject invalid image file types', () => {
      expect(validateFileType('application/pdf', 'images')).toBe(false);
      expect(validateFileType('text/plain', 'images')).toBe(false);
      expect(validateFileType('video/mp4', 'images')).toBe(false);
    });

    it('should validate document file types correctly', () => {
      expect(validateFileType('application/pdf', 'documents')).toBe(true);
      expect(validateFileType('application/msword', 'documents')).toBe(true);
      expect(validateFileType('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'documents')).toBe(true);
    });

    it('should reject invalid document file types', () => {
      expect(validateFileType('image/jpeg', 'documents')).toBe(false);
      expect(validateFileType('video/mp4', 'documents')).toBe(false);
    });

    it('should validate video file types correctly', () => {
      expect(validateFileType('video/mp4', 'videos')).toBe(true);
      expect(validateFileType('video/webm', 'videos')).toBe(true);
      expect(validateFileType('video/ogg', 'videos')).toBe(true);
    });

    it('should reject invalid video file types', () => {
      expect(validateFileType('image/jpeg', 'videos')).toBe(false);
      expect(validateFileType('application/pdf', 'videos')).toBe(false);
    });
  });

  describe('generateSecureFilename', () => {
    it('should generate secure filename with timestamp and random string', () => {
      const filename = generateSecureFilename('test.jpg', '.jpg');
      expect(filename).toMatch(/^\d+_[a-f0-9]{32}_test\.jpg$/);
    });

    it('should sanitize dangerous characters in filename', () => {
      const filename = generateSecureFilename('test<script>.jpg', '.jpg');
      expect(filename).toMatch(/^\d+_[a-f0-9]{32}_test_script_\.jpg$/);
    });

    it('should handle special characters in filename', () => {
      const filename = generateSecureFilename('test file (1).jpg', '.jpg');
      expect(filename).toMatch(/^\d+_[a-f0-9]{32}_test_file__1_\.jpg$/);
    });
  });

  describe('createSecureUpload', () => {
    it('should create upload middleware with correct configuration', () => {
      const upload = createSecureUpload({
        category: 'images',
        destination: 'uploads/test/',
        maxFiles: 1,
        fieldName: 'testFile'
      });

      expect(upload).toBeDefined();
      expect(typeof upload).toBe('function');
    });

    it('should use default values when options not provided', () => {
      const upload = createSecureUpload({});
      expect(upload).toBeDefined();
      expect(typeof upload).toBe('function');
    });
  });

  describe('secureUploads predefined middlewares', () => {
    it('should have singleImage middleware', () => {
      expect(secureUploads.singleImage).toBeDefined();
      expect(typeof secureUploads.singleImage).toBe('function');
    });

    it('should have multipleImages middleware', () => {
      expect(secureUploads.multipleImages).toBeDefined();
      expect(typeof secureUploads.multipleImages).toBe('function');
    });

    it('should have singleDocument middleware', () => {
      expect(secureUploads.singleDocument).toBeDefined();
      expect(typeof secureUploads.singleDocument).toBe('function');
    });

    it('should have singleVideo middleware', () => {
      expect(secureUploads.singleVideo).toBeDefined();
      expect(typeof secureUploads.singleVideo).toBe('function');
    });

    it('should have brandLogo middleware', () => {
      expect(secureUploads.brandLogo).toBeDefined();
      expect(typeof secureUploads.brandLogo).toBe('function');
    });

    it('should have productImages middleware', () => {
      expect(secureUploads.productImages).toBeDefined();
      expect(typeof secureUploads.productImages).toBe('function');
    });

    it('should have profileImage middleware', () => {
      expect(secureUploads.profileImage).toBeDefined();
      expect(typeof secureUploads.profileImage).toBe('function');
    });

    it('should have banner middleware', () => {
      expect(secureUploads.banner).toBeDefined();
      expect(typeof secureUploads.banner).toBe('function');
    });
  });

  describe('File type validation edge cases', () => {
    it('should handle undefined category', () => {
      expect(validateFileType('image/jpeg', undefined)).toBe(false);
      expect(validateFileType('image/jpeg', null)).toBe(false);
    });

    it('should handle undefined mimetype', () => {
      expect(validateFileType(undefined, 'images')).toBe(false);
      expect(validateFileType(null, 'images')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(validateFileType('', 'images')).toBe(false);
      expect(validateFileType('image/jpeg', '')).toBe(false);
    });
  });

  describe('Filename generation edge cases', () => {
    it('should handle empty originalname', () => {
      const filename = generateSecureFilename('', '.jpg');
      expect(filename).toMatch(/^\d+_[a-f0-9]{32}_file\.jpg$/);
    });

    it('should handle undefined originalname', () => {
      const filename = generateSecureFilename(undefined, '.jpg');
      expect(filename).toMatch(/^\d+_[a-f0-9]{32}_file\.jpg$/);
    });

    it('should handle empty extension', () => {
      const filename = generateSecureFilename('test', '');
      expect(filename).toMatch(/^\d+_[a-f0-9]{32}_test$/);
    });
  });
});
