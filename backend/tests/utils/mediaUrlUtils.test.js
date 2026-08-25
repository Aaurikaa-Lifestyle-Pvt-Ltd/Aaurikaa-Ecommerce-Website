const {
  resolvePublicUrl,
  toR2DeleteKey,
  publicUrlFromKey,
} = require('../../utils/mediaUrlUtils');

describe('mediaUrlUtils', () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_R2_PUBLIC_URL = 'https://cdn.example.com';
  });

  test('resolvePublicUrl passes through https URLs', () => {
    const url = 'https://cdn.example.com/products/2026/05/a.webp';
    expect(resolvePublicUrl(url)).toBe(url);
  });

  test('resolvePublicUrl rewrites mistaken localhost R2 gallery paths', () => {
    const local =
      'http://localhost:5000/uploads/admin/gallery/1787409021543_271ed557864cfe4ff0955c987f8737c5_ChatGPT_Image_Aug_21__2026__06_16_10_PM.webp';
    const url = resolvePublicUrl(local);
    expect(url).toMatch(/\.r2\.dev\/admin\/gallery\//);
    expect(url).not.toContain('localhost:5000/uploads');
  });

  test('resolvePublicUrl resolves R2 object keys via public CDN', () => {
    const url = resolvePublicUrl('admin/gallery/hero.webp');
    expect(url).toMatch(/\/admin\/gallery\/hero\.webp$/);
  });

  test('resolvePublicUrl prefixes legacy bare filenames', () => {
    expect(resolvePublicUrl('photo.jpg', 'http://api.test')).toBe(
      'http://api.test/uploads/photo.jpg'
    );
  });

  test('toR2DeleteKey extracts key from full URL', () => {
    expect(
      toR2DeleteKey('https://cdn.example.com/products/2026/05/slug.webp')
    ).toBe('products/2026/05/slug.webp');
  });

  test('toR2DeleteKey returns legacy path as key', () => {
    expect(toR2DeleteKey('admin/legacy.jpg')).toBe('admin/legacy.jpg');
  });

  test('publicUrlFromKey builds CDN URL', () => {
    const url = publicUrlFromKey('media/2026/05/hero.webp');
    expect(url).toMatch(/\/media\/2026\/05\/hero\.webp$/);
  });
});
