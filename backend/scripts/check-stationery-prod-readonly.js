#!/usr/bin/env node
/**
 * Read-only production diagnostic for category/subcategory product visibility.
 *
 * Usage:
 *   node scripts/check-stationery-prod-readonly.js [--uri "<mongodb-uri>"] [--category "stationery"]
 *   Uses MONGODB_URI from .env if --uri not passed.
 *
 * Safety:
 * - This script only performs read queries.
 * - No insert/update/delete operations are used.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const ChildCategory = require("../models/ChildCategory");
const Product = require("../models/Product");

function getArg(flag, fallback = "") {
  const idx = process.argv.findIndex((a) => a === flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function countPublishedApproved(filter) {
  return Product.countDocuments({
    ...filter,
    status: "published",
    approvalStatus: "approved",
  });
}

async function resolveRouteFilterBySlug(rawSlug) {
  const slug = String(rawSlug || "").toLowerCase();
  const escapedSlug = escapeRegExp(slug);
  const nameRegexPattern = `^${escapedSlug.replace(/-/g, "[- ]")}$`;
  const nameRegex = new RegExp(nameRegexPattern, "i");

  const [cat, sub, child] = await Promise.all([
    Category.findOne({ $or: [{ slug }, { name: nameRegex }] }).lean(),
    Subcategory.findOne({ $or: [{ slug }, { name: nameRegex }] }).lean(),
    ChildCategory.findOne({ $or: [{ slug }, { name: nameRegex }] }).lean(),
  ]);

  if (cat) return { matchType: "category", filter: { category: cat._id }, matched: cat };
  if (sub) return { matchType: "subcategory", filter: { subcategory: sub._id }, matched: sub };
  if (child) return { matchType: "childCategory", filter: { childCategory: child._id }, matched: child };
  return { matchType: "none", filter: null, matched: null };
}

async function main() {
  const uri = getArg("--uri", process.env.MONGODB_URI || "");
  const categoryQuery = getArg("--category", "stationery");
  const sampleLimit = Number(getArg("--sample", "5")) || 5;

  if (!uri) {
    console.error("Missing MongoDB URI. Pass --uri or set MONGODB_URI.");
    process.exit(1);
  }

  const categorySlug = slugify(categoryQuery);
  const categoryNameRegex = new RegExp(`^${escapeRegExp(categoryQuery)}$`, "i");

  await mongoose.connect(uri, {
    readPreference: "secondaryPreferred",
    retryWrites: false,
    serverSelectionTimeoutMS: 15000,
  });

  console.log("Connected. Running read-only diagnostics...\n");

  const categories = await Category.find({
    $or: [{ slug: categorySlug }, { name: categoryNameRegex }],
  })
    .select("_id name slug showInMegaMenu megaMenuOrder")
    .lean();

  if (!categories.length) {
    console.log(`No category found for query: "${categoryQuery}" (slug "${categorySlug}")`);
    await mongoose.disconnect();
    return;
  }

  for (const category of categories) {
    console.log(`Category: ${category.name} (${category.slug || "no-slug"})`);
    console.log(`- id: ${category._id}`);
    console.log(`- showInMegaMenu: ${Boolean(category.showInMegaMenu)}`);

    const categoryCount = await countPublishedApproved({ category: category._id });
    console.log(`- published+approved products (category match): ${categoryCount}`);

    const subs = await Subcategory.find({ category: category._id })
      .select("_id name slug")
      .sort({ name: 1 })
      .lean();
    console.log(`- subcategories: ${subs.length}`);

    for (const sub of subs) {
      const children = await ChildCategory.find({ subcategory: sub._id })
        .select("_id name slug")
        .sort({ name: 1 })
        .lean();
      const childIds = children.map((c) => c._id);

      const [directSubCount, childOnlyCount, combinedCount] = await Promise.all([
        countPublishedApproved({ subcategory: sub._id }),
        childIds.length ? countPublishedApproved({ childCategory: { $in: childIds } }) : 0,
        childIds.length
          ? Product.countDocuments({
              status: "published",
              approvalStatus: "approved",
              $or: [{ subcategory: sub._id }, { childCategory: { $in: childIds } }],
            })
          : countPublishedApproved({ subcategory: sub._id }),
      ]);

      const routeSlug = sub.slug || slugify(sub.name);
      const routeResolution = await resolveRouteFilterBySlug(routeSlug);
      const routeCount = routeResolution.filter
        ? await countPublishedApproved(routeResolution.filter)
        : 0;

      console.log(`  Subcategory: ${sub.name} (${sub.slug || "no-slug"})`);
      console.log(`  - id: ${sub._id}`);
      console.log(`  - child categories: ${children.length}`);
      console.log(`  - direct subcategory products: ${directSubCount}`);
      console.log(`  - products in child categories: ${childOnlyCount}`);
      console.log(`  - expected combined (sub + children): ${combinedCount}`);
      console.log(`  - route slug checked: ${routeSlug}`);
      console.log(`  - route matched as: ${routeResolution.matchType}`);
      if (routeResolution.matched) {
        console.log(`  - route matched id: ${routeResolution.matched._id}`);
      }
      console.log(`  - current route /api/products/category/:slug result: ${routeCount}`);

      if (combinedCount > routeCount) {
        console.log(
          "  ! mismatch: current route undercounts vs expected combined subcategory+children"
        );
      }

      const sampleProducts = await Product.find({
        status: "published",
        approvalStatus: "approved",
        $or: [{ subcategory: sub._id }, ...(childIds.length ? [{ childCategory: { $in: childIds } }] : [])],
      })
        .select("name sku subcategory childCategory")
        .limit(sampleLimit)
        .lean();
      if (sampleProducts.length) {
        console.log(`  - sample products (${sampleProducts.length}):`);
        for (const p of sampleProducts) {
          console.log(`    • ${p.name} [${p.sku}]`);
        }
      }
      console.log("");
    }

    const dupSlugAgg = await Subcategory.aggregate([
      { $match: { category: category._id, slug: { $ne: null } } },
      { $group: { _id: "$slug", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);
    if (dupSlugAgg.length) {
      console.log("Duplicate subcategory slugs inside this category:");
      for (const d of dupSlugAgg) {
        console.log(`- ${d._id}: ${d.count} entries (${d.ids.join(", ")})`);
      }
      console.log("");
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch(async (err) => {
  console.error("Diagnostic failed:", err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect error
  }
  process.exit(1);
});
