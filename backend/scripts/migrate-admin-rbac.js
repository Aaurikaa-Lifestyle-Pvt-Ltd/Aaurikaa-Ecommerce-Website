#!/usr/bin/env node

/**
 * RBAC Phase 1 migration — upgrade existing Admin documents with PBAC fields.
 * Idempotent: only sets fields where missing; legacy admins become Super Admin.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("../models/Admin");

const migrate = async () => {
  try {
    console.log("🚀 Starting Admin RBAC migration...");
    await mongoose.connect(process.env.MONGODB_URI);

    const legacySuperAdmin = await Admin.updateMany(
      { isSuperAdmin: { $exists: false } },
      { $set: { isSuperAdmin: true } }
    );
    console.log(`✅ Legacy admins promoted to Super Admin: ${legacySuperAdmin.modifiedCount}`);

    const permissionsDefault = await Admin.updateMany(
      { permissions: { $exists: false } },
      { $set: { permissions: [] } }
    );
    console.log(`✅ permissions[] defaulted: ${permissionsDefault.modifiedCount}`);

    const tokenVersionDefault = await Admin.updateMany(
      { tokenVersion: { $exists: false } },
      { $set: { tokenVersion: 0 } }
    );
    console.log(`✅ tokenVersion defaulted: ${tokenVersionDefault.modifiedCount}`);

    const isActiveDefault = await Admin.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    );
    console.log(`✅ isActive defaulted: ${isActiveDefault.modifiedCount}`);

    const total = await Admin.countDocuments();
    console.log(`📊 Total admin documents: ${total}`);
    console.log("🎉 Admin RBAC migration completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
};

migrate();
