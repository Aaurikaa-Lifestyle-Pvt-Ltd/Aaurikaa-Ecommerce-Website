const { resolveUploadContext } = require('../../services/mediaUploadContextResolver');

jest.mock('../../models/Product', () => ({
  findById: jest.fn(),
}));

const Product = require('../../models/Product');

describe('mediaUploadContextResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('product upload uses req.body.name', async () => {
    const req = {
      body: { name: '  Widget Pro  ' },
      _mediaUploadKind: 'product',
    };
    const file = { fieldname: 'mainImage', mimetype: 'image/webp' };

    const ctx = await resolveUploadContext(req, file, { extension: '.webp' });
    expect(ctx.mediaCategory).toBe('products');
    expect(ctx.baseLabel).toBe('Widget Pro');
    expect(ctx.role).toBe('main');
  });

  test('gallery field sets sequence index', async () => {
    const req = { body: { name: 'Widget' }, _mediaUploadKind: 'product' };
    const file = { fieldname: 'galleryImages' };

    const ctx = await resolveUploadContext(req, file, {
      extension: '.webp',
      galleryIndex: 2,
    });
    expect(ctx.role).toBe('gallery');
    expect(ctx.sequenceIndex).toBe(2);
  });

  test('blog uses title', async () => {
    const req = { body: { title: 'How to Style' }, _mediaUploadKind: 'blog' };
    const ctx = await resolveUploadContext(req, { fieldname: 'image' }, { extension: '.webp' });
    expect(ctx.mediaCategory).toBe('blogs');
    expect(ctx.baseLabel).toBe('How to Style');
  });

  test('product update falls back to DB name', async () => {
    Product.findById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ name: 'From DB' }),
      }),
    });

    const req = {
      body: {},
      params: { id: '507f1f77bcf86cd799439011' },
      _mediaUploadKind: 'product',
    };
    const ctx = await resolveUploadContext(req, { fieldname: 'mainImage' }, { extension: '.webp' });
    expect(ctx.baseLabel).toBe('From DB');
    expect(Product.findById).toHaveBeenCalled();
  });

  test('seller doc maps aadhaarFront roleKey', async () => {
    const req = {
      body: { shopName: 'Anbazar Fashion' },
      _mediaUploadKind: 'seller-doc',
    };
    const ctx = await resolveUploadContext(
      req,
      { fieldname: 'aadhaarFront', originalname: 'scan.pdf' },
      { extension: '.pdf' }
    );
    expect(ctx.mediaCategory).toBe('sellers');
    expect(ctx.role).toBe('document');
    expect(ctx.roleKey).toBe('aadhaar-front');
  });

  test('site favicon uses favicon role', async () => {
    const req = { _mediaUploadKind: 'site' };
    const ctx = await resolveUploadContext(
      req,
      { fieldname: 'favicon' },
      { extension: '.ico' }
    );
    expect(ctx.mediaCategory).toBe('site');
    expect(ctx.role).toBe('favicon');
  });
});
