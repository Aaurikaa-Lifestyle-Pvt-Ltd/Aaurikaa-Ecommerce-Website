const express = require("express");
const router = express.Router();

const {
  resolveTaxonomy,
  getTaxonomyProducts,
  getTaxonomyPriceBounds,
  legacyLookup,
} = require("../controllers/taxonomyController");

// Canonical taxonomy resolve (breadcrumbs + navigation + seo)
router.get("/resolve", resolveTaxonomy);

// Canonical taxonomy product listing (shape aligned with /api/products)
router.get("/products", getTaxonomyProducts);

// Catalogue price bounds for PLP range UI (optional categorySlug/subSlug/childSlug)
router.get("/price-bounds", getTaxonomyPriceBounds);

// Legacy slug lookup (used by /category/[slug] redirect logic)
router.get("/legacy-lookup/:slug", legacyLookup);

module.exports = router;

