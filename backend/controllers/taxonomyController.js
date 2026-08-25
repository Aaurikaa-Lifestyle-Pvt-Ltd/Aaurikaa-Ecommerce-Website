const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const ChildCategory = require("../models/ChildCategory");
const { applyTranslations } = require("../utils/applyTranslations");
const {
  searchProducts,
  getCataloguePriceBounds,
} = require("../services/search/globalSearchService");
const { SITE_TITLE } = require("../config/aaurikaaFoundation");
const {
  sendErrorResponse,
  sendSuccessResponse,
  HTTP_STATUS,
  ERROR_CODES,
  asyncHandler,
} = require("../utils/errorHandler");

function escapeRegExp(string) {
  return String(string || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildNameRegex(slugOrName) {
  const raw = String(slugOrName || "").trim().toLowerCase();
  const escaped = escapeRegExp(raw);
  const nameRegexPattern = `^${escaped.replace(/-/g, "[- ]")}$`;
  return new RegExp(nameRegexPattern, "i");
}

function toSlugSafe(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function computeCanonicalPath({ categorySlug, subSlug, childSlug }) {
  const parts = [categorySlug, subSlug, childSlug].filter(Boolean);
  return `/categories/${parts.map(encodeURIComponent).join("/")}`;
}

function buildSeoDefaults({ depth, category, subcategory, childCategory }) {
  const pieces = [];
  if (childCategory?.name) pieces.push(childCategory.name);
  if (subcategory?.name) pieces.push(subcategory.name);
  if (category?.name) pieces.push(category.name);
  const brand = SITE_TITLE || "AAURIKAA";
  const title = pieces.length ? `${pieces.join(" / ")} - ${brand}` : `Shop - ${brand}`;
  const metaDescription = pieces.length
    ? `Browse ${pieces[0]} products on ${brand}.`
    : `Browse products on ${brand}.`;
  const canonicalPath = computeCanonicalPath({
    categorySlug: category?.slug,
    subSlug: subcategory?.slug,
    childSlug: childCategory?.slug,
  });
  return { depth, title, metaDescription, canonicalPath };
}

function buildBreadcrumbs({ category, subcategory, childCategory }) {
  const items = [
    { type: "home", name: "Home", href: "/" },
    { type: "shop", name: "Shop", href: "/categories" },
  ];
  if (category?.slug) {
    items.push({
      type: "category",
      name: category.name,
      slug: category.slug,
      href: computeCanonicalPath({ categorySlug: category.slug }),
    });
  }
  if (subcategory?.slug && category?.slug) {
    items.push({
      type: "subcategory",
      name: subcategory.name,
      slug: subcategory.slug,
      href: computeCanonicalPath({ categorySlug: category.slug, subSlug: subcategory.slug }),
    });
  }
  if (childCategory?.slug && subcategory?.slug && category?.slug) {
    items.push({
      type: "child",
      name: childCategory.name,
      slug: childCategory.slug,
      href: computeCanonicalPath({
        categorySlug: category.slug,
        subSlug: subcategory.slug,
        childSlug: childCategory.slug,
      }),
    });
  }
  return items;
}

async function resolveHierarchy({ categorySlug, subSlug, childSlug }) {
  const cat = await Category.findOne({ slug: categorySlug }).lean();
  if (!cat) return { notFound: "category" };
  // Root category inactive → hide entire public hierarchy under it.
  if (cat.isActive === false) return { notFound: "category" };

  if (!subSlug) {
    return { depth: 1, category: cat };
  }

  const sub = await Subcategory.findOne({ slug: subSlug, category: cat._id }).lean();
  if (!sub) return { notFound: "subcategory", category: cat };

  if (!childSlug) {
    return { depth: 2, category: cat, subcategory: sub };
  }

  const child = await ChildCategory.findOne({ slug: childSlug, subcategory: sub._id }).lean();
  if (!child) return { notFound: "childCategory", category: cat, subcategory: sub };

  return { depth: 3, category: cat, subcategory: sub, childCategory: child };
}

exports.resolveTaxonomy = asyncHandler(async (req, res) => {
  const rawCategorySlug = req.query.categorySlug;
  const rawSubSlug = req.query.subSlug;
  const rawChildSlug = req.query.childSlug;

  const categorySlug = toSlugSafe(rawCategorySlug);
  const subSlug = toSlugSafe(rawSubSlug);
  const childSlug = toSlugSafe(rawChildSlug);

  if (!categorySlug) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "categorySlug is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const resolved = await resolveHierarchy({ categorySlug, subSlug, childSlug });
  if (resolved.notFound) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Taxonomy not found",
      ERROR_CODES.RESOURCE_NOT_FOUND,
      { missing: resolved.notFound }
    );
  }

  const { depth, category, subcategory, childCategory } = resolved;

  // Navigation lists (for browsing)
  let navigation = {};
  if (depth === 1) {
    const subcategories = await Subcategory.find({ category: category._id })
      .sort({ name: 1 })
      .select("_id name slug category")
      .lean();
    navigation.subcategories = subcategories;
  } else if (depth === 2) {
    const childCategories = await ChildCategory.find({ subcategory: subcategory._id })
      .sort({ name: 1 })
      .select("_id name slug subcategory")
      .lean();
    navigation.childCategories = childCategories;
  }

  const locale = req.query.locale;
  if (locale && locale !== "en") {
    const catT = await applyTranslations(category, "Category", locale, ["name", "description", "title"]);
    resolved.category = catT;
    if (subcategory) {
      resolved.subcategory = await applyTranslations(subcategory, "Subcategory", locale, ["name", "description", "title"]);
    }
    if (childCategory) {
      resolved.childCategory = await applyTranslations(childCategory, "ChildCategory", locale, ["name", "description", "title"]);
    }
    if (navigation.subcategories) {
      navigation.subcategories = await applyTranslations(
        navigation.subcategories,
        "Subcategory",
        locale,
        ["name", "description", "title"]
      );
    }
    if (navigation.childCategories) {
      navigation.childCategories = await applyTranslations(navigation.childCategories, "ChildCategory", locale, ["name", "description", "title"]);
    }
  }

  const payload = {
    depth,
    category: resolved.category,
    subcategory: resolved.subcategory,
    childCategory: resolved.childCategory,
    breadcrumbs: buildBreadcrumbs({
      category: resolved.category,
      subcategory: resolved.subcategory,
      childCategory: resolved.childCategory,
    }),
    seo: buildSeoDefaults({
      depth,
      category: resolved.category,
      subcategory: resolved.subcategory,
      childCategory: resolved.childCategory,
    }),
    navigation,
  };

  return sendSuccessResponse(res, HTTP_STATUS.OK, "✅ Taxonomy resolved", payload);
});

exports.getTaxonomyProducts = asyncHandler(async (req, res) => {
  const rawCategorySlug = req.query.categorySlug;
  const rawSubSlug = req.query.subSlug;
  const rawChildSlug = req.query.childSlug;

  const categorySlug = toSlugSafe(rawCategorySlug);
  const subSlug = toSlugSafe(rawSubSlug);
  const childSlug = toSlugSafe(rawChildSlug);

  if (!categorySlug) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "categorySlug is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const resolved = await resolveHierarchy({ categorySlug, subSlug, childSlug });
  if (resolved.notFound) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Taxonomy not found",
      ERROR_CODES.RESOURCE_NOT_FOUND,
      { missing: resolved.notFound }
    );
  }

  const taxonomyScope = {};
  if (resolved.depth === 1) taxonomyScope.category = resolved.category._id;
  if (resolved.depth === 2) taxonomyScope.subcategory = resolved.subcategory._id;
  if (resolved.depth === 3) taxonomyScope.childCategory = resolved.childCategory._id;

  const result = await searchProducts(req.query, {
    taxonomyScope,
    paginationMode: "taxonomy",
  });

  return res.json(result);
});

/**
 * Catalogue price bounds for PLP range UI.
 * Optional slugs scope to category / subcategory / child; omit slugs for full catalogue.
 * Query: ?categorySlug=&subSlug=&childSlug= plus same storefront filters as products (except min/max price).
 * Returns: { minPrice: number|null, maxPrice: number|null }
 */
exports.getTaxonomyPriceBounds = asyncHandler(async (req, res) => {
  const categorySlug = toSlugSafe(req.query.categorySlug);
  const subSlug = toSlugSafe(req.query.subSlug);
  const childSlug = toSlugSafe(req.query.childSlug);

  let taxonomyScope = {};

  if (categorySlug) {
    const resolved = await resolveHierarchy({ categorySlug, subSlug, childSlug });
    if (resolved.notFound) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        "Taxonomy not found",
        ERROR_CODES.RESOURCE_NOT_FOUND,
        { missing: resolved.notFound }
      );
    }
    if (resolved.depth === 1) taxonomyScope.category = resolved.category._id;
    if (resolved.depth === 2) taxonomyScope.subcategory = resolved.subcategory._id;
    if (resolved.depth === 3) taxonomyScope.childCategory = resolved.childCategory._id;
  } else if (subSlug || childSlug) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "categorySlug is required when subSlug or childSlug is provided",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const bounds = await getCataloguePriceBounds(req.query, { taxonomyScope });
  return res.json(bounds);
});

exports.legacyLookup = asyncHandler(async (req, res) => {
  const raw = req.params.slug;
  if (!raw) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "slug is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const slug = String(raw).trim().toLowerCase();
  const nameRegex = buildNameRegex(slug);

  const [cat, subs, children] = await Promise.all([
    Category.findOne({ $or: [{ slug }, { name: nameRegex }] }).lean(),
    Subcategory.find({ $or: [{ slug }, { name: nameRegex }] }).lean(),
    ChildCategory.find({ $or: [{ slug }, { name: nameRegex }] }).lean(),
  ]);

  const matches = [];
  if (cat) {
    matches.push({
      type: "category",
      category: { _id: cat._id, name: cat.name, slug: cat.slug },
      canonicalPath: cat.slug ? computeCanonicalPath({ categorySlug: cat.slug }) : null,
    });
  }

  if (subs && subs.length > 0) {
    const categoryIds = Array.from(new Set(subs.map((s) => String(s.category)).filter(Boolean)));
    const cats = await Category.find({ _id: { $in: categoryIds } }).select("_id name slug").lean();
    const byId = new Map(cats.map((c) => [String(c._id), c]));

    subs.forEach((s) => {
      const parent = byId.get(String(s.category));
      matches.push({
        type: "subcategory",
        category: parent ? { _id: parent._id, name: parent.name, slug: parent.slug } : null,
        subcategory: { _id: s._id, name: s.name, slug: s.slug },
        canonicalPath:
          parent?.slug && s.slug ? computeCanonicalPath({ categorySlug: parent.slug, subSlug: s.slug }) : null,
      });
    });
  }

  if (children && children.length > 0) {
    const subIds = Array.from(new Set(children.map((c) => String(c.subcategory)).filter(Boolean)));
    const subs2 = await Subcategory.find({ _id: { $in: subIds } }).select("_id name slug category").lean();
    const catIds2 = Array.from(new Set(subs2.map((s) => String(s.category)).filter(Boolean)));
    const cats2 = await Category.find({ _id: { $in: catIds2 } }).select("_id name slug").lean();
    const subById = new Map(subs2.map((s) => [String(s._id), s]));
    const catById = new Map(cats2.map((c) => [String(c._id), c]));

    children.forEach((child) => {
      const parentSub = subById.get(String(child.subcategory));
      const parentCat = parentSub ? catById.get(String(parentSub.category)) : null;
      matches.push({
        type: "child",
        category: parentCat ? { _id: parentCat._id, name: parentCat.name, slug: parentCat.slug } : null,
        subcategory: parentSub ? { _id: parentSub._id, name: parentSub.name, slug: parentSub.slug } : null,
        childCategory: { _id: child._id, name: child.name, slug: child.slug } ,
        canonicalPath:
          parentCat?.slug && parentSub?.slug && child.slug
            ? computeCanonicalPath({
                categorySlug: parentCat.slug,
                subSlug: parentSub.slug,
                childSlug: child.slug,
              })
            : null,
      });
    });
  }

  // Choose a recommended canonical path only if uniquely resolvable.
  const validCanonical = matches.map((m) => m.canonicalPath).filter(Boolean);
  const uniqueCanonicals = Array.from(new Set(validCanonical));
  const recommendedCanonicalPath = uniqueCanonicals.length === 1 ? uniqueCanonicals[0] : null;

  return sendSuccessResponse(res, HTTP_STATUS.OK, "✅ Legacy taxonomy lookup", {
    slug,
    matches,
    recommendedCanonicalPath,
  });
});

