const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Slider = require('../models/Slider');
const HomepageGrid4x4 = require('../models/HomepageGrid4x4');
const BannerSettings = require('../models/bannerSettingsModel');
const Product = require('../models/Product');
const HomepageCategoryConfig = require('../models/HomepageCategoryConfig');
const Brand = require('../models/brand');
const Blog = require('../models/Blog');
const SiteSettings = require('../models/SiteSettings');
const Translation = require('../models/Translation');
const { applyTranslations } = require('../utils/applyTranslations');
const cache = require('../utils/cache');
const { withAdminAuth } = require('../utils/adminAuthChain');

const HOMEPAGE_BUNDLE_TTL = 120; // seconds
const SLIDER_SORT = { placement: 1, displayOrder: 1, createdAt: -1, _id: 1 };
// Include `slug` because product cards link to `/product/:slug` when available.
const PRODUCT_SELECT_MINIMAL = '_id name slug mainImage salePrice regularPrice stock avgRating reviewCount taxIncluded features galleryImages category subcategory childCategory brand variants createdAt isFeatured bulkDiscount';

const MAX_ITEMS = 16;
const MAX_GROUPS = 4;
const ITEMS_PER_GROUP = 4;

function itemsToGroups(doc) {
  if (doc.groups && Array.isArray(doc.groups) && doc.groups.length > 0) {
    return doc.groups.slice(0, MAX_GROUPS).map((g) => ({
      heading: g.heading || '',
      items: (g.items || []).slice(0, ITEMS_PER_GROUP),
    }));
  }
  const items = (doc.items || []).slice(0, MAX_ITEMS);
  const groups = [];
  for (let g = 0; g < MAX_GROUPS; g++) {
    groups.push({
      heading: '',
      items: items.slice(g * ITEMS_PER_GROUP, (g + 1) * ITEMS_PER_GROUP),
    });
  }
  return groups;
}

async function getGrid4x4Data(locale) {
  const doc = await HomepageGrid4x4.findOne().lean();
  if (!doc) return { groups: [] };
  let groups = itemsToGroups(doc).map((g) => ({
    heading: g.heading,
    items: (g.items || [])
      .filter((item) => item.isActive !== false && item.image && item.link)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  }));
  if (locale && locale !== 'en' && doc._id) {
    const tr = await Translation.findOne({ model: 'HomepageGrid4x4', documentId: doc._id, locale }).lean();
    if (tr && tr.fields) {
      const fields = tr.fields instanceof Map ? Object.fromEntries(tr.fields) : tr.fields;
      const trGroups = Array.isArray(fields.groups) ? fields.groups : null;
      groups.forEach((g, gi) => {
        if (trGroups && trGroups[gi]) {
          if (trGroups[gi].heading != null) g.heading = trGroups[gi].heading;
          const trItems = Array.isArray(trGroups[gi].items) ? trGroups[gi].items : [];
          (g.items || []).forEach((item, ii) => {
            if (trItems[ii] && trItems[ii].caption != null) item.caption = trItems[ii].caption;
          });
        } else {
          if (fields[`${gi}_heading`] != null) g.heading = fields[`${gi}_heading`];
          (g.items || []).forEach((item, ii) => {
            if (fields[`${gi}_items_${ii}_caption`] != null) item.caption = fields[`${gi}_items_${ii}_caption`];
          });
        }
      });
    }
  }
  const hasAny = groups.some((g) => g.items.length > 0);
  return { groups: hasAny ? groups : [] };
}

async function getBannerSettingsData(locale) {
  let settings = await BannerSettings.findOne().lean();
  if (!settings) return {};
  if (locale && locale !== 'en' && settings._id) {
    const tr = await Translation.findOne({ model: 'BannerSettings', documentId: settings._id, locale }).lean();
    if (tr && tr.fields) {
      const fields = tr.fields instanceof Map ? Object.fromEntries(tr.fields) : tr.fields;
      if (fields.sectionTitle != null) settings.sectionTitle = fields.sectionTitle;
      const offers = settings.offers || [];
      offers.forEach((offer, i) => {
        if (fields[`${i}_heading`] != null) offer.heading = fields[`${i}_heading`];
        if (fields[`${i}_text`] != null) offer.text = fields[`${i}_text`];
        if (fields[`${i}_buttonText`] != null) offer.buttonText = fields[`${i}_buttonText`];
      });
    }
  }
  return settings;
}

async function getSiteSettingsData() {
  const settings = await SiteSettings.findOne().sort({ createdAt: 1 }).lean();
  if (!settings) {
    return {
      title: '',
      tagline: '',
      logo: '',
      favicon: '',
      recentlyViewedVisibleCount: 6,
      bestSellerSellerId: null,
      bestSellerCategoryId: null,
    };
  }
  return {
    title: settings.title || '',
    tagline: settings.tagline || '',
    logo: settings.logo || '',
    favicon: settings.favicon || '',
    recentlyViewedVisibleCount: Math.min(8, Math.max(4, Number(settings.recentlyViewedVisibleCount) || 6)),
    bestSellerSellerId: settings.bestSellerSellerId || null,
    bestSellerCategoryId: settings.bestSellerCategoryId || null,
  };
}

async function getHomepageMediaSettingsData() {
  const settings = await SiteSettings.findOne().sort({ createdAt: 1 }).select('homepageMedia').lean();
  return settings && settings.homepageMedia ? settings.homepageMedia : {};
}

function buildBestSellerFilter(siteSettings) {
  const filter = { status: 'published', approvalStatus: 'approved' };
  if (siteSettings && siteSettings.bestSellerSellerId && mongoose.Types.ObjectId.isValid(siteSettings.bestSellerSellerId)) {
    filter.seller = siteSettings.bestSellerSellerId;
    return filter;
  }
  if (siteSettings && siteSettings.bestSellerCategoryId && mongoose.Types.ObjectId.isValid(siteSettings.bestSellerCategoryId)) {
    filter.category = siteSettings.bestSellerCategoryId;
    return filter;
  }
  return filter;
}

/**
 * GET /api/homepage-bundle?locale=xx
 * Returns all homepage data in one response. Cached by locale (TTL 120s).
 */
router.get('/', async (req, res) => {
  try {
    const locale = req.query.locale || 'en';
    const cacheKey = `homepage-bundle-${locale}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
      return res.json(cached);
    }

    const [
      slidersRaw,
      grid4x4,
      bannerSettings,
      featuredProductsRaw,
      bestSellersRaw,
      categoryProductsRaw,
      homepageConfigs,
      brandsRaw,
      blogPostsRaw,
      homepageMediaSettings,
      siteSettings,
    ] = await Promise.all([
      Slider.find().sort(SLIDER_SORT).lean(),
      getGrid4x4Data(locale),
      getBannerSettingsData(locale),
      Product.find({ status: 'published', approvalStatus: 'approved', isFeatured: true })
        .select(PRODUCT_SELECT_MINIMAL)
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .populate('childCategory', 'name slug')
        .populate('brand', 'name')
        .sort({ createdAt: -1 })
        .limit(12)
        .lean(),
      Product.find({ status: 'published', approvalStatus: 'approved' })
        .select(PRODUCT_SELECT_MINIMAL)
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .populate('childCategory', 'name slug')
        .populate('brand', 'name')
        .sort({ salesCount: -1, createdAt: -1 })
        .limit(12)
        .lean(),
      Product.find({ status: 'published', approvalStatus: 'approved' })
        .select(PRODUCT_SELECT_MINIMAL)
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .populate('childCategory', 'name slug')
        .populate('brand', 'name')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      HomepageCategoryConfig.find({})
        .populate('category', 'name')
        .populate('subcategory', 'name')
        .populate('childCategory', 'name')
        .sort({ sectionType: 1, sectionName: 1 })
        .lean(),
      Brand.findActive().lean(),
      Blog.find({ status: 'published' })
        .select('_id title image date slug')
        .sort({ date: -1 })
        .limit(6)
        .lean(),
      getHomepageMediaSettingsData(),
      getSiteSettingsData(),
    ]);

    let sliders = slidersRaw.filter((b) => b.isActive);
    if (locale && locale !== 'en') {
      sliders = await applyTranslations(sliders, 'Slider', locale, ['heading', 'offerText', 'buttonText']);
    }

    let featuredProducts = featuredProductsRaw;
    let bestSellers = bestSellersRaw;
    let categoryProducts = categoryProductsRaw;
    if (locale && locale !== 'en') {
      [featuredProducts, bestSellers, categoryProducts] = await Promise.all([
        applyTranslations(featuredProductsRaw, 'Product', locale, ['name', 'shortDesc', 'longDesc']),
        applyTranslations(bestSellersRaw, 'Product', locale, ['name', 'shortDesc', 'longDesc']),
        applyTranslations(categoryProductsRaw, 'Product', locale, ['name', 'shortDesc', 'longDesc']),
      ]);
    }

    let homepageCategories = { frontPage: [], twoRow: [] };
    if (Array.isArray(homepageConfigs)) {
      let configs = homepageConfigs;
      if (locale && locale !== 'en') {
        configs = await applyTranslations(homepageConfigs, 'HomepageCategoryConfig', locale, ['displayTitle']);
      }
      homepageCategories.frontPage = configs.filter((c) => c.sectionType === 'front-page');
      homepageCategories.twoRow = configs.filter((c) => c.sectionType === 'two-row');
    }

    let brands = brandsRaw;
    if (locale && locale !== 'en') {
      brands = await applyTranslations(brandsRaw, 'Brand', locale, ['name']);
    }

    let blogPosts = blogPostsRaw;
    if (locale && locale !== 'en') {
      blogPosts = await applyTranslations(blogPostsRaw, 'Blog', locale, ['title']);
    }

    const payload = {
      sliders,
      grid4x4,
      bannerSettings,
      featuredProducts,
      bestSellers,
      categoryProducts,
      homepageCategories,
      brands,
      blogPosts,
      // Backward compatible:
      // - `homepageMediaSettings` is consumed by `frontend/pages/index.js`
      // - `mediaSettings` is kept to avoid breaking any older consumers
      homepageMediaSettings,
      mediaSettings: homepageMediaSettings,
      siteSettings,
    };

    cache.set(cacheKey, payload, HOMEPAGE_BUNDLE_TTL);
    res.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    res.json(payload);
  } catch (err) {
    console.error('Homepage bundle error:', err);
    res.status(500).json({ message: 'Failed to load homepage bundle', error: err.message });
  }
});

/**
 * POST /api/homepage-bundle/invalidate
 * Admin-only: clear homepage bundle cache so next request refetches from DB.
 */
router.post('/invalidate', ...withAdminAuth('homepage', 'manage'), (req, res) => {
  const keys = cache.keys();
  const bundleKeys = keys.filter((k) => k.startsWith('homepage-bundle-'));
  bundleKeys.forEach((k) => cache.del(k));
  res.json({ message: 'Homepage bundle cache invalidated', cleared: bundleKeys.length });
});

module.exports = router;
