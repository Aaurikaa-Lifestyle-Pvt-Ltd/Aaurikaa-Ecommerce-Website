/**
 * Idempotent migration: align Product.ownerUserId with Product.seller
 * when ownerUserId points at a different Seller (dual-seller ownership bug).
 *
 * Does NOT change products where ownerUserId is an Admin (admin-created products).
 * Those remain a separate assessment — sellers manage them via Product.seller.
 *
 * Usage:
 *   node scripts/migrate-product-seller-ownership.js           # apply
 *   node scripts/migrate-product-seller-ownership.js --dry-run # report only
 */
const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("../models/Product");
const Seller = require("../models/Seller");

const dryRun = process.argv.includes("--dry-run");

async function migrate() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(dryRun ? "🔍 DRY RUN — no writes" : "🚀 Applying ownership sync");

  const mismatched = await Product.find({
    seller: { $exists: true, $ne: null },
    ownerUserId: { $exists: true, $ne: null },
    $expr: { $ne: ["$seller", "$ownerUserId"] },
  })
    .select("_id name sku seller ownerUserId sellerShop status")
    .lean();

  console.log(`Found ${mismatched.length} product(s) with seller ≠ ownerUserId`);

  let dualSellerCandidates = 0;
  let adminOwnedSkipped = 0;
  let updated = 0;
  let alreadyAligned = 0;

  for (const p of mismatched) {
    const ownerIsSeller = await Seller.exists({ _id: p.ownerUserId });
    if (!ownerIsSeller) {
      adminOwnedSkipped += 1;
      console.log(
        `SKIP (ownerUserId not a Seller — likely admin): ${p._id} sku=${p.sku}`
      );
      continue;
    }

    dualSellerCandidates += 1;
    const targetOwner = p.seller;
    console.log(
      `${dryRun ? "WOULD UPDATE" : "UPDATE"} ${p._id} sku=${p.sku} ` +
        `ownerUserId ${p.ownerUserId} → ${targetOwner}`
    );

    if (dryRun) continue;

    const result = await Product.updateOne(
      {
        _id: p._id,
        seller: p.seller,
        // Idempotent: only write when still mismatched
        ownerUserId: { $ne: p.seller },
      },
      { $set: { ownerUserId: targetOwner } }
    );

    if (result.modifiedCount === 1) updated += 1;
    else alreadyAligned += 1;
  }

  console.log("---");
  console.log(`Dual-seller candidates (ownerUserId is Seller): ${dualSellerCandidates}`);
  console.log(`Skipped (ownerUserId not Seller / admin-created): ${adminOwnedSkipped}`);
  if (!dryRun) {
    console.log(`Updated: ${updated}`);
    console.log(`No-op (already aligned during run): ${alreadyAligned}`);
  }

  await mongoose.disconnect();
  console.log("✅ Done");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
