const {
  buildStem,
  buildBasename,
  truncateSlug,
  generateMediaKey,
} = require('../../services/mediaNamingService');

jest.mock('../../services/r2UploadService', () => ({
  checkFileExistsInR2: jest.fn(),
  uploadFileToR2: jest.fn(),
}));

const { checkFileExistsInR2 } = require('../../services/r2UploadService');

describe('mediaNamingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLOUDFLARE_R2_PUBLIC_URL = 'https://cdn.example.com';
    checkFileExistsInR2.mockResolvedValue({ success: true, exists: false });
  });

  describe('buildStem', () => {
    test('main product image uses base slug only', () => {
      expect(
        buildStem({
          baseLabel: 'Best Workout Books',
          role: 'main',
        })
      ).toBe('best-workout-books');
    });

    test('gallery index 1 adds -1 suffix', () => {
      expect(
        buildStem({
          baseLabel: 'Best Workout Books',
          role: 'gallery',
          sequenceIndex: 1,
        })
      ).toBe('best-workout-books-1');
    });

    test('video role adds -video suffix', () => {
      expect(
        buildStem({
          baseLabel: 'Best Workout Books',
          role: 'video',
        })
      ).toBe('best-workout-books-video');
    });

    test('variant with roleKey', () => {
      expect(
        buildStem({
          baseLabel: 'Shirt',
          role: 'variant',
          roleKey: 'Red|XL',
        })
      ).toBe('shirt-red-xl');
    });
  });

  describe('buildBasename', () => {
    test('collision suffix before extension', () => {
      expect(buildBasename('slug', '.webp', 2)).toBe('slug-2.webp');
    });
  });

  describe('truncateSlug', () => {
    test('truncates long slugs', () => {
      const long = 'a'.repeat(100);
      expect(truncateSlug(long).length).toBeLessThanOrEqual(80);
    });
  });

  describe('generateMediaKey', () => {
    test('returns YYYY/MM path', async () => {
      const result = await generateMediaKey({
        mediaCategory: 'products',
        baseLabel: 'Nike Shoes',
        extension: '.webp',
        uploadedAt: new Date('2026-05-15T12:00:00Z'),
      });

      expect(result.key).toBe('products/2026/05/nike-shoes.webp');
      expect(result.publicUrl).toContain('products/2026/05/nike-shoes.webp');
      expect(result.collisionSuffix).toBeNull();
    });

    test('increments collision suffix when key exists', async () => {
      checkFileExistsInR2
        .mockResolvedValueOnce({ success: true, exists: true })
        .mockResolvedValueOnce({ success: true, exists: false });

      const result = await generateMediaKey({
        mediaCategory: 'blogs',
        baseLabel: 'Same Title',
        extension: '.jpg',
        uploadedAt: new Date('2026-01-10T00:00:00Z'),
      });

      expect(result.key).toBe('blogs/2026/01/same-title-1.jpg');
      expect(result.collisionSuffix).toBe(1);
    });

    test('rejects invalid media category', async () => {
      await expect(
        generateMediaKey({
          mediaCategory: 'profiles',
          baseLabel: 'x',
          extension: '.jpg',
        })
      ).rejects.toThrow(/Invalid mediaCategory/);
    });
  });
});
