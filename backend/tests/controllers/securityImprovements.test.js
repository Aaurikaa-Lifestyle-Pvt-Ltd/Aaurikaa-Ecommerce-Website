/**
 * Security Improvements Test Suite
 * Tests for Priority 8: Local Storage Security Issues
 * 
 * Tests:
 * - Environment-based configuration
 * - Secure filename generation
 * - File validation (type, size)
 * - Path sanitization
 * - Error handling standardization
 */

const request = require('supertest');
const app = require('../../app'); // Adjust path to your Express app
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { getConfig, generateSecureFilename, validateFileType, validateFileSize } = require('../../config/uploadConfig');
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS } = require('../../utils/errorHandler');

// Mock models
jest.mock('../../models/bannerSettingsModel');
jest.mock('../../models/Slider');

describe('Security Improvements - Priority 8', () => {
  beforeAll(async () => {
    // Connect to test database if needed
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Disconnect from test database if connected
  });

  describe('Upload Configuration Security', () => {
    it('should use environment-based configuration', () => {
      const config = getConfig();
      
      expect(config).toHaveProperty('UPLOAD_BASE_PATH');
      expect(config).toHaveProperty('BANNER_UPLOAD_PATH');
      expect(config).toHaveProperty('SLIDER_UPLOAD_PATH');
      expect(config).toHaveProperty('MAX_FILE_SIZE');
      expect(config).toHaveProperty('ALLOWED_IMAGE_TYPES');
      expect(config).toHaveProperty('ALLOWED_IMAGE_EXTENSIONS');
      expect(config).toHaveProperty('SECURE_FILENAME_LENGTH');
      expect(config).toHaveProperty('FILENAME_PREFIX');
    });

    it('should have secure default values', () => {
      const config = getConfig();
      
      // Check file size limit (5MB)
      expect(config.MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
      
      // Check allowed image types
      expect(config.ALLOWED_IMAGE_TYPES).toContain('image/jpeg');
      expect(config.ALLOWED_IMAGE_TYPES).toContain('image/png');
      expect(config.ALLOWED_IMAGE_TYPES).toContain('image/webp');
      
      // Check allowed extensions
      expect(config.ALLOWED_IMAGE_EXTENSIONS).toContain('.jpg');
      expect(config.ALLOWED_IMAGE_EXTENSIONS).toContain('.png');
      expect(config.ALLOWED_IMAGE_EXTENSIONS).toContain('.webp');
      
      // Check secure filename length
      expect(config.SECURE_FILENAME_LENGTH).toBe(32);
    });
  });

  describe('Secure Filename Generation', () => {
    it('should generate secure filenames with proper format', () => {
      const originalName = 'test-image.jpg';
      const secureFilename = generateSecureFilename(originalName, 'banner_');
      
      expect(secureFilename).toMatch(/^banner_\d+_[a-f0-9]{32}\.jpg$/);
      expect(secureFilename).not.toContain(originalName);
    });

    it('should handle different file extensions', () => {
      const extensions = ['.jpg', '.png', '.webp', '.jpeg'];
      
      extensions.forEach(ext => {
        const originalName = `test${ext}`;
        const secureFilename = generateSecureFilename(originalName, 'banner_');
        expect(secureFilename).toMatch(new RegExp(`^banner_\\d+_[a-f0-9]{32}\\${ext}$`));
      });
    });

    it('should generate unique filenames', () => {
      const originalName = 'test.jpg';
      const filename1 = generateSecureFilename(originalName, 'banner_');
      const filename2 = generateSecureFilename(originalName, 'banner_');
      
      expect(filename1).not.toBe(filename2);
    });
  });

  describe('File Validation', () => {
    const mockFile = (mimetype, originalname, size) => ({
      mimetype,
      originalname,
      size
    });

    it('should validate file types correctly', () => {
      const config = getConfig();
      
      // Valid files
      expect(validateFileType(mockFile('image/jpeg', 'test.jpg', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(true);
      expect(validateFileType(mockFile('image/png', 'test.png', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(true);
      expect(validateFileType(mockFile('image/webp', 'test.webp', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(true);
      
      // Invalid files
      expect(validateFileType(mockFile('text/plain', 'test.txt', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(false);
      expect(validateFileType(mockFile('application/pdf', 'test.pdf', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(false);
      expect(validateFileType(mockFile('image/gif', 'test.gif', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(false);
    });

    it('should validate file extensions correctly', () => {
      const config = getConfig();
      
      // Valid extensions
      expect(validateFileType(mockFile('image/jpeg', 'test.jpg', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(true);
      expect(validateFileType(mockFile('image/jpeg', 'test.jpeg', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(true);
      expect(validateFileType(mockFile('image/png', 'test.png', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(true);
      
      // Invalid extensions
      expect(validateFileType(mockFile('image/jpeg', 'test.gif', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(false);
      expect(validateFileType(mockFile('image/jpeg', 'test.bmp', 1000), config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(false);
    });

    it('should validate file sizes correctly', () => {
      const config = getConfig();
      
      // Valid sizes
      expect(validateFileSize(mockFile('image/jpeg', 'test.jpg', 1000), config.MAX_FILE_SIZE)).toBe(true);
      expect(validateFileSize(mockFile('image/jpeg', 'test.jpg', config.MAX_FILE_SIZE), config.MAX_FILE_SIZE)).toBe(true);
      
      // Invalid sizes
      expect(validateFileSize(mockFile('image/jpeg', 'test.jpg', config.MAX_FILE_SIZE + 1), config.MAX_FILE_SIZE)).toBe(false);
      expect(validateFileSize(mockFile('image/jpeg', 'test.jpg', config.MAX_FILE_SIZE * 2), config.MAX_FILE_SIZE)).toBe(false);
    });

    it('should handle null/undefined files', () => {
      const config = getConfig();
      
      expect(validateFileType(null, config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(false);
      expect(validateFileType(undefined, config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)).toBe(false);
      expect(validateFileSize(null, config.MAX_FILE_SIZE)).toBe(false);
      expect(validateFileSize(undefined, config.MAX_FILE_SIZE)).toBe(false);
    });
  });

  describe('Banner Settings Controller Security', () => {
    const mockAdminUser = { _id: '60d0fe4f5e36c10015f1a2b1', role: 'admin' };

    it('should return standardized error response for invalid file type', async () => {
      const BannerSettings = require('../../models/bannerSettingsModel');
      BannerSettings.findOne.mockResolvedValueOnce({});

      const res = await request(app)
        .put('/api/banner-settings')
        .set('Authorization', `Bearer mock_token`)
        .attach('backgroundImage', Buffer.from('fake content'), 'test.txt'); // Invalid file type

      expect(res.statusCode).toEqual(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toEqual('Invalid file type for background image');
      expect(res.body.code).toEqual(ERROR_CODES.INVALID_INPUT);
      expect(res.body.details).toHaveProperty('allowedTypes');
      expect(res.body.details).toHaveProperty('allowedExtensions');
    });

    it('should return standardized error response for file too large', async () => {
      const BannerSettings = require('../../models/bannerSettingsModel');
      BannerSettings.findOne.mockResolvedValueOnce({});

      // Create a large file buffer (6MB)
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);

      const res = await request(app)
        .put('/api/banner-settings')
        .set('Authorization', `Bearer mock_token`)
        .attach('backgroundImage', largeBuffer, 'test.jpg');

      expect(res.statusCode).toEqual(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toEqual('File size too large for background image');
      expect(res.body.code).toEqual(ERROR_CODES.INVALID_INPUT);
      expect(res.body.details).toHaveProperty('maxSize');
      expect(res.body.details).toHaveProperty('actualSize');
    });

    it('should return standardized success response for valid file', async () => {
      const BannerSettings = require('../../models/bannerSettingsModel');
      const mockSettings = { _id: '60d0fe4f5e36c10015f1a2b2', backgroundImage: '/uploads/banners/test.jpg' };
      BannerSettings.findOne.mockResolvedValueOnce(mockSettings);
      BannerSettings.prototype.save.mockResolvedValueOnce(mockSettings);

      const res = await request(app)
        .put('/api/banner-settings')
        .set('Authorization', `Bearer mock_token`)
        .attach('backgroundImage', Buffer.from('fake image content'), 'test.jpg');

      expect(res.statusCode).toEqual(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toEqual('Banner settings updated successfully');
      expect(res.body.data).toEqual(mockSettings);
    });
  });

  describe('Slider Controller Security', () => {
    const mockAdminUser = { _id: '60d0fe4f5e36c10015f1a2b3', role: 'admin' };

    it('should return standardized error response for invalid file type', async () => {
      const res = await request(app)
        .post('/api/sliders')
        .set('Authorization', `Bearer mock_token`)
        .attach('image', Buffer.from('fake content'), 'test.txt') // Invalid file type
        .field('heading', 'Test Slider')
        .field('offerText', 'Test Offer')
        .field('buttonText', 'Test Button')
        .field('buttonLink', 'https://test.com')
        .field('isActive', 'true')
        .field('placement', 'hero');

      expect(res.statusCode).toEqual(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toEqual('Invalid file type for slider image');
      expect(res.body.code).toEqual(ERROR_CODES.INVALID_INPUT);
      expect(res.body.details).toHaveProperty('allowedTypes');
      expect(res.body.details).toHaveProperty('allowedExtensions');
    });

    it('should return standardized error response for file too large', async () => {
      // Create a large file buffer (6MB)
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);

      const res = await request(app)
        .post('/api/sliders')
        .set('Authorization', `Bearer mock_token`)
        .attach('image', largeBuffer, 'test.jpg')
        .field('heading', 'Test Slider')
        .field('offerText', 'Test Offer')
        .field('buttonText', 'Test Button')
        .field('buttonLink', 'https://test.com')
        .field('isActive', 'true')
        .field('placement', 'hero');

      expect(res.statusCode).toEqual(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toEqual('File size too large for slider image');
      expect(res.body.code).toEqual(ERROR_CODES.INVALID_INPUT);
      expect(res.body.details).toHaveProperty('maxSize');
      expect(res.body.details).toHaveProperty('actualSize');
    });

    it('should return standardized error response for missing image', async () => {
      const res = await request(app)
        .post('/api/sliders')
        .set('Authorization', `Bearer mock_token`)
        .field('heading', 'Test Slider')
        .field('offerText', 'Test Offer')
        .field('buttonText', 'Test Button')
        .field('buttonLink', 'https://test.com')
        .field('isActive', 'true')
        .field('placement', 'hero');

      expect(res.statusCode).toEqual(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toEqual('Image is required');
      expect(res.body.code).toEqual(ERROR_CODES.INVALID_INPUT);
    });

    it('should return standardized success response for valid slider creation', async () => {
      const Slider = require('../../models/Slider');
      const mockSlider = {
        _id: '60d0fe4f5e36c10015f1a2b4',
        image: 'test.jpg',
        mobileImage: 'test-mobile.jpg',
        heading: 'Test Slider',
        placement: 'hero',
        displayOrder: 0,
      };
      Slider.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
          }),
        }),
      });
      // Uniqueness check also uses findOne().select().lean()
      Slider.findOne.mockImplementation(() => ({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
          }),
        }),
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      }));
      Slider.prototype.save.mockResolvedValueOnce(mockSlider);

      const res = await request(app)
        .post('/api/sliders')
        .set('Authorization', `Bearer mock_token`)
        .attach('image', Buffer.from('fake image content'), 'test.jpg')
        .attach('mobileImage', Buffer.from('fake mobile content'), 'test-mobile.jpg')
        .field('heading', 'Test Slider')
        .field('offerText', 'Test Offer')
        .field('buttonText', 'Test Button')
        .field('buttonLink', 'https://test.com')
        .field('isActive', 'true')
        .field('placement', 'hero');

      expect(res.statusCode).toEqual(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toEqual('Slider created successfully');
      expect(res.body.data).toHaveProperty('slider');
    });
  });

  describe('Path Security', () => {
    it('should use environment-based paths instead of hardcoded paths', () => {
      const config = getConfig();
      
      // Ensure paths are not hardcoded
      expect(config.BANNER_UPLOAD_PATH).not.toContain('uploads/banners');
      expect(config.SLIDER_UPLOAD_PATH).not.toContain('uploads/banners');
      
      // Ensure paths are properly constructed
      expect(config.BANNER_UPLOAD_PATH).toContain('uploads');
      expect(config.SLIDER_UPLOAD_PATH).toContain('uploads');
    });

    it('should prevent path traversal vulnerabilities', () => {
      const config = getConfig();
      
      // Test that paths are properly normalized
      expect(config.BANNER_UPLOAD_PATH).not.toContain('..');
      expect(config.SLIDER_UPLOAD_PATH).not.toContain('..');
      
      // Test that paths are absolute
      expect(path.isAbsolute(config.BANNER_UPLOAD_PATH)).toBe(true);
      expect(path.isAbsolute(config.SLIDER_UPLOAD_PATH)).toBe(true);
    });
  });

  describe('Error Handling Standardization', () => {
    it('should use standardized error response format', () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, 'Test error', ERROR_CODES.INVALID_INPUT, { test: 'data' });

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Test error',
        code: ERROR_CODES.INVALID_INPUT,
        details: { test: 'data' }
      });
    });

    it('should use standardized success response format', () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      sendSuccessResponse(res, HTTP_STATUS.OK, 'Test success', { test: 'data' });

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Test success',
        data: { test: 'data' }
      });
    });
  });
});
