/**
 * Seed a local Super Admin account (idempotent).
 *
 * Usage:
 *   npm run seed:admin
 *   node scripts/seed-admin.js --reset   (update password if the user already exists)
 *
 * Optional env:
 *   SEED_ADMIN_NAME, SEED_ADMIN_USERNAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD
 */
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Admin = require("../models/Admin");
const { isValidAdminPassword } = require("../utils/adminPasswordPolicy");

const resetPassword = process.argv.includes("--reset");

const seed = {
  name: process.env.SEED_ADMIN_NAME || "Super Admin",
  username: (process.env.SEED_ADMIN_USERNAME || "admin").toLowerCase(),
  email: (process.env.SEED_ADMIN_EMAIL || "admin@aaurikaa.local").toLowerCase(),
  phone: process.env.SEED_ADMIN_PHONE || "+1234567890",
  password: process.env.SEED_ADMIN_PASSWORD || "Admin@123456",
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  if (!isValidAdminPassword(seed.password)) {
    console.error(
      "SEED_ADMIN_PASSWORD must include uppercase, lowercase, number, and special character (@$!%*?&)."
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const existing = await Admin.findOne({
    $or: [{ email: seed.email }, { username: seed.username }],
  });

  if (existing) {
    if (resetPassword) {
      existing.password = seed.password;
      existing.isSuperAdmin = true;
      existing.isActive = true;
      existing.role = "admin";
      existing.loginAttempts = 0;
      existing.lockUntil = undefined;
      await existing.save();
      console.log("Updated existing admin password and Super Admin flags.");
    } else {
      console.log("Admin already exists, skipping (pass --reset to update password).");
    }
    console.log(`   Username: ${existing.username}`);
    console.log(`   Email: ${existing.email}`);
    if (resetPassword) {
      console.log(`   Password: ${seed.password}`);
    }
  } else {
    const admin = new Admin({
      name: seed.name,
      username: seed.username,
      email: seed.email,
      phone: seed.phone,
      password: seed.password,
      role: "admin",
      isSuperAdmin: true,
      permissions: [],
      tokenVersion: 0,
      isActive: true,
    });
    await admin.save();
    console.log("Created Super Admin.");
    console.log(`   Username: ${seed.username}`);
    console.log(`   Email: ${seed.email}`);
    console.log(`   Password: ${seed.password}`);
  }

  console.log("Development only — change this password before any non-local use.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
