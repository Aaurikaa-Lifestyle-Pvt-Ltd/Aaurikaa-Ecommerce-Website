/** Approved R2 top-level prefixes for media naming v2 */
const MEDIA_CATEGORIES = Object.freeze([
  'products',
  'categories',
  'brands',
  'sellers',
  'blogs',
  'banners',
  'media',
  'site',
]);

const isValidMediaCategory = (value) =>
  typeof value === 'string' && MEDIA_CATEGORIES.includes(value);

module.exports = {
  MEDIA_CATEGORIES,
  isValidMediaCategory,
};
