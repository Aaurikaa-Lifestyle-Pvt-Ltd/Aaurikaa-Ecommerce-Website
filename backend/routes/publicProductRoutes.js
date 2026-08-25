const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Product = require("../models/Product");
const Category = require("../models/Category");
const FeaturedCategory = require("../models/FeaturedCategory");
const Subcategory = require("../models/Subcategory");
const ChildCategory = require("../models/ChildCategory");
const { applyTranslations } = require("../utils/applyTranslations");
const {
  PUBLIC_SELLER_POPULATE_FIELDS,
  attachPublicSellerFieldsToProduct,
} = require("../utils/sellerStorefront");
const {
  attachPublicProductAssurance,
  attachProductOccasions,
} = require("../utils/productAssuranceFields");
const {
  searchProducts,
  getProductSuggestions,
  getCataloguePriceBounds,
  DEFAULT_SUGGESTION_LIMIT,
} = require("../services/search/globalSearchService");

const TAXONOMY_PUBLIC_SELECT = "name slug";

// ─────────────────────────────────────────────
// ROUTES:
// 1️⃣ GET /api/products                → All published products (with optional ?tag=)
// 2️⃣ GET /api/products/search         → Live search suggestions
// 3️⃣ GET /api/products/category/:slug → Products by category slug or name
// 4️⃣ GET /api/products/:id            → Single product by Mongo ID
// ─────────────────────────────────────────────

/**
 * 1️⃣ Get all published products (paginated)
 * Query: ?tag= | ?page=1&limit=24 | ?brand=&category=&subcategory=&childCategory=&q=&minPrice=&maxPrice=&rating=&sortBy=&inStock=
 * Returns: { products, totalCount, totalPages, currentPage }
 */
router.get("/", async (req, res, next) => {
  try {
    const result = await searchProducts(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Catalogue price bounds for storefront range UI (same filters as GET /, excluding min/max price).
 * Returns: { minPrice: number|null, maxPrice: number|null }
 */
router.get("/price-bounds", async (req, res, next) => {
  try {
    const bounds = await getCataloguePriceBounds(req.query);
    res.json(bounds);
  } catch (err) {
    next(err);
  }
});

/**
 * 2️⃣ Live Search - Get products by name (partial match)
 * Example: /api/products/search?q=iphone
 */
router.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);

  try {
    const products = await getProductSuggestions(q, {
      limit: DEFAULT_SUGGESTION_LIMIT,
      locale: req.query.locale,
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Search failed" });
  }
});

router.get("/category/:slug", async (req, res, next) => {
  const rawSlug = req.params.slug;
  if (!rawSlug) return res.status(400).json({ message: "Slug is required" });

  const slug = rawSlug.toLowerCase();

  // Helper to escape regex special characters
  const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    const escapedSlug = escapeRegExp(slug);
    // Allow both spaces and hyphens in the name match to be more resilient
    const nameRegexPattern = `^${escapedSlug.replace(/-/g, '[- ]')}$`;
    const nameRegex = new RegExp(nameRegexPattern, "i");

    // 🔍 1. Find the target category/subcategory/child-category
    // Category: single match. Subcategory & ChildCategory: find all matches (handles duplicate slugs).
    const [cat, subs, children] = await Promise.all([
      Category.findOne({ $or: [{ slug }, { name: nameRegex }] }),
      Subcategory.find({ $or: [{ slug }, { name: nameRegex }] }).lean(),
      ChildCategory.find({ $or: [{ slug }, { name: nameRegex }] }).lean()
    ]);

    let filter = { status: "published", approvalStatus: "approved" };

    if (cat) {
      // Inactive root categories must not surface products on the storefront.
      if (cat.isActive === false) {
        return res.status(404).json({ message: "Category/Subcategory not found", products: [] });
      }
      filter.category = cat._id;
    } else if (subs && subs.length > 0) {
      const parentCats = await Category.find({
        _id: { $in: subs.map((s) => s.category) },
        isActive: true,
      })
        .select("_id")
        .lean();
      const activeParentIds = new Set(parentCats.map((c) => String(c._id)));
      const subcategoryIds = subs
        .filter((s) => activeParentIds.has(String(s.category)))
        .map((s) => s._id);
      if (!subcategoryIds.length) {
        return res.status(404).json({ message: "Category/Subcategory not found", products: [] });
      }
      filter.subcategory = { $in: subcategoryIds };
    } else if (children && children.length > 0) {
      const parentSubs = await Subcategory.find({
        _id: { $in: children.map((c) => c.subcategory) },
      })
        .select("_id category")
        .lean();
      const parentCats = await Category.find({
        _id: { $in: parentSubs.map((s) => s.category) },
        isActive: true,
      })
        .select("_id")
        .lean();
      const activeCatIds = new Set(parentCats.map((c) => String(c._id)));
      const activeSubIds = new Set(
        parentSubs
          .filter((s) => activeCatIds.has(String(s.category)))
          .map((s) => String(s._id))
      );
      const childCategoryIds = children
        .filter((c) => activeSubIds.has(String(c.subcategory)))
        .map((c) => c._id);
      if (!childCategoryIds.length) {
        return res.status(404).json({ message: "Category/Subcategory not found", products: [] });
      }
      filter.childCategory = { $in: childCategoryIds };
    } else {
      // If no category found by slug/name, check if the slug IS an ObjectId itself (fallback for admin/debugging)
      if (mongoose.isValidObjectId(rawSlug)) {
        // Try to see if it belongs to any level
        const id = rawSlug;
        const [isCat, isSub, isChild] = await Promise.all([
          Category.exists({ _id: id }),
          Subcategory.exists({ _id: id }),
          ChildCategory.exists({ _id: id })
        ]);

        if (isCat) filter.category = id;
        else if (isSub) filter.subcategory = id;
        else if (isChild) filter.childCategory = id;
        else return res.status(404).json({ message: "Category not found", products: [] });
      } else {
        return res.status(404).json({ message: "Category/Subcategory not found", products: [] });
      }
    }

    let products = await Product.find(filter)
      .select("-vendorCost -internalNotes")
      .populate("category", TAXONOMY_PUBLIC_SELECT)
      .populate("subcategory", TAXONOMY_PUBLIC_SELECT)
      .populate("childCategory", TAXONOMY_PUBLIC_SELECT)
      .populate("brand", "name")
      .populate("seller", "shopName firstName lastName")
      .populate("sellerShop", "shopName firstName lastName")
      .sort({ createdAt: -1 })
      .lean();
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      products = await applyTranslations(products, 'Product', locale, ['name', 'shortDesc', 'longDesc']);
    }
    res.json({ products });
  } catch (err) {
    console.error("❌ Error in /api/products/category/:slug:", err);
    next(err);
  }
});

/**
 * Get products by SKUs (for cross-sell, upsell, bought together)
 * ⚠️ Important: Must be above ":id" route to avoid conflict
 */
const BULK_BY_IDS_MAX = 12;

function parseAndValidateIds(rawIds) {
  const list = Array.isArray(rawIds) ? rawIds : [];
  return list
    .map((id) => (id && String(id).trim()) || '')
    .filter(Boolean)
    .filter((id) => mongoose.isValidObjectId(id))
    .slice(0, BULK_BY_IDS_MAX);
}

/**
 * Get products by IDs (for recently viewed, etc.)
 * Query: ?ids=id1,id2,id3 – order of ids is preserved in response. Max 12 IDs.
 */
router.get('/by-ids', async (req, res) => {
  try {
    const rawIds = req.query.ids?.split(',').map((s) => s.trim()).filter(Boolean) || [];
    const ids = parseAndValidateIds(rawIds);
    if (ids.length === 0) {
      return res.json({ products: [] });
    }
    let products = await Product.find({
      _id: { $in: ids },
      status: 'published',
      approvalStatus: 'approved',
    })
      .select('-vendorCost -internalNotes')
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('childCategory', 'name slug')
      .populate('brand', 'name')
      .populate('seller', 'shopName firstName lastName')
      .populate('sellerShop', 'shopName firstName lastName')
      .lean();
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      products = await applyTranslations(products, 'Product', locale, ['name', 'shortDesc', 'longDesc']);
    }
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    res.json({ products: ordered });
  } catch (err) {
    console.error('Error fetching products by IDs:', err);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
});

/**
 * POST /api/products/bulk-by-ids – body: { ids: ["id1", "id2", ...] }
 * Returns products in the same order as IDs. Max 12 IDs. For recently viewed.
 */
router.post('/bulk-by-ids', express.json(), async (req, res) => {
  try {
    const raw = parseAndValidateIds(req.body?.ids);
    const seen = new Set();
    const ids = [];
    for (const id of raw) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    if (ids.length === 0) {
      return res.json({ products: [] });
    }
    let products = await Product.find({
      _id: { $in: ids },
      status: 'published',
      approvalStatus: 'approved',
    })
      .select('-vendorCost -internalNotes')
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('childCategory', 'name slug')
      .populate('brand', 'name')
      .populate('seller', 'shopName firstName lastName')
      .populate('sellerShop', 'shopName firstName lastName')
      .lean();
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      products = await applyTranslations(products, 'Product', locale, ['name', 'shortDesc', 'longDesc']);
    }
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    res.json({ products: ordered });
  } catch (err) {
    console.error('Error in bulk-by-ids:', err);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
});

router.get('/by-skus', async (req, res) => {
  try {
    const skus = req.query.skus?.split(',') || [];
    if (skus.length === 0) {
      return res.json({ products: [] });
    }
    let products = await Product.find({ sku: { $in: skus }, status: 'published', approvalStatus: 'approved' })
      .select('_id name slug mainImage salePrice regularPrice sku stock avgRating reviewCount taxIncluded createdAt isFeatured bulkDiscount galleryImages')
      .populate("brand", "name")
      .populate("seller", "shopName")
      .lean();
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      products = await applyTranslations(products, 'Product', locale, ['name']);
    }
    res.json({ products });
  } catch (err) {
    console.error('Error fetching products by SKUs:', err);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
});

/**
 * Get products by seller ID (for "More Products" section)
 * ⚠️ Important: Must be above ":id" route to avoid conflict
 * Query params: ?exclude=<productId> to exclude current product, ?limit=10 to cap results
 */
router.get('/by-seller/:sellerId', async (req, res, next) => {
  try {
    const { sellerId } = req.params;
    const { exclude, limit } = req.query;

    if (!mongoose.isValidObjectId(sellerId)) {
      return res.status(400).json({ message: 'Invalid seller ID' });
    }

    const filter = {
      seller: sellerId,
      status: 'published',
      approvalStatus: 'approved'
    };

    // Exclude current product if provided
    if (exclude && mongoose.isValidObjectId(exclude)) {
      filter._id = { $ne: exclude };
    }

    let query = Product.find(filter);
    if (limit != null && limit !== '') {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) query = query.limit(Math.min(limitNum, 50));
    }

    let products = await query
      .select('_id name slug mainImage salePrice regularPrice sku stock avgRating reviewCount taxIncluded createdAt isFeatured bulkDiscount galleryImages')
      .populate("brand", "name")
      .populate("seller", "shopName")
      .lean();
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      products = await applyTranslations(products, 'Product', locale, ['name']);
    }
    res.json({ products });
  } catch (err) {
    console.error('Error fetching products by seller:', err);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
});

/**
 * Get related products (deterministic query using category OR tags OR SKU arrays)
 * ⚠️ Important: Must be above ":id" route to avoid conflict
 * Query params: ?productId=<productId> (required)
 */
router.get('/related', async (req, res, next) => {
  try {
    const { productId } = req.query;

    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: 'Valid product ID is required' });
    }

    // Fetch current product to get category, tags, and SKU arrays
    const currentProduct = await Product.findOne({
      _id: productId,
      status: 'published',
      approvalStatus: 'approved'
    }).lean();

    if (!currentProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const relatedProducts = [];
    const seenIds = new Set([productId.toString()]);

    // Strategy 1: Products from same category
    if (currentProduct.category) {
      const categoryProducts = await Product.find({
        _id: { $ne: productId },
        category: currentProduct.category,
        status: 'published',
        approvalStatus: 'approved'
      })
        .select('_id name slug mainImage salePrice regularPrice sku stock avgRating reviewCount taxIncluded createdAt isFeatured bulkDiscount galleryImages')
        .populate("brand", "name")
        .limit(5)
        .lean();

      categoryProducts.forEach(p => {
        if (!seenIds.has(p._id.toString())) {
          relatedProducts.push(p);
          seenIds.add(p._id.toString());
        }
      });
    }

    // Strategy 2: Products with matching tags (if we have less than 5)
    if (relatedProducts.length < 5 && currentProduct.tags && currentProduct.tags.length > 0) {
      const excludeIds = Array.from(seenIds);
      const tagProducts = await Product.find({
        _id: { $nin: excludeIds },
        tags: { $in: currentProduct.tags },
        status: 'published',
        approvalStatus: 'approved'
      })
        .select('_id name slug mainImage salePrice regularPrice sku stock avgRating reviewCount taxIncluded createdAt isFeatured bulkDiscount galleryImages')
        .populate("brand", "name")
        .limit(5 - relatedProducts.length)
        .lean();

      tagProducts.forEach(p => {
        if (!seenIds.has(p._id.toString())) {
          relatedProducts.push(p);
          seenIds.add(p._id.toString());
        }
      });
    }

    // Strategy 3: Products from cross-sell/upsell/bought-together SKUs (if we have less than 5)
    const skuArrays = [
      ...(currentProduct.crossSellSkus || []),
      ...(currentProduct.upsellSkus || []),
      ...(currentProduct.boughtTogetherSkus || [])
    ];

    if (relatedProducts.length < 5 && skuArrays.length > 0) {
      const excludeIds = Array.from(seenIds);
      const skuProducts = await Product.find({
        _id: { $nin: excludeIds },
        sku: { $in: skuArrays },
        status: 'published',
        approvalStatus: 'approved'
      })
        .select('_id name slug mainImage salePrice regularPrice sku stock avgRating reviewCount taxIncluded createdAt isFeatured bulkDiscount galleryImages')
        .populate("brand", "name")
        .limit(5 - relatedProducts.length)
        .lean();

      skuProducts.forEach(p => {
        if (!seenIds.has(p._id.toString())) {
          relatedProducts.push(p);
          seenIds.add(p._id.toString());
        }
      });
    }
    const locale = req.query.locale;
    if (locale && locale !== 'en' && relatedProducts.length > 0) {
      relatedProducts = await applyTranslations(relatedProducts, 'Product', locale, ['name', 'shortDesc', 'longDesc']);
    }
    res.json({ products: relatedProducts });
  } catch (err) {
    console.error('Error fetching related products:', err);
    res.status(500).json({ message: 'Failed to fetch related products' });
  }
});

/**
 * 4️⃣ Get single product by MongoDB _id
 */
router.get("/:id", async (req, res, next) => {
  const { id } = req.params;
  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    let product = await Product.findOne({
      _id: id,
      status: "published",
      approvalStatus: "approved",
    })
      .select("-vendorCost -internalNotes")
      .populate("category", TAXONOMY_PUBLIC_SELECT)
      .populate("subcategory", TAXONOMY_PUBLIC_SELECT)
      .populate("childCategory", TAXONOMY_PUBLIC_SELECT)
      .populate("brand", "name")
      .populate("seller", PUBLIC_SELLER_POPULATE_FIELDS)
      .populate("sellerShop", PUBLIC_SELLER_POPULATE_FIELDS)
      .populate("weightClass", "name")
      .populate("mainImageId", "alt_text")
      .populate("galleryImageIds", "alt_text")
      .populate("videoId", "alt_text")
      .lean();

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const locale = req.query.locale;
    if (locale && locale !== "en") {
      product = await applyTranslations(product, "Product", locale, ["name", "shortDesc", "longDesc"]);
    }

    attachPublicSellerFieldsToProduct(product);
    attachPublicProductAssurance(product);
    await attachProductOccasions(product);
    res.json(product);
  } catch (err) {
    next(err);
  }
});

/**
 * 5️⃣ Get single product by slug
 */
router.get("/slug/:slug", async (req, res, next) => {
  const { slug } = req.params;

  try {
    let product = await Product.findOne({ slug: slug, status: "published", approvalStatus: "approved" })
      .select("-vendorCost -internalNotes")
      .populate("category", TAXONOMY_PUBLIC_SELECT)
      .populate("subcategory", TAXONOMY_PUBLIC_SELECT)
      .populate("childCategory", TAXONOMY_PUBLIC_SELECT)
      .populate("brand", "name")
      .populate("seller", PUBLIC_SELLER_POPULATE_FIELDS)
      .populate("sellerShop", PUBLIC_SELLER_POPULATE_FIELDS)
      .populate("weightClass", "name")
      .lean();

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      product = await applyTranslations(product, 'Product', locale, ['name', 'shortDesc', 'longDesc']);
    }
    attachPublicSellerFieldsToProduct(product);
    attachPublicProductAssurance(product);
    await attachProductOccasions(product);
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// ✅ Get Featured Categories
router.get("/featured-categories", async (req, res) => {
  try {
    const featuredCategories = await FeaturedCategory.findOne({});
    const categoryIds = featuredCategories ? featuredCategories.categoryIds : [];
    res.json({ categoryIds });
  } catch (err) {
    console.error("Error fetching featured categories:", err);
    res.status(500).json({ message: "Error fetching featured categories." });
  }
});

module.exports = router;
