// Load environment variables first
require('dotenv').config();

// import paymentRoutes from "./routes/payment.js";

// ========= CORE MODULES ========= //
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");

// ========= SECURITY & LOGGING ========= //
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron");
const verifyPendingPayments = require("./jobs/paymentVerificationJob");

const app = express();

// ========= ENVIRONMENT MODE ========= //
const isProduction = process.env.NODE_ENV === 'production';

// Point L / After-Sales: refuse to boot production without RBAC
const {
  assertProductionPermissionEnforcement,
} = require("./config/permissionEnforcement");
const permissionBoot = assertProductionPermissionEnforcement();
if (!permissionBoot.ok) {
  console.error(permissionBoot.message);
  process.exit(1);
}

// ========= SECURITY MIDDLEWARE ========= //
if (isProduction) {
  // 🛡️ Strict Security Headers (Production)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // 🚦 Rate Limiter (Production only)
  const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // প্রতি মিনিটে 5 টা login attempt
    message: "⚠️ Too many login attempts. Please try again later.",
  });

  // Login routes এ limiter বসাও
  app.use("/api/shopper/login", loginLimiter);
  app.use("/api/seller/login", loginLimiter);
  app.use("/api/admin/login", loginLimiter);

  const enquiryLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: "Too many enquiry submissions. Please try again later.",
  });
  app.use("/api/enquiries", enquiryLimiter);

  const careerApplicationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: "Too many career application submissions. Please try again later.",
  });
  app.use("/api/career-applications", careerApplicationLimiter);
} else {
  console.log("⚡ Running in DEV mode (rate limiting & strict security disabled)");
}

// 📑 HTTP Request Logger (dev এ বেশি দরকার হয়)
app.use(morgan(isProduction ? "combined" : "dev"));

// ========= GENERAL MIDDLEWARES ========= //
// JSON body: 10MB limit for product backup restore only; 2MB for all other routes (CMS pages exceed default 100kb)
const JSON_IMPORT_PATHS = ["/api/seller/products/import-json", "/api/admin/products/import-json"];

app.use((req, res, next) => {
  if (req.method === "POST" && JSON_IMPORT_PATHS.some((p) => req.originalUrl.endsWith(p))) {
    return express.json({ limit: "10mb" })(req, res, next);
  }
  next();
});
app.use((req, res, next) => {
  if (req.method === "POST" && JSON_IMPORT_PATHS.some((p) => req.originalUrl.endsWith(p))) {
    return next();
  }
  return express.json({ limit: "2mb" })(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL]
    : (isProduction ? [] : ["http://localhost:3000", "http://localhost:3001"]); // Storefront + Admin in local dev

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);
app.use(cookieParser());

// ========= MODEL IMPORTS (Ensure schemas are registered) ========= //
require('./models'); // Load all models from index.js

// ========= MAINTENANCE MODE MIDDLEWARE ========= //
const maintenanceMode = require('./middleware/maintenanceMode');

// ========= ROUTE IMPORTS ========= //
const adminRoutes = require("./routes/adminRoutes");

// 📂 Static uploads (Admin / Seller / Public)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const adminProductRoutes = require("./routes/admin/productRoutes");
const adminSellerRoutes = require("./routes/admin/adminSellerRoutes");
const adminShopperRoutes = require("./routes/admin/shopperRoutes");
const adminOrderRoutes = require("./routes/adminOrderRoutes");
const adminReturnRoutes = require("./routes/adminReturnRoutes");
const adminPaymentRoutes = require("./routes/adminPaymentRoutes");
const adminSkuRuleRoutes = require("./routes/admin/skuRuleRoutes");
const adminLocationRoutes = require("./routes/admin/locationRoutes");
const offerRoutes = require("./routes/offerRoutes");
const variantRoutes = require("./routes/variantRoutes");
const couponRoutes = require("./routes/couponRoutes");
const sellerAuthRoutes = require("./routes/sellerAuthRoutes");
const sellerProductRoutes = require("./routes/seller/productRoutes");
const taxRoutes = require("./routes/admin/taxRoutes");
const publicProductRoutes = require("./routes/publicProductRoutes");
const publicSellerRoutes = require("./routes/publicSellerRoutes");
const orderRoutes = require("./routes/orderRoutes");
const shopperRoutes = require("./routes/shopperRoutes");
const shopperOrderRoutes = require("./routes/shopperOrderRoutes");
const shopperReturnRoutes = require("./routes/shopperReturnRoutes");
const shopperWalletRoutes = require("./routes/shopperWalletRoutes");
const stockNotificationRoutes = require("./routes/stockNotificationRoutes");
const adminStockNotificationRoutes = require("./routes/admin/stockNotificationRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const subcategoryRoutes = require("./routes/subcategoryRoutes");
const childCategoryRoutes = require("./routes/childCategoryRoutes"); // New import
const brandRoutes = require("./routes/brandRoutes");
const blogRoutes = require("./routes/blogRoutes");
const blogCategoryRoutes = require("./routes/blogCategoryRoutes");
const commentRoutes = require("./routes/commentRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const tagRoutes = require("./routes/tagRoutes");
const publicLocationRoutes = require("./routes/public/locationRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const sliderRoutes = require("./routes/sliderRoutes");
const taxonomyRoutes = require("./routes/taxonomyRoutes");
const globalSearchRoutes = require("./routes/globalSearchRoutes");

const bannerSettingsRoutes = require("./routes/bannerSettingsRoutes");
const homepageCategoryRoutes = require("./routes/admin/homepageCategoryRoutes");
const homepageBundleRoutes = require("./routes/homepageBundleRoutes");
const homepageGrid4x4Routes = require("./routes/homepageGrid4x4Routes");
const adminHomepageGrid4x4Routes = require("./routes/admin/homepageGrid4x4Routes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const addressRoutes = require("./routes/addressRoutes");
const commissionRoutes = require("./routes/commissionRoutes");
const sellerDashboardRoutes = require("./routes/sellerDashboardRoutes");
const sellerOrderRoutes = require("./routes/sellerOrderRoutes");
const sellerReturnRoutes = require("./routes/sellerReturnRoutes");
const sellerPayoutRoutes = require("./routes/sellerPayoutRoutes");
const sellerInventoryRoutes = require("./routes/sellerInventoryRoutes");
const pricingRoutes = require("./routes/pricingRoutes");
const bulkPricingRoutes = require("./routes/bulkPricingRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const cmsPageRoutes = require("./routes/cmsPageRoutes");
const adminCmsPageRoutes = require("./routes/admin/cmsPageRoutes");
const staticPageRoutes = require("./routes/staticPageRoutes");
const adminStaticPageRoutes = require("./routes/admin/staticPageRoutes");
const adminPayoutRoutes = require("./routes/admin/payoutRoutes");
const newsletterRoutes = require("./routes/newsletterRoutes");
const {
  spinShopperRoutes,
  spinAdminRoutes,
  spinPublicRoutes,
} = require("./routes/spinRoutes");
const upload = require("./middleware/uploadBanner"); // Import upload middleware
// const { saveBanner, getBanner } = require("./controllers/bannerController"); // Commented out: Old banner controller imports

// ========= MAINTENANCE MODE CHECK (Before all routes) ========= //
// Apply maintenance mode middleware - it handles its own bypasses internally
app.use(maintenanceMode);

// ========= ROUTE MOUNTING ========= //
app.use("/api/sliders", sliderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/admin/sellers", adminSellerRoutes);
app.use("/api/admin/shoppers", adminShopperRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/returns", adminReturnRoutes);
app.use("/api/admin/payment", adminPaymentRoutes);
app.use("/api/admin/sku-rules", adminSkuRuleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin/offers", offerRoutes);
app.use("/api/admin/variants", variantRoutes);
app.use("/api/admin/coupons", couponRoutes);
app.use("/api/admin/locations", adminLocationRoutes);
app.use("/api/admin/taxes", taxRoutes);
app.use("/api/admin/import-batches", require("./routes/admin/importBatchRoutes"));
app.use("/api/homepage-categories", homepageCategoryRoutes); // Moved this up
app.use("/api/homepage-bundle", homepageBundleRoutes);
app.use("/api/merchandising", require("./routes/merchandisingRoutes").merchandisingPublicRoutes);
app.use("/api/admin/merchandising", require("./routes/merchandisingRoutes").merchandisingAdminRoutes);
app.use("/api/seller", sellerAuthRoutes);
app.use("/api/seller/products", sellerProductRoutes);
app.use("/api/seller/dashboard", sellerDashboardRoutes);
app.use("/api/orders/seller", sellerOrderRoutes);
app.use("/api/seller/returns", sellerReturnRoutes);
app.use("/api/seller/payouts", sellerPayoutRoutes);
app.use("/api/seller/inventory", sellerInventoryRoutes);
app.use("/api/admin/shipping", require("./routes/admin/shippingRoutes"));
app.use("/api/admin/pickup-locations", require("./routes/admin/sellerPickupLocationRoutes"));
app.use("/api/admin/shiprocket-fulfillment", require("./routes/admin/orderShiprocketRoutes"));
app.use("/api/admin/translations", require("./routes/admin/translationRoutes"));
app.use("/api/shipping", require("./routes/shipping"));
// app.use("/api/banners", bannerRoutes);
app.use("/api/banner-settings", bannerSettingsRoutes);
app.use("/api/homepage/grid-4x4", homepageGrid4x4Routes);
app.use("/api/admin/homepage/grid-4x4", adminHomepageGrid4x4Routes);

app.use("/api/products", publicProductRoutes);
app.use("/api/search", globalSearchRoutes);
app.use("/api/sellers", publicSellerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/shopper", shopperRoutes);
app.use("/api/shopper/orders", shopperOrderRoutes);
app.use("/api/shopper/orders", shopperReturnRoutes);
app.use("/api/shopper/wallet", shopperWalletRoutes);
app.use("/api/shopper/stock-notifications", stockNotificationRoutes);
app.use("/api/admin/stock-notifications", adminStockNotificationRoutes);
app.use("/api/admin/inventory", require("./routes/admin/inventoryRoutes"));
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subcategoryRoutes);
app.use("/api/childcategories", childCategoryRoutes); // New mount
app.use("/api/brands", brandRoutes);
app.use("/api/key-feature-catalogue", require("./routes/keyFeatureCatalogueRoutes"));
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
app.use("/api/media", require("./routes/mediaRoutes"));
app.use("/api/cms/pages", cmsPageRoutes);
app.use("/api/admin/cms-pages", adminCmsPageRoutes);
app.use("/api/static-pages", staticPageRoutes);
app.use("/api/admin/static-pages", adminStaticPageRoutes);
app.use("/api/admin/payouts", adminPayoutRoutes);

app.use("/api/newsletter", newsletterRoutes);
app.use("/api/spin", spinPublicRoutes);
app.use("/api/shopper/spin", spinShopperRoutes);
app.use("/api/admin/spin-campaigns", spinAdminRoutes);
app.use("/api/enquiries", require("./routes/customerEnquiryRoutes"));
app.use("/api/shopper/enquiries", require("./routes/shopperEnquiryRoutes"));
app.use("/api/admin/enquiries", require("./routes/admin/customerEnquiryRoutes"));
app.use("/api/admin/careers", require("./routes/admin/careerRoutes"));
app.use("/api/admin/career-applications", require("./routes/admin/careerApplicationRoutes"));
app.use("/api/careers", require("./routes/careerRoutes"));
app.use("/api/career-applications", require("./routes/careerApplicationRoutes"));
app.use("/api/settings/shop-sidebar", require("./routes/shopSidebarSettingsRoutes"));

// Shared
app.use("/api/variants", variantRoutes);

// ========= CENTRALIZED ERROR HANDLING ========= //
const { errorHandler, sendErrorResponse, HTTP_STATUS, ERROR_CODES } = require('./utils/errorHandler');

// 404 Handler - Route not found
app.use((req, res, next) => {
  return sendErrorResponse(
    res,
    HTTP_STATUS.NOT_FOUND,
    "Route not found",
    ERROR_CODES.RESOURCE_NOT_FOUND,
    { path: req.path }
  );
});

// Global error handler - Must be last middleware
app.use(errorHandler);

// ========= LOGGING ========= //
console.log(
  "✅ Email Credentials:",
  process.env.MAIL_USER || "Not set",
  process.env.MAIL_PASS ? "✅" : "❌"
);

// ========= DATABASE CONNECTION ========= //
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10, // Performance optimization: Increase connection pool for production load
  })
  .then(async () => {
    console.log("✅ MongoDB connected successfully.");

    try {
      const { bootstrapAaurikaaFoundation } = require("./services/aaurikaaFoundationService");
      const foundation = await bootstrapAaurikaaFoundation();
      if (!foundation.skipped) {
        console.log("✅ AAURIKAA foundation identity ready (internal seller + default pickup).");
      }
    } catch (foundationErr) {
      console.error("⚠️ AAURIKAA foundation bootstrap failed:", foundationErr.message);
    }

    app.listen(process.env.PORT || 5000, () => {
      console.log(`🚀 Server running at: http://localhost:${process.env.PORT || 5000}`);

      const phonePeService = require("./services/phonePeService");
      if (phonePeService.isV2Enabled()) {
        console.log("✅ PhonePe V2 mode enabled");
      } else {
        console.warn("⚠️ PhonePe V2 not configured — set PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, PHONEPE_CLIENT_VERSION");
      }

      // Start Shiprocket Polling Job (SRS 6.3)
      const fulfillmentService = require('./services/orderFulfillmentService');
      const reverseLogisticsService = require('./services/reverseLogisticsService');
      setInterval(() => {
        fulfillmentService.pollTrackingUpdates();
        reverseLogisticsService.pollReturnTrackingUpdates();
      }, 15 * 60 * 1000); // 15 mins

      // PhonePe pending-payment reconciliation (no-webhook fallback; min interval 10 min)
      if (process.env.DISABLE_PAYMENT_VERIFICATION_CRON !== "true") {
        cron.schedule("*/10 * * * *", async () => {
          console.log("Running payment verification cron...");
          try {
            await verifyPendingPayments();
          } catch (e) {
            console.error("Payment verification cron error:", e.message);
          }
        });
      }

      // After-Sales SLA reminder + admin escalation (env-driven intervals)
      if (process.env.DISABLE_AFTER_SALES_SLA_CRON !== "true") {
        const afterSalesSlaService = require("./services/afterSalesSlaService");
        const slaCronExpr = process.env.AFTER_SALES_SLA_CRON || "*/15 * * * *";
        cron.schedule(slaCronExpr, async () => {
          console.log("Running after-sales SLA cron...");
          try {
            const result = await afterSalesSlaService.runAfterSalesSlaJobs();
            if (!result.skipped) {
              console.log(
                `After-sales SLA: reminders=${result.reminders?.sent || 0}, escalations=${result.escalations?.sent || 0}`
              );
            }
          } catch (e) {
            console.error("After-sales SLA cron error:", e.message);
          }
        });
      }
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });
