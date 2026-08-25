/**
 * Backfill deliveredAt for historical delivered orders.
 *
 * After-Sales eligibility requires Order.deliveredAt for status=delivered orders.
 * This script is idempotent and only writes when deliveredAt is null/missing.
 *
 * Execution (from backend/):
 *   Dry-run (default, no writes):
 *     node scripts/backfill-order-delivered-at.js
 *   Apply (production write):
 *     node scripts/backfill-order-delivered-at.js --apply
 *
 * Requires MONGODB_URI (or MONGO_URI / MONGO_URL) in backend/.env or the environment.
 * Prefer dry-run first; confirm "Delivered orders requiring backfill" count before --apply.
 * Safe to re-run: conditional updates skip orders that already have deliveredAt.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const Order = require("../models/Order");
const Commission = require("../models/Commission");

const APPLY = process.argv.includes("--apply");

async function buildBackfillPlan(migrationTimestamp) {
  const orders = await Order.find({
    status: "delivered",
    $or: [{ deliveredAt: null }, { deliveredAt: { $exists: false } }],
  })
    .select("_id")
    .lean();

  const orderIds = orders.map((order) => order._id);
  const earliestCommissions =
    orderIds.length === 0
      ? []
      : await Commission.aggregate([
          { $match: { order: { $in: orderIds } } },
          { $group: { _id: "$order", deliveredAt: { $min: "$createdAt" } } },
        ]);

  const commissionDateByOrder = new Map(
    earliestCommissions.map((entry) => [String(entry._id), entry.deliveredAt])
  );

  return orders.map((order) => ({
    orderId: order._id,
    deliveredAt:
      commissionDateByOrder.get(String(order._id)) || migrationTimestamp,
    source: commissionDateByOrder.has(String(order._id))
      ? "earliest_commission"
      : "migration_timestamp",
  }));
}

async function applyBackfill(plan) {
  let updated = 0;
  let skipped = 0;

  for (const entry of plan) {
    const result = await Order.updateOne(
      {
        _id: entry.orderId,
        status: "delivered",
        $or: [{ deliveredAt: null }, { deliveredAt: { $exists: false } }],
      },
      { $set: { deliveredAt: entry.deliveredAt } }
    );

    if (result.modifiedCount === 1) updated += 1;
    else skipped += 1;
  }

  return { updated, skipped };
}

async function run() {
  const mongoUri =
    process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
  if (!mongoUri) {
    throw new Error(
      "MongoDB URI not found. Set MONGODB_URI, MONGO_URI, or MONGO_URL."
    );
  }

  const migrationTimestamp = new Date();
  await mongoose.connect(mongoUri);

  const plan = await buildBackfillPlan(migrationTimestamp);
  const sourceCounts = plan.reduce(
    (counts, entry) => {
      counts[entry.source] += 1;
      return counts;
    },
    { earliest_commission: 0, migration_timestamp: 0 }
  );

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Delivered orders requiring backfill: ${plan.length}`);
  console.log(
    `Source earliest commission: ${sourceCounts.earliest_commission}`
  );
  console.log(
    `Source migration timestamp: ${sourceCounts.migration_timestamp}`
  );

  if (!APPLY) {
    console.log("No records changed. Re-run with --apply to write the plan.");
    return;
  }

  const result = await applyBackfill(plan);
  const unresolved = await Order.countDocuments({
    status: "delivered",
    $or: [{ deliveredAt: null }, { deliveredAt: { $exists: false } }],
  });

  console.log(`Updated: ${result.updated}`);
  console.log(`Skipped by conditional write: ${result.skipped}`);
  console.log(`Post-run unresolved delivered orders: ${unresolved}`);

  if (unresolved !== 0) {
    throw new Error(
      `Backfill verification failed: ${unresolved} delivered orders remain unresolved.`
    );
  }
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error("Delivered-at backfill failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { buildBackfillPlan, applyBackfill, run };
