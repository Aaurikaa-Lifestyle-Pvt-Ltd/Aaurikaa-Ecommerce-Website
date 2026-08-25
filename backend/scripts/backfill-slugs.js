// backend/scripts/backfill-slugs.js
const mongoose = require("mongoose");
require("dotenv").config({ path: 'backend/.env' }); // Adjust path if needed
const Product = require("../models/Product");
const Blog = require("../models/Blog");
const slugify = require("slugify");

const backfill = async () => {
    try {
        console.log("🚀 Starting Slug Backfill...");
        await mongoose.connect(process.env.MONGODB_URI);

        // 1. Backfill Products
        console.log("📦 Backfilling Products...");
        const products = await Product.find({ slug: { $exists: false } });
        let productCount = 0;
        for (const product of products) {
            if (product.name) {
                let newSlug = slugify(product.name, { lower: true, strict: true });
                const slug = `${newSlug}-${Math.random().toString(36).substring(2, 7)}`;
                await Product.updateOne({ _id: product._id }, { $set: { slug: slug } });
                productCount++;
            }
        }
        console.log(`✅ Products backfilled: ${productCount}`);

        // 2. Backfill Blogs
        console.log("📝 Backfilling Blogs...");
        const blogs = await Blog.find({ slug: { $exists: false } });
        let blogCount = 0;
        for (const blog of blogs) {
            if (blog.title) {
                let newSlug = slugify(blog.title, { lower: true, strict: true });
                const slug = `${newSlug}-${Math.random().toString(36).substring(2, 7)}`;
                await Blog.updateOne({ _id: blog._id }, { $set: { slug: slug } });
                blogCount++;
            }
        }
        console.log(`✅ Blogs backfilled: ${blogCount}`);

        console.log("🎉 Backfill completed successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Backfill failed:", err);
        process.exit(1);
    }
};

backfill();
