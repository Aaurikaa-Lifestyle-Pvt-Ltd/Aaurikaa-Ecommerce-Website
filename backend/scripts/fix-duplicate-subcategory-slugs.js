#!/usr/bin/env node
/**
 * Fix duplicate Subcategory slugs: choose canonical (most products), migrate products, delete duplicates.
 *
 * 🚨 BEFORE RUNNING:
 * 1. Create a full DB backup.
 * 2. Confirm production write window is approved.
 * 3. No destructive operations run without migration (products are reassigned, not removed).
 *
 * Usage:
 *   node scripts/fix-duplicate-subcategory-slugs.js [--dry-run]
 *   --dry-run  Log what would be done; no updates or deletes.
 * Uses: process.env.MONGODB_URI or process.env.MONGO_URI
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Subcategory = require("../models/Subcategory");
const Product = require("../models/Product");

const isDryRun = process.argv.includes("--dry-run");

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI or MONGO_URI before running.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to DB");
  if (isDryRun) {
    console.log("*** DRY RUN — no data will be modified ***\n");
  }

  const duplicates = await Subcategory.aggregate([
    { $match: { slug: { $ne: null, $ne: "" } } },
    {
      $group: {
        _id: "$slug",
        count: { $sum: 1 },
        ids: { $push: "$_id" },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (!duplicates.length) {
    console.log("No duplicate slugs found.");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Found ${duplicates.length} duplicate slug(s).`);

  for (const dup of duplicates) {
    console.log(`\nProcessing slug: ${dup._id}`);

    const records = await Subcategory.find({ slug: dup._id }).lean();

    // Choose canonical = one with most products
    let canonical = null;
    let maxProducts = -1;

    for (const record of records) {
      const count = await Product.countDocuments({
        subcategory: record._id,
      });

      if (count > maxProducts) {
        maxProducts = count;
        canonical = record;
      }
    }

    console.log(`Canonical ID: ${canonical._id} (${maxProducts} products) [categoryId: ${canonical.category}]`);

    for (const record of records) {
      if (record._id.equals(canonical._id)) {
        console.log(`  [keep] ${record._id}`);
        continue;
      }

      const toMigrate = await Product.countDocuments({
        subcategory: record._id,
      });

      if (isDryRun) {
        console.log(`  [would migrate] ${toMigrate} products from ${record._id} -> ${canonical._id}`);
        console.log(`  [would delete]  duplicate subcategory ${record._id}`);
      } else {
        const updated = await Product.updateMany(
          { subcategory: record._id },
          { $set: { subcategory: canonical._id } }
        );
        console.log(`Migrated ${updated.modifiedCount} products from ${record._id} -> ${canonical._id}`);

        await Subcategory.deleteOne({ _id: record._id });
        console.log(`Deleted duplicate subcategory ${record._id}`);
      }
    }
  }

  if (isDryRun) {
    console.log("\n*** DRY RUN complete. Run without --dry-run to apply changes. ***");
  } else {
    console.log("\nDuplicate cleanup completed.");
  }
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
