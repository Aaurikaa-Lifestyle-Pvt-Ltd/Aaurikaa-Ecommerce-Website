// backend/scripts/migrate-drafts.js
const mongoose = require("mongoose");
require("dotenv").config();
const Blog = require("../models/Blog");
const Product = require("../models/Product");

const migrate = async () => {
    try {
        console.log("🚀 Starting Draft Ownership Migration...");
        await mongoose.connect(process.env.MONGODB_URI);

        // 1. Migrate Blogs (Rename 'admin' to 'ownerUserId')
        console.log("📝 Migrating Blogs...");
        const blogResult = await Blog.updateMany(
            { admin: { $exists: true }, ownerUserId: { $exists: false } },
            [
                {
                    $set: {
                        ownerUserId: "$admin"
                    }
                },
                {
                    $unset: "admin"
                }
            ]
        );
        console.log(`✅ Blogs migrated: ${blogResult.modifiedCount}`);

        // 2. Migrate Products (Copy 'admin' or 'seller' to 'ownerUserId')
        console.log("📦 Migrating Products...");

        // First, products created by admins
        const adminProdResult = await Product.updateMany(
            { admin: { $exists: true }, ownerUserId: { $exists: false } },
            [
                {
                    $set: {
                        ownerUserId: "$admin"
                    }
                }
            ]
        );
        console.log(`✅ Admin products migrated: ${adminProdResult.modifiedCount}`);

        // Second, products created by sellers
        const sellerProdResult = await Product.updateMany(
            { seller: { $exists: true }, ownerUserId: { $exists: false } }, // admin takes precedence if both exist, but usually it's one or the other
            [
                {
                    $set: {
                        ownerUserId: "$seller"
                    }
                }
            ]
        );
        console.log(`✅ Seller products migrated: ${sellerProdResult.modifiedCount}`);

        console.log("🎉 Migration completed successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
};

migrate();
