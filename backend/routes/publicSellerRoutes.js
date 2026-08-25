const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { applyTranslations } = require('../utils/applyTranslations');
const {
  findSellerByStorefrontParam,
  toPublicShopProfile,
} = require('../utils/sellerStorefront');
const { rejectPublicSellerStorefront } = require('../middleware/aaurikaaMarketplaceGuard');

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

const PRODUCT_CARD_SELECT =
  '_id name slug mainImage salePrice regularPrice sku stock avgRating reviewCount createdAt isFeatured bulkDiscount taxIncluded galleryImages';

/**
 * GET /api/sellers/storefront/:shopUrl
 * Public seller storefront: shop profile + paginated published products.
 */
router.get('/storefront/:shopUrl', rejectPublicSellerStorefront, async (req, res, next) => {
  try {
    const { shopUrl } = req.params;
    const seller = await findSellerByStorefrontParam(shopUrl);

    if (!seller) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    let limit = parseInt(req.query.limit, 10) || DEFAULT_LIMIT;
    if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
    limit = Math.min(limit, MAX_LIMIT);
    const skip = (page - 1) * limit;

    const filter = {
      seller: seller._id,
      status: 'published',
      approvalStatus: 'approved',
    };

    const [productsRaw, totalCount] = await Promise.all([
      Product.find(filter)
        .select(PRODUCT_CARD_SELECT)
        .populate('brand', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    let products = productsRaw;
    const locale = req.query.locale;
    if (locale && locale !== 'en' && products.length > 0) {
      products = await applyTranslations(products, 'Product', locale, ['name']);
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    res.json({
      shop: toPublicShopProfile(seller),
      products,
      totalCount,
      totalPages,
      currentPage: page,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
