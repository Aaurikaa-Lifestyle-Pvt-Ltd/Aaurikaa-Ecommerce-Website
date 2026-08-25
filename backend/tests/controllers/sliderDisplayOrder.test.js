/**
 * Slider placement + per-section displayOrder + mobileImage.
 */
jest.mock('../../middleware/verifyAdmin', () => (req, res, next) => {
  req.user = { _id: 'admin-test-id', id: 'admin-test-id', role: 'admin' };
  next();
});

jest.mock('../../middleware/loadAdminContext', () => (req, res, next) => {
  req.adminUser = { isSuperAdmin: true, permissions: [] };
  next();
});

const request = require('supertest');
const mongoose = require('mongoose');
const Slider = require('../../models/Slider');
const cache = require('../../utils/cache');
const app = require('../helpers/testApp');
const sliderController = require('../../controllers/sliderController');
const { HTTP_STATUS, ERROR_CODES } = require('../../utils/errorHandler');

const SLIDER_SORT = { placement: 1, displayOrder: 1, createdAt: -1, _id: 1 };

function sliderPayload(overrides = {}) {
  return {
    placement: 'hero',
    heading: 'Test Heading',
    offerText: 'Test Offer',
    buttonText: 'Shop Now',
    buttonLink: 'https://example.com',
    isActive: true,
    image: 'test-slide.jpg',
    mobileImage: 'test-slide-mobile.jpg',
    displayOrder: 1,
    ...overrides,
  };
}

function buildMockFile(filename = 'test-slide.jpg') {
  return {
    filename,
    mimetype: 'image/jpeg',
    originalname: 'test.jpg',
    size: 128,
  };
}

function buildMockFiles(desktop = 'test-slide.jpg', mobile = 'test-slide-mobile.jpg') {
  const files = {
    image: [buildMockFile(desktop)],
  };
  if (mobile) {
    files.mobileImage = [buildMockFile(mobile)];
  }
  return files;
}

function buildMockRes() {
  const res = { statusCode: null, body: null };
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

describe('Slider placement + displayOrder', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce_test_db'
      );
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    cache.flushAll();
    await Slider.deleteMany({});
  });

  describe('GET /api/sliders', () => {
    it('returns sliders sorted by placement then displayOrder', async () => {
      const now = Date.now();
      await Slider.create([
        sliderPayload({
          placement: 'promo1',
          heading: 'Promo first',
          displayOrder: 1,
          createdAt: new Date(now - 3000),
        }),
        sliderPayload({
          placement: 'hero',
          heading: 'Hero second',
          displayOrder: 2,
          createdAt: new Date(now - 1000),
        }),
        sliderPayload({
          placement: 'hero',
          heading: 'Hero first',
          displayOrder: 1,
          createdAt: new Date(now - 2000),
        }),
      ]);

      const res = await request(app).get('/api/sliders');
      expect(res.status).toBe(HTTP_STATUS.OK);
      const sliders = res.body.data || res.body;
      expect(sliders.map((s) => s.heading)).toEqual(['Hero first', 'Hero second', 'Promo first']);
    });

    it('filters by placement query', async () => {
      await Slider.create([
        sliderPayload({ placement: 'hero', heading: 'H1', displayOrder: 1 }),
        sliderPayload({ placement: 'promo2', heading: 'P2', displayOrder: 1 }),
      ]);

      const res = await request(app).get('/api/sliders?placement=promo2');
      expect(res.status).toBe(HTTP_STATUS.OK);
      const sliders = res.body.data || res.body;
      expect(sliders).toHaveLength(1);
      expect(sliders[0].heading).toBe('P2');
    });

    it('rejects invalid placement query', async () => {
      const res = await request(app).get('/api/sliders?placement=footer');
      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
    });
  });

  describe('createSlider validation', () => {
    it('rejects missing placement', async () => {
      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            heading: '',
            offerText: '',
            buttonText: '',
            buttonLink: '',
            isActive: 'true',
          },
          files: buildMockFiles(),
        },
        res
      );
      expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.message).toMatch(/placement/i);
    });

    it('rejects invalid placement', async () => {
      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'sidebar',
            heading: '',
            isActive: 'true',
          },
          files: buildMockFiles(),
        },
        res
      );
      expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.message).toMatch(/placement/i);
    });

    it('rejects negative displayOrder', async () => {
      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'hero',
            isActive: 'true',
            displayOrder: '-1',
          },
          files: buildMockFiles(),
        },
        res
      );
      expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.message).toMatch(/displayOrder/i);
    });

    it('rejects decimal displayOrder', async () => {
      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'hero',
            isActive: 'true',
            displayOrder: '1.5',
          },
          files: buildMockFiles(),
        },
        res
      );
      expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.message).toMatch(/integer/i);
    });

    it('auto-assigns max(displayOrder)+1 within placement when omitted', async () => {
      await Slider.create(sliderPayload({ placement: 'hero', displayOrder: 3 }));
      await Slider.create(sliderPayload({ placement: 'promo1', displayOrder: 9 }));

      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'hero',
            heading: 'New Slide',
            offerText: '',
            buttonText: '',
            buttonLink: '',
            isActive: 'true',
          },
          files: buildMockFiles(),
        },
        res
      );

      expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
      expect(res.body.data.slider.displayOrder).toBe(4);
      expect(res.body.data.slider.placement).toBe('hero');
    });

    it('rejects active create without mobileImage', async () => {
      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'hero',
            isActive: 'true',
            displayOrder: '1',
          },
          files: { image: [buildMockFile()] },
        },
        res
      );
      expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.message).toMatch(/mobile/i);
    });

    it('allows inactive create with desktop only', async () => {
      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'hero',
            isActive: 'false',
            displayOrder: '1',
            heading: '',
            offerText: '',
            buttonText: '',
            buttonLink: '',
          },
          files: { image: [buildMockFile()] },
        },
        res
      );
      expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
      expect(res.body.data.slider.isActive).toBe(false);
      expect(res.body.data.slider.mobileImage).toBe('');
    });

    it('allows empty optional text fields on create', async () => {
      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'promo1',
            heading: '',
            offerText: '',
            buttonText: '',
            buttonLink: '',
            isActive: 'true',
            displayOrder: '1',
          },
          files: buildMockFiles(),
        },
        res
      );
      expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
      expect(res.body.data.slider.heading).toBe('');
      expect(res.body.data.slider.offerText).toBe('');
      expect(res.body.data.slider.buttonText).toBe('');
      expect(res.body.data.slider.buttonLink).toBe('');
      expect(res.body.data.slider.image).toBe('test-slide.jpg');
      expect(res.body.data.slider.mobileImage).toBe('test-slide-mobile.jpg');
    });

    it('accepts relative path and http(s) buttonLink; rejects invalid', async () => {
      const okRelative = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'hero',
            heading: '',
            offerText: '',
            buttonText: '',
            buttonLink: '/collections/rings',
            isActive: 'true',
            displayOrder: '1',
          },
          files: buildMockFiles(),
        },
        okRelative
      );
      expect(okRelative.statusCode).toBe(HTTP_STATUS.CREATED);
      expect(okRelative.body.data.slider.buttonLink).toBe('/collections/rings');

      const bad = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'hero',
            heading: '',
            offerText: '',
            buttonText: '',
            buttonLink: 'javascript:alert(1)',
            isActive: 'true',
            displayOrder: '2',
          },
          files: buildMockFiles('a.jpg', 'b.jpg'),
        },
        bad
      );
      expect(bad.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(bad.body.message).toMatch(/buttonLink/i);
    });
  });

  describe('per-placement uniqueness', () => {
    it('allows same displayOrder across different placements when both active', async () => {
      await Slider.create(sliderPayload({ placement: 'hero', displayOrder: 1, isActive: true }));

      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'promo1',
            heading: 'Promo',
            offerText: '',
            buttonText: '',
            buttonLink: '',
            isActive: 'true',
            displayOrder: '1',
          },
          files: buildMockFiles('p.jpg', 'pm.jpg'),
        },
        res
      );

      expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
      expect(res.body.data.slider.placement).toBe('promo1');
      expect(res.body.data.slider.displayOrder).toBe(1);
    });

    it('rejects duplicate active displayOrder within the same placement', async () => {
      await Slider.create(sliderPayload({ placement: 'hero', heading: 'Hero', displayOrder: 1, isActive: true }));

      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'hero',
            heading: 'Conflict',
            offerText: '',
            buttonText: '',
            buttonLink: '',
            isActive: 'true',
            displayOrder: '1',
          },
          files: buildMockFiles('c.jpg', 'cm.jpg'),
        },
        res
      );

      expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.message).toMatch(/displayOrder 1/i);
      expect(res.body.message).toMatch(/hero/i);
    });

    it('allows same displayOrder in placement when existing is inactive', async () => {
      await Slider.create(
        sliderPayload({
          placement: 'hero',
          heading: 'Inactive',
          displayOrder: 1,
          isActive: false,
          mobileImage: '',
        })
      );

      const res = buildMockRes();
      await sliderController.createSlider(
        {
          body: {
            placement: 'hero',
            heading: 'New',
            offerText: '',
            buttonText: '',
            buttonLink: '/shop',
            isActive: 'true',
            displayOrder: '1',
          },
          files: buildMockFiles(),
        },
        res
      );

      expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
      expect(res.body.data.slider.displayOrder).toBe(1);
    });

    it('allows unlimited slides in one placement', async () => {
      for (let i = 1; i <= 5; i += 1) {
        const res = buildMockRes();
        await sliderController.createSlider(
          {
            body: {
              placement: 'hero',
              heading: `Slide ${i}`,
              offerText: '',
              buttonText: '',
              buttonLink: '',
              isActive: 'true',
              displayOrder: String(i),
            },
            files: buildMockFiles(`d${i}.jpg`, `m${i}.jpg`),
          },
          res
        );
        expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
      }
      const count = await Slider.countDocuments({ placement: 'hero', isActive: true });
      expect(count).toBe(5);
    });
  });

  describe('PUT optional-field preservation', () => {
    it('updates displayOrder without wiping omitted caption/CTA fields', async () => {
      const slider = await Slider.create(
        sliderPayload({
          placement: 'hero',
          heading: 'Keep Me',
          offerText: 'Same offer',
          buttonText: 'Shop Now',
          buttonLink: 'https://example.com',
          displayOrder: 2,
          isActive: true,
        })
      );

      const req = {
        params: { id: String(slider._id) },
        body: { displayOrder: '5', isActive: 'true' },
        files: undefined,
      };
      const res = buildMockRes();

      await sliderController.updateSlider(req, res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.body.data.slider.displayOrder).toBe(5);
      expect(res.body.data.slider.heading).toBe('Keep Me');
      expect(res.body.data.slider.offerText).toBe('Same offer');
      expect(res.body.data.slider.buttonText).toBe('Shop Now');
      expect(res.body.data.slider.buttonLink).toBe('https://example.com');
      expect(res.body.data.slider.isActive).toBe(true);
      expect(res.body.data.slider.placement).toBe('hero');
    });

    it('rejects activating without mobileImage', async () => {
      const slider = await Slider.create(
        sliderPayload({
          placement: 'hero',
          isActive: false,
          mobileImage: '',
          displayOrder: 1,
        })
      );

      const res = buildMockRes();
      await sliderController.updateSlider(
        {
          params: { id: String(slider._id) },
          body: { isActive: 'true' },
          files: undefined,
        },
        res
      );

      expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.message).toMatch(/mobile/i);
    });

    it('accepts empty strings on update without inventing copy', async () => {
      const slider = await Slider.create(sliderPayload({ heading: 'Old', offerText: 'Old offer' }));

      const req = {
        params: { id: String(slider._id) },
        body: {
          heading: '',
          offerText: '',
          buttonText: '',
          buttonLink: '',
          isActive: 'true',
        },
        files: undefined,
      };
      const res = buildMockRes();

      await sliderController.updateSlider(req, res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.body.data.slider.heading).toBe('');
      expect(res.body.data.slider.offerText).toBe('');
    });
  });

  describe('PUT /api/sliders/:id displayOrder-only update', () => {
    it('updates displayOrder without changing other fields', async () => {
      const slider = await Slider.create(
        sliderPayload({ placement: 'hero', heading: 'Keep Me', offerText: 'Same offer', displayOrder: 2 })
      );

      const res = await request(app)
        .put(`/api/sliders/${slider._id}`)
        .field('heading', 'Keep Me')
        .field('offerText', 'Same offer')
        .field('buttonText', 'Shop Now')
        .field('buttonLink', 'https://example.com')
        .field('isActive', 'true')
        .field('placement', 'hero')
        .field('displayOrder', '0');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body?.data?.slider?.displayOrder).toBe(0);
      expect(res.body?.data?.slider?.heading).toBe('Keep Me');
      expect(res.body?.data?.slider?.offerText).toBe('Same offer');
    });
  });

  describe('Homepage bundle sort', () => {
    it('returns active sliders in placement then displayOrder', async () => {
      await Slider.create([
        sliderPayload({ placement: 'promo1', heading: 'Promo', displayOrder: 1, isActive: true }),
        sliderPayload({ placement: 'hero', heading: 'Hero B', displayOrder: 2, isActive: true }),
        sliderPayload({ placement: 'hero', heading: 'Hero A', displayOrder: 1, isActive: true }),
        sliderPayload({ placement: 'hero', heading: 'Hidden', displayOrder: 3, isActive: false }),
      ]);

      const res = await request(app).get('/api/homepage-bundle');
      expect(res.status).toBe(200);
      expect(res.body.sliders.map((s) => s.heading)).toEqual(['Hero A', 'Hero B', 'Promo']);
    });
  });

  describe('Cache invalidation', () => {
    it('clears homepage bundle cache after slider update', async () => {
      const slider = await Slider.create(
        sliderPayload({ placement: 'hero', heading: 'Cached', displayOrder: 1 })
      );

      await request(app).get('/api/homepage-bundle?locale=en');
      expect(cache.get('homepage-bundle-en')).toBeTruthy();

      await request(app)
        .put(`/api/sliders/${slider._id}`)
        .field('heading', 'Cached')
        .field('offerText', 'Test Offer')
        .field('buttonText', 'Shop Now')
        .field('buttonLink', 'https://example.com')
        .field('isActive', 'true')
        .field('placement', 'hero')
        .field('displayOrder', '2');

      expect(cache.get('homepage-bundle-en')).toBeUndefined();
    });
  });
});
