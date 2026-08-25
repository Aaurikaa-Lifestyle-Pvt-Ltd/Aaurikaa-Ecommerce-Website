const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const { extractSlugBase } = require('../../utils/slugUtils');
const {
  PLACEHOLDER_DRAFT_TITLE,
  assertPublishTitleAndSlug,
  assertPublishable,
  assertUniquePrimaryKeyword,
  checkPrimaryKeywordAvailability,
  enforcePublishSlugOnTransition,
  isDraftToPublishedTransition,
  isPlaceholderSlug,
  isPlaceholderTitle,
  resolveEffectiveProductStatus,
  resolvePublishSlug,
  shouldRegeneratePublishSlug,
} = require('../../utils/productPublishGuard');
const {
  KEYWORD_REQUIRED_MESSAGE,
  KEYWORD_TITLE_MESSAGE,
  KEYWORD_DESCRIPTION_MESSAGE,
} = require('../../utils/primaryKeywordValidation');

describe('productPublishGuard', () => {
  describe('pure helpers', () => {
    it('detects draft to published transition', () => {
      expect(isDraftToPublishedTransition('draft', 'published')).toBe(true);
      expect(isDraftToPublishedTransition(undefined, 'published')).toBe(true);
      expect(isDraftToPublishedTransition('published', 'published')).toBe(false);
      expect(isDraftToPublishedTransition('draft', 'draft')).toBe(false);
    });

    it('detects placeholder title', () => {
      expect(isPlaceholderTitle('')).toBe(true);
      expect(isPlaceholderTitle('   ')).toBe(true);
      expect(isPlaceholderTitle(PLACEHOLDER_DRAFT_TITLE)).toBe(true);
      expect(isPlaceholderTitle('Real Product')).toBe(false);
    });

    it('extracts slug base and detects placeholder slug', () => {
      expect(extractSlugBase('untitled-draft-abc12')).toBe('untitled-draft');
      expect(extractSlugBase('blue-widget-abc12')).toBe('blue-widget');
      expect(isPlaceholderSlug('untitled-draft-abc12')).toBe(true);
      expect(isPlaceholderSlug('blue-widget-abc12')).toBe(false);
    });

    it('decides when publish slug regeneration is required', () => {
      expect(shouldRegeneratePublishSlug('Blue Widget', 'untitled-draft-abc12')).toBe(true);
      expect(shouldRegeneratePublishSlug('Blue Widget', 'blue-widget-abc12')).toBe(false);
      expect(shouldRegeneratePublishSlug('Blue Widget', 'red-widget-abc12')).toBe(true);
    });
  });

  describe('assertPublishTitleAndSlug', () => {
    it('rejects empty title', () => {
      expect(() => assertPublishTitleAndSlug({ name: '', slug: 'valid-slug-abc12', actor: 'seller' }))
        .toThrow('Product title is required before publishing.');
    });

    it('rejects placeholder title', () => {
      expect(() => assertPublishTitleAndSlug({
        name: PLACEHOLDER_DRAFT_TITLE,
        slug: 'untitled-draft-abc12',
        actor: 'admin',
      })).toThrow('Placeholder title cannot be published');
    });

    it('rejects unresolved placeholder slug', () => {
      expect(() => assertPublishTitleAndSlug({
        name: 'Real Product',
        slug: 'untitled-draft-abc12',
        actor: 'seller',
      })).toThrow('Could not generate a valid URL slug');
    });
  });

  describe('resolvePublishSlug', () => {
    let mongoServer;

    beforeAll(async () => {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      mongoServer = await MongoMemoryServer.create();
      await mongoose.connect(mongoServer.getUri());
    });

    afterAll(async () => {
      await mongoose.disconnect();
      if (mongoServer) {
        await mongoServer.stop();
      }
    });

    beforeEach(async () => {
      await Product.deleteMany({});
    });

    it('generates a unique slug excluding the current product', async () => {
      const productId = new mongoose.Types.ObjectId();
      await Product.create({
        _id: productId,
        name: 'Existing',
        slug: 'blue-widget-abc12',
        sku: 'EXISTING-SKU',
        regularPrice: 10,
        status: 'draft',
      });

      const result = await resolvePublishSlug({
        name: 'Blue Widget',
        currentSlug: 'untitled-draft-xyz99',
        productId,
      });

      expect(result.slug).toMatch(/^blue-widget-[a-z0-9]{5}$/);
      expect(result.slug).not.toBe('untitled-draft-xyz99');
    });
  });

  describe('enforcePublishSlugOnTransition', () => {
    let mongoServer;

    beforeAll(async () => {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      mongoServer = await MongoMemoryServer.create();
      await mongoose.connect(mongoServer.getUri());
    });

    afterAll(async () => {
      await mongoose.disconnect();
      if (mongoServer) {
        await mongoServer.stop();
      }
    });

    beforeEach(async () => {
      await Product.deleteMany({});
    });

    it('returns current slug when not publishing', async () => {
      const slug = await enforcePublishSlugOnTransition({
        isDraftToPublished: false,
        name: 'Anything',
        currentSlug: 'untitled-draft-abc12',
        productId: null,
        actor: 'seller',
      });
      expect(slug).toBe('untitled-draft-abc12');
    });

    it('regenerates slug on publish when placeholder slug is stale', async () => {
      const slug = await enforcePublishSlugOnTransition({
        isDraftToPublished: true,
        name: 'Blue Widget',
        currentSlug: 'untitled-draft-abc12',
        productId: null,
        actor: 'admin',
      });
      expect(slug).toMatch(/^blue-widget-[a-z0-9]{5}$/);
    });
  });

  describe('checkPrimaryKeywordAvailability / assertPublishable keyword rules', () => {
    let mongoServer;

    beforeAll(async () => {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      mongoServer = await MongoMemoryServer.create();
      await mongoose.connect(mongoServer.getUri());
    });

    afterAll(async () => {
      await mongoose.disconnect();
      if (mongoServer) {
        await mongoServer.stop();
      }
    });

    beforeEach(async () => {
      await Product.deleteMany({});
    });

    it('availability stub always reports available, including duplicates', async () => {
      await Product.create({
        name: 'Existing',
        slug: 'existing-abc12',
        sku: 'EXISTING-SKU',
        regularPrice: 10,
        status: 'draft',
        seo: { primaryKeyword: 'taken-keyword' },
      });

      await expect(checkPrimaryKeywordAvailability('')).resolves.toEqual({ available: true });
      await expect(checkPrimaryKeywordAvailability('unique-keyword')).resolves.toEqual({
        available: true,
      });
      await expect(checkPrimaryKeywordAvailability('taken-keyword')).resolves.toEqual({
        available: true,
      });
    });

    it('assertUniquePrimaryKeyword is a no-op even on collision', async () => {
      await Product.create({
        name: 'Existing',
        slug: 'existing-def34',
        sku: 'EXISTING-SKU-2',
        regularPrice: 10,
        status: 'draft',
        seo: { primaryKeyword: 'collision-keyword' },
      });

      await expect(assertUniquePrimaryKeyword('collision-keyword')).resolves.toBeUndefined();
    });

    it('assertPublishable allows the same keyword on another published product', async () => {
      await Product.create({
        name: 'Cotton Yoga Mat A',
        slug: 'cotton-a',
        sku: 'SKU-A',
        regularPrice: 10,
        status: 'published',
        seo: { primaryKeyword: 'Cotton Yoga Mat' },
        shortDesc: 'Cotton Yoga Mat for studio use.',
      });

      await expect(
        assertPublishable(
          {
            status: 'published',
            name: 'Cotton Yoga Mat B',
            shortDesc: 'Cotton Yoga Mat travel size.',
            seo: { primaryKeyword: 'Cotton Yoga Mat' },
          },
          'seller'
        )
      ).resolves.toBeUndefined();
    });

    it('assertPublishable requires keyword for seller; admin skips SEO keyword entirely', async () => {
      await expect(
        assertPublishable({ status: 'published', name: 'Cotton Yoga Mat' }, 'seller')
      ).rejects.toThrow(KEYWORD_REQUIRED_MESSAGE);

      const adminLike = {
        status: 'published',
        name: 'Celeste Pearl Stud Earrings',
        shortDesc: 'Handcrafted jewellery.',
      };
      await expect(assertPublishable(adminLike, 'admin')).resolves.toBeUndefined();
      expect(adminLike.seo).toBeUndefined();

      await expect(
        assertPublishable(
          {
            status: 'published',
            name: 'Celeste Pearl Stud Earrings',
            shortDesc: '',
            seo: { primaryKeyword: 'Pearl Stud' },
          },
          'admin'
        )
      ).resolves.toBeUndefined();
    });

    it('skips placement rules for drafts', async () => {
      await expect(
        assertPublishable({ status: 'draft', name: 'X' }, 'seller')
      ).resolves.toBeUndefined();
    });

    const validPlacement = {
      name: 'Cotton Yoga Mat 6mm',
      shortDesc: 'Cotton Yoga Mat with extra grip.',
      seo: { primaryKeyword: 'Cotton Yoga Mat' },
    };

    it('resolveEffectiveProductStatus matches create default and update keep-existing', () => {
      expect(resolveEffectiveProductStatus('published')).toBe('published');
      expect(resolveEffectiveProductStatus('draft')).toBe('draft');
      expect(resolveEffectiveProductStatus(undefined)).toBe('published');
      expect(resolveEffectiveProductStatus(undefined, 'draft')).toBe('draft');
      expect(resolveEffectiveProductStatus(undefined, 'published')).toBe('published');
      expect(resolveEffectiveProductStatus('draft', 'published')).toBe('draft');
    });

    it('create: omitted status uses published default; seller requires T1/D1, admin does not', async () => {
      await expect(assertPublishable({ ...validPlacement }, 'admin')).resolves.toBeUndefined();
      await expect(
        assertPublishable(
          { name: 'Premium Cotton Yoga Mat', shortDesc: validPlacement.shortDesc, seo: validPlacement.seo },
          'seller'
        )
      ).rejects.toThrow(KEYWORD_TITLE_MESSAGE);
      await expect(
        assertPublishable(
          {
            name: 'Celeste Pearl Stud Earrings',
            shortDesc: '',
            seo: { primaryKeyword: 'Pearl Stud' },
          },
          'admin'
        )
      ).resolves.toBeUndefined();
    });

    it('create: seller rejects invalid D1; admin skips SEO keyword and shortDesc checks', async () => {
      await expect(
        assertPublishable({ ...validPlacement, status: 'published' }, 'seller')
      ).resolves.toBeUndefined();
      await expect(
        assertPublishable(
          {
            status: 'published',
            name: 'Cotton Yoga Mat 6mm',
            shortDesc: 'No keyword here.',
            seo: validPlacement.seo,
          },
          'seller'
        )
      ).rejects.toThrow(KEYWORD_DESCRIPTION_MESSAGE);
      await expect(
        assertPublishable(
          {
            status: 'published',
            name: 'Celeste Pearl Stud Earrings',
            shortDesc: '',
            seo: validPlacement.seo,
          },
          'admin'
        )
      ).resolves.toBeUndefined();
      await expect(
        assertPublishable(
          {
            status: 'published',
            name: 'Celeste Pearl Stud Earrings',
            shortDesc: '',
            seo: { primaryKeyword: 'Pearl Stud' },
          },
          'admin'
        )
      ).resolves.toBeUndefined();
      await expect(
        assertPublishable({ status: 'draft', name: 'X' }, 'seller')
      ).resolves.toBeUndefined();
    });

    it('admin published update without shortDesc and mismatched keyword still succeeds', async () => {
      await expect(
        assertPublishable(
          {
            name: 'Celeste Pearl Stud Earrings',
            shortDesc: '',
            seo: { primaryKeyword: 'Pearl Stud' },
          },
          'admin',
          null,
          'published'
        )
      ).resolves.toBeUndefined();
    });

    it('update: omitted status uses existing published; seller requires T1/D1, admin does not', async () => {
      await expect(
        assertPublishable({ ...validPlacement }, 'seller', null, 'published')
      ).resolves.toBeUndefined();
      await expect(
        assertPublishable(
          { name: 'Renamed Without Keyword', shortDesc: validPlacement.shortDesc, seo: validPlacement.seo },
          'admin',
          null,
          'published'
        )
      ).resolves.toBeUndefined();
      await expect(
        assertPublishable(
          { name: 'Renamed Without Keyword', shortDesc: validPlacement.shortDesc, seo: validPlacement.seo },
          'seller',
          null,
          'published'
        )
      ).rejects.toThrow(KEYWORD_TITLE_MESSAGE);
    });

    it('update: omitted status on draft skips T1/D1; draft to published with invalid T1/D1 is rejected for seller', async () => {
      await expect(
        assertPublishable({ name: 'X' }, 'seller', null, 'draft')
      ).resolves.toBeUndefined();
      await expect(
        assertPublishable({ status: 'published', name: 'X' }, 'seller', null, 'draft')
      ).rejects.toThrow(KEYWORD_REQUIRED_MESSAGE);
      await expect(
        assertPublishable({ status: 'published', name: 'X' }, 'admin', null, 'draft')
      ).resolves.toBeUndefined();
    });
  });
});
