/**
 * Allowlisted static informational pages (closed set).
 * pageKey matches admin registry _id and Next.js page filename where applicable.
 */
const STATIC_PAGE_REGISTRY = [
  { pageKey: 'about', slug: '/about', title: 'About AAURIKAA', type: 'about' },
  { pageKey: 'accessibility', slug: '/accessibility', title: 'Accessibility', type: 'custom' },
  { pageKey: 'become-seller', slug: '/become-seller', title: 'Become a Seller', type: 'custom' },
  { pageKey: 'careers', slug: '/careers', title: 'Careers', type: 'custom' },
  { pageKey: 'contact', slug: '/contact', title: 'Contact Us', type: 'contact' },
  { pageKey: 'cookies', slug: '/cookies', title: 'Cookies Policy', type: 'policy' },
  { pageKey: 'delivery-info', slug: '/delivery-info', title: 'Delivery Info', type: 'custom' },
  { pageKey: 'faq', slug: '/faq', title: 'FAQ', type: 'custom' },
  { pageKey: 'help-center', slug: '/help-center', title: 'Help Center', type: 'custom' },
  { pageKey: 'jewellery-care', slug: '/jewellery-care', title: 'Jewellery Care', type: 'custom' },
  { pageKey: 'myAccount', slug: '/myAccount', title: 'My Account', type: 'custom' },
  { pageKey: 'order-history', slug: '/order-history', title: 'Order History', type: 'custom' },
  { pageKey: 'order-tracking', slug: '/order-tracking', title: 'Order Tracking', type: 'custom' },
  { pageKey: 'payment-options', slug: '/payment-options', title: 'Payment Options', type: 'custom' },
  { pageKey: 'privacy-policy', slug: '/privacy-policy', title: 'Privacy Policy', type: 'policy' },
  { pageKey: 'returns-refund-policy', slug: '/returns-refund-policy', title: 'Returns & Refund Policy', type: 'policy' },
  { pageKey: 'forum', slug: '/forum', title: 'Forum', type: 'custom' },
  { pageKey: 'press', slug: '/press', title: 'Press', type: 'custom' },
  { pageKey: 'seller-faq', slug: '/seller-faq', title: 'Seller FAQ', type: 'custom' },
  { pageKey: 'seller-help-center', slug: '/seller-help-center', title: 'Seller Help Center', type: 'custom' },
  { pageKey: 'seller-terms-condition', slug: '/seller-terms-condition', title: 'Seller Terms & Conditions', type: 'custom' },
  { pageKey: 'seller-training', slug: '/seller-training', title: 'Seller Training', type: 'custom' },
  { pageKey: 'shipping-policy', slug: '/shipping-policy', title: 'Shipping & Delivery', type: 'policy' },
  { pageKey: 'sitemap', slug: '/sitemap', title: 'Sitemap', type: 'custom' },
  { pageKey: 'terms-condition', slug: '/terms-condition', title: 'Terms & Conditions', type: 'custom' },
  { pageKey: 'warranty-guarantee', slug: '/warranty-guarantee', title: 'Warranty & Guarantee', type: 'custom' },
  { pageKey: 'well-wisher-suggestions', slug: '/well-wisher-suggestions', title: 'Well Wisher Suggestions', type: 'custom' },
  { pageKey: 'security-policy', slug: '/security-policy', title: 'Security Policy', type: 'policy' },
];

const PILOT_PAGE_KEYS = new Set(['cookies', 'security-policy', 'warranty-guarantee']);

const PHASE_2_PAGE_KEYS = new Set([
  'privacy-policy',
  'terms-condition',
  'returns-refund-policy',
  'shipping-policy',
]);

const PHASE_3_PAGE_KEYS = new Set(['faq', 'seller-faq', 'help-center', 'seller-help-center']);

const PHASE_4_PAGE_KEYS = new Set([
  'about',
  'contact',
  'careers',
  'become-seller',
  'delivery-info',
  'payment-options',
  'accessibility',
  'sitemap',
  'forum',
  'press',
  'seller-training',
  'well-wisher-suggestions',
  'seller-terms-condition',
  'jewellery-care',
]);

const CMS_SEED_PAGE_KEYS = new Set([
  ...PILOT_PAGE_KEYS,
  ...PHASE_2_PAGE_KEYS,
  ...PHASE_3_PAGE_KEYS,
  ...PHASE_4_PAGE_KEYS,
]);

/** Marketplace/seller informational pages — hidden in AAURIKAA single-store mode. */
const MARKETPLACE_STATIC_PAGE_KEYS = new Set([
  'become-seller',
  'seller-faq',
  'seller-help-center',
  'seller-terms-condition',
  'seller-training',
]);

const registryByKey = new Map(STATIC_PAGE_REGISTRY.map((e) => [e.pageKey, e]));

function getRegistryEntry(pageKey) {
  return registryByKey.get(pageKey) || null;
}

function isAllowedPageKey(pageKey) {
  return registryByKey.has(pageKey);
}

function isPilotPageKey(pageKey) {
  return PILOT_PAGE_KEYS.has(pageKey);
}

function isMarketplaceStaticPageKey(pageKey) {
  return MARKETPLACE_STATIC_PAGE_KEYS.has(pageKey);
}

module.exports = {
  STATIC_PAGE_REGISTRY,
  MARKETPLACE_STATIC_PAGE_KEYS,
  PILOT_PAGE_KEYS,
  PHASE_2_PAGE_KEYS,
  PHASE_3_PAGE_KEYS,
  PHASE_4_PAGE_KEYS,
  CMS_SEED_PAGE_KEYS,
  getRegistryEntry,
  isAllowedPageKey,
  isPilotPageKey,
  isMarketplaceStaticPageKey,
};
