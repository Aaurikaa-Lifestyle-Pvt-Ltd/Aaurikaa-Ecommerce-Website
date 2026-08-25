const express = require("express");
const router = express.Router();
const verifyAdmin = require("../middleware/verifyAdmin");
const loadAdminContext = require("../middleware/loadAdminContext");
const requirePermission = require("../middleware/requirePermission");
const requireSuperAdmin = require("../middleware/requireSuperAdmin");
const { withAdminAuth } = require("../utils/adminAuthChain");
const adminDocsUpload = require("../middleware/adminDocsUpload");
const FeaturedCategory = require("../models/FeaturedCategory"); // Assuming the model is in this path
const {
  sendErrorResponse,
  ERROR_MESSAGES,
  ERROR_CODES,
  HTTP_STATUS,
} = require("../utils/errorHandler");

const {
  sendAdminPasswordResetOTP,
  resetAdminPasswordWithOTP,
  loginAdmin,
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
} = require("../controllers/adminController");
const {
  listStaffUsers,
  createStaffUser,
  updateStaffUser,
  getPermissionCatalog,
} = require("../controllers/adminUserController");
const settingsController = require("../controllers/settingsController");

const restrictPublicRegistration = (_req, res) =>
  sendErrorResponse(
    res,
    HTTP_STATUS.FORBIDDEN,
    ERROR_MESSAGES.OPERATION_NOT_ALLOWED,
    ERROR_CODES.AUTH_ACCESS_DENIED
  );

// ===============================
// 🧾 Admin Auth Routes
// ===============================

// Public admin registration disabled — staff accounts created by Super Admin only
router.post(
  "/register",
  restrictPublicRegistration
);

router.post(
  "/verify-registration",
  restrictPublicRegistration
);

// ✅ Login Admin
router.post("/login", express.json(), loginAdmin);

// 📨 Send Admin Password Reset OTP
router.post("/send-password-reset-otp", express.json(), sendAdminPasswordResetOTP);

// 🔐 Reset Admin Password via OTP
router.post("/reset-password", express.json(), resetAdminPasswordWithOTP);

// ✅ Get Admin Profile (Protected)
router.get("/me", verifyAdmin, loadAdminContext, getAdminProfile);

// ✅ Update Admin Profile (Protected + with image)
router.put(
  "/update",
  verifyAdmin,
  loadAdminContext,
  adminDocsUpload.upload,
  adminDocsUpload.handleUploadError, // expects updated image
  updateAdminProfile
);

// 🔐 Change Admin Password (Protected, self-service)
router.put(
  "/change-password",
  verifyAdmin,
  loadAdminContext,
  express.json(),
  changeAdminPassword
);

// ===============================
// 👥 Admin Staff Management (Super Admin only)
// ===============================
const superAdminChain = [
  verifyAdmin,
  loadAdminContext,
  requirePermission("admin_users", "manage"),
  requireSuperAdmin,
];

router.get("/permissions/catalog", ...superAdminChain, getPermissionCatalog);
router.get("/users", ...superAdminChain, listStaffUsers);
router.post("/users", ...superAdminChain, express.json(), createStaffUser);
router.patch("/users/:id", ...superAdminChain, express.json(), updateStaffUser);

// ===============================
// 🏠 Featured Categories Routes
// ===============================

// ✅ Save Featured Categories (Protected)
router.post("/featured-categories", ...withAdminAuth("homepage", "manage"), express.json(), async (req, res) => {
  try {
    const { categoryIds } = req.body;

    // Check if FeaturedCategory document exists
    let featuredCategory = await FeaturedCategory.findOne({});

    // If it doesn't exist, create it
    if (!featuredCategory) {
      featuredCategory = new FeaturedCategory({ categoryIds: [] });
    }

    // Update the categoryIds
    featuredCategory.categoryIds = categoryIds;
    await featuredCategory.save();

    res.status(200).json({ message: "Featured categories saved successfully!" });
  } catch (error) {
    console.error("Error saving featured categories:", error);
    res.status(500).json({ message: "Error saving featured categories." });
  }
});

// ===============================
// 🎞 Homepage Media Settings Routes
// ===============================
router.get("/settings/homepageMedia", ...withAdminAuth("homepage", "view"), settingsController.getHomepageMedia);
router.post("/settings/homepageMedia", ...withAdminAuth("homepage", "manage"), express.json(), settingsController.updateHomepageMedia);

module.exports = router;
