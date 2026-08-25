#!/usr/bin/env node
/**
 * READ-ONLY: Fetch all products and report on "Untitled Draft" and status breakdown.
 * Use to investigate why some products (e.g. Untitled Draft) are not getting deleted.
 *
 * Usage (from backend folder):
 *   node scripts/fetch-all-products-readonly.js
 *   Uses MONGODB_URI from backend/.env
 *
 * Safety: Only read operations. No insert/update/delete.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Product = require("../models/Product");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Missing MONGODB_URI in backend/.env");
    process.exit(1);
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log("Connected. Running read-only product fetch...\n");

  // 1) Fetch ALL products (no status filter) - raw list
  const all = await Product.find({})
    .select("_id name sku status approvalStatus ownerUserId seller createdAt")
    .lean()
    .sort({ createdAt: -1 });

  const total = all.length;
  console.log("=== COUNTS BY STATUS ===");
  const byStatus = {};
  all.forEach((p) => {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  });
  Object.keys(byStatus)
    .sort()
    .forEach((s) => console.log(`  ${s}: ${byStatus[s]}`));
  console.log(`  TOTAL: ${total}\n`);

  // 2) Products named "Untitled Draft"
  const untitledDraft = all.filter(
    (p) => p.name && String(p.name).trim() === "Untitled Draft"
  );
  console.log('=== PRODUCTS NAMED "Untitled Draft" ===');
  console.log(`Count: ${untitledDraft.length}\n`);
  if (untitledDraft.length > 0) {
    untitledDraft.forEach((p, i) => {
      console.log(
        `${i + 1}. _id: ${p._id} | status: ${p.status} | approvalStatus: ${p.approvalStatus ?? "—"} | ownerUserId: ${p.ownerUserId ?? "—"} | seller: ${p.seller ?? "—"} | createdAt: ${p.createdAt}`
      );
    });
    console.log("");
  }

  // 3) Drafts that are NOT "Untitled Draft" (sample) - to see mix
  const drafts = all.filter((p) => p.status === "draft");
  const otherDrafts = drafts.filter(
    (p) => !p.name || String(p.name).trim() !== "Untitled Draft"
  );
  console.log("=== DRAFTS (non–Untitled Draft) sample (first 5) ===");
  otherDrafts.slice(0, 5).forEach((p, i) => {
    console.log(
      `${i + 1}. _id: ${p._id} | name: ${(p.name || "").slice(0, 40)} | status: ${p.status} | ownerUserId: ${p.ownerUserId ?? "—"} | seller: ${p.seller ?? "—"}`
    );
  });
  if (otherDrafts.length > 5) console.log(`  ... and ${otherDrafts.length - 5} more drafts.\n`);
  else console.log("");

  // 4) Trash count and sample
  const trash = all.filter((p) => p.status === "trash");
  console.log(`=== TRASH === Count: ${trash.length}`);
  if (trash.length > 0 && trash.length <= 10) {
    trash.forEach((p, i) => {
      console.log(
        `  ${i + 1}. _id: ${p._id} | name: ${(p.name || "").slice(0, 35)} | ownerUserId: ${p.ownerUserId ?? "—"}`
      );
    });
  } else if (trash.length > 10) {
    trash.slice(0, 5).forEach((p, i) => {
      console.log(
        `  ${i + 1}. _id: ${p._id} | name: ${(p.name || "").slice(0, 35)} | ownerUserId: ${p.ownerUserId ?? "—"}`
      );
    });
    console.log(`  ... and ${trash.length - 5} more in trash.`);
  }
  console.log("");

  // 5) Products with missing ownerUserId (cannot be trashed by anyone via current API)
  const noOwner = all.filter(
    (p) => p.ownerUserId == null || p.ownerUserId === undefined
  );
  console.log("=== PRODUCTS WITH MISSING ownerUserId (cannot be deleted via API) ===");
  console.log(`Count: ${noOwner.length}`);
  if (noOwner.length > 0) {
    noOwner.forEach((p, i) => {
      console.log(
        `  ${i + 1}. _id: ${p._id} | name: ${(p.name || "").slice(0, 40)} | status: ${p.status}`
      );
    });
    console.log("");
  }

  // 6) Reason check: admin delete/trash use ownerUserId
  console.log("=== WHY DELETE MAY NOT WORK (code logic) ===");
  console.log("1. Admin delete/trash: Product.findOne({ _id, ownerUserId: req.user._id }).");
  console.log("   -> Admin can only trash products they OWN. Seller-owned products return 404.");
  console.log("2. Seller delete/trash: same ownerUserId check for seller.");
  console.log("3. If ownerUserId is null/undefined, NO user can match -> product never trashed.\n");

  await mongoose.disconnect();
  console.log("Done. No data was modified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
