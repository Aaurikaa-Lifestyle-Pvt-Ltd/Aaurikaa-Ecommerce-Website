// backend/tests/helpers/testApp.js
// Test helper to create app instance for testing without starting the server
require('dotenv').config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const app = express();

// Environment mode
const isProduction = process.env.NODE_ENV === 'production';

// Security middleware (disabled in test mode)
if (isProduction) {
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: "⚠️ Too many login attempts. Please try again later.",
  });

  app.use("/api/shopper/login", loginLimiter);
  app.use("/api/seller/login", loginLimiter);
  app.use("/api/admin/login", loginLimiter);
}

// HTTP Request Logger (disabled in test mode)
if (!process.env.JEST_WORKER_ID) {
  app.use(morgan(isProduction ? "combined" : "dev"));
}

// General middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));

// Model imports
require('../../models');

// Mock authentication middleware for testing
// This will be handled in test files by setting up the user

// Routes - matching server.js structure
const adminRoutes = require("../../routes/adminRoutes");
const adminProductRoutes = require("../../routes/admin/productRoutes");
const adminSellerRoutes = require("../../routes/admin/adminSellerRoutes");
const adminShopperRoutes = require("../../routes/admin/shopperRoutes");
const adminOrderRoutes = require("../../routes/adminOrderRoutes");
const adminLocationRoutes = require("../../routes/admin/locationRoutes");
const offerRoutes = require("../../routes/offerRoutes");
const variantRoutes = require("../../routes/variantRoutes");
const couponRoutes = require("../../routes/couponRoutes");
const sellerAuthRoutes = require("../../routes/sellerAuthRoutes");
const sellerProductRoutes = require("../../routes/seller/productRoutes");
const taxRoutes = require("../../routes/admin/taxRoutes");
const publicProductRoutes = require("../../routes/publicProductRoutes");
const publicSellerRoutes = require("../../routes/publicSellerRoutes");
const orderRoutes = require("../../routes/orderRoutes");
const shopperRoutes = require("../../routes/shopperRoutes");
const shopperOrderRoutes = require("../../routes/shopperOrderRoutes");
const stockNotificationRoutes = require("../../routes/stockNotificationRoutes");
const adminStockNotificationRoutes = require("../../routes/admin/stockNotificationRoutes");
const categoryRoutes = require("../../routes/categoryRoutes");
const subcategoryRoutes = require("../../routes/subcategoryRoutes");
const childCategoryRoutes = require("../../routes/childCategoryRoutes");
const brandRoutes = require("../../routes/brandRoutes");
const blogRoutes = require("../../routes/blogRoutes");
const blogCategoryRoutes = require("../../routes/blogCategoryRoutes");
const commentRoutes = require("../../routes/commentRoutes");
const settingsRoutes = require("../../routes/settingsRoutes");
const tagRoutes = require("../../routes/tagRoutes");
const publicLocationRoutes = require("../../routes/public/locationRoutes");
const paymentRoutes = require("../../routes/paymentRoutes");
const sliderRoutes = require("../../routes/sliderRoutes");
const taxonomyRoutes = require("../../routes/taxonomyRoutes");
const globalSearchRoutes = require("../../routes/globalSearchRoutes");
const bannerSettingsRoutes = require("../../routes/bannerSettingsRoutes");
const homepageCategoryRoutes = require("../../routes/admin/homepageCategoryRoutes");
const homepageGrid4x4Routes = require("../../routes/homepageGrid4x4Routes");
const adminHomepageGrid4x4Routes = require("../../routes/admin/homepageGrid4x4Routes");
const dashboardRoutes = require("../../routes/dashboardRoutes");
const addressRoutes = require("../../routes/addressRoutes");
const commissionRoutes = require("../../routes/commissionRoutes");
const sellerDashboardRoutes = require("../../routes/sellerDashboardRoutes");
const sellerOrderRoutes = require("../../routes/sellerOrderRoutes");
const sellerPayoutRoutes = require("../../routes/sellerPayoutRoutes");
const adminPayoutRoutes = require("../../routes/admin/payoutRoutes");
const sellerInventoryRoutes = require("../../routes/sellerInventoryRoutes");
const pricingRoutes = require("../../routes/pricingRoutes");
const bulkPricingRoutes = require("../../routes/bulkPricingRoutes");
const reviewRoutes = require("../../routes/reviewRoutes");
const homepageBundleRoutes = require("../../routes/homepageBundleRoutes");
const {
  spinShopperRoutes,
  spinAdminRoutes,
  spinPublicRoutes,
} = require("../../routes/spinRoutes");

// Route mounting
app.use("/api/sliders", sliderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/admin/sellers", adminSellerRoutes);
app.use("/api/admin/shoppers", adminShopperRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin/offers", offerRoutes);
app.use("/api/admin/variants", variantRoutes);
app.use("/api/admin/coupons", couponRoutes);
app.use("/api/admin/locations", adminLocationRoutes);
app.use("/api/admin/taxes", taxRoutes);
app.use("/api/homepage-categories", homepageCategoryRoutes);
app.use("/api/seller", sellerAuthRoutes);
app.use("/api/seller/products", sellerProductRoutes);
app.use("/api/seller/dashboard", sellerDashboardRoutes);
app.use("/api/orders/seller", sellerOrderRoutes);
app.use("/api/seller/payouts", sellerPayoutRoutes);
app.use("/api/admin/payouts", adminPayoutRoutes);
app.use("/api/seller/inventory", sellerInventoryRoutes);
app.use("/api/admin/shipping", require("../../routes/admin/shippingRoutes"));
app.use("/api/shipping", require("../../routes/shipping"));
app.use("/api/banner-settings", bannerSettingsRoutes);
app.use("/api/homepage/grid-4x4", homepageGrid4x4Routes);
app.use("/api/homepage-bundle", homepageBundleRoutes);
app.use("/api/merchandising", require("../../routes/merchandisingRoutes").merchandisingPublicRoutes);
app.use("/api/admin/merchandising", require("../../routes/merchandisingRoutes").merchandisingAdminRoutes);
app.use("/api/admin/homepage/grid-4x4", adminHomepageGrid4x4Routes);
app.use("/api/products", publicProductRoutes);
app.use("/api/search", globalSearchRoutes);
app.use("/api/sellers", publicSellerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/shopper", shopperRoutes);
app.use("/api/shopper/orders", shopperOrderRoutes);
app.use("/api/shopper/stock-notifications", stockNotificationRoutes);
app.use("/api/admin/stock-notifications", adminStockNotificationRoutes);
app.use("/api/admin/inventory", require("../../routes/admin/inventoryRoutes"));
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subcategoryRoutes);
app.use("/api/childcategories", childCategoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/blog-categories", blogCategoryRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/taxonomy", taxonomyRoutes);
app.use("/api/public/locations", publicLocationRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/commissions", commissionRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/bulk-pricing", bulkPricingRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/enquiries", require("../../routes/customerEnquiryRoutes"));
app.use("/api/shopper/enquiries", require("../../routes/shopperEnquiryRoutes"));
app.use("/api/admin/enquiries", require("../../routes/admin/customerEnquiryRoutes"));
app.use("/api/admin/careers", require("../../routes/admin/careerRoutes"));
app.use("/api/admin/career-applications", require("../../routes/admin/careerApplicationRoutes"));
app.use("/api/careers", require("../../routes/careerRoutes"));
app.use("/api/career-applications", require("../../routes/careerApplicationRoutes"));
app.use("/api/variants", variantRoutes);
app.use("/api/spin", spinPublicRoutes);
app.use("/api/shopper/spin", spinShopperRoutes);
app.use("/api/admin/spin-campaigns", spinAdminRoutes);

// Fallback handlers
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err : {},
  });
});

// Export app for testing
module.exports = app;

