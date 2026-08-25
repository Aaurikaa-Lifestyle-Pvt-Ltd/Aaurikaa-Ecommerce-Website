const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");
const { upload, handleUploadError } = require("../middleware/uploadSingle");
const { r2Uploads, handleUploadError: handleR2UploadError } = require("../middleware/secureUpload");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../utils/adminAuthChain");

const adminSettingsView = [verifyAdmin, loadAdminContext, requirePermission("site_settings", "view")];
const adminSettingsManage = [verifyAdmin, loadAdminContext, requirePermission("site_settings", "manage")];

router.get("/contact-info", ...adminSettingsView, settingsController.getContactInfo);
router.put("/contact-info", ...adminSettingsManage, settingsController.updateContactInfo);

router.get("/favicon", settingsController.getFavicon);
router.put("/favicon", ...adminSettingsManage, upload, handleUploadError, settingsController.updateFavicon);

router.get("/social", settingsController.getSocialLinks);
router.put("/social", ...adminSettingsManage, settingsController.updateSocialLinks);

router.get("/seo", settingsController.getSeoTags);
router.put("/seo", ...adminSettingsManage, settingsController.updateSeoTags);

router.get("/scripts", settingsController.getScripts);
router.put("/scripts", ...adminSettingsManage, settingsController.updateScripts);

router.get("/colors", settingsController.getColors);
router.put("/colors", ...adminSettingsManage, settingsController.updateColors);

router.get("/footer", settingsController.getFooter);
router.put("/footer", ...adminSettingsManage, settingsController.updateFooter);

router.get("/header", settingsController.getHeader);
router.put("/header", ...adminSettingsManage, settingsController.updateHeader);

router.get("/site", settingsController.getSite);
router.put(
  "/site",
  ...adminSettingsManage,
  r2Uploads.siteSettings(),
  handleR2UploadError,
  settingsController.updateSite
);

router.get("/maintenance", settingsController.getMaintenanceMode);
router.put("/maintenance", ...adminSettingsManage, settingsController.updateMaintenanceMode);

router.get("/newsletter", ...adminSettingsView, settingsController.getNewsletterSettings);
router.put("/newsletter", ...adminSettingsManage, settingsController.updateNewsletterSettings);

router.get("/enquiry-notification", ...adminSettingsView, settingsController.getEnquiryNotificationEmail);
router.put("/enquiry-notification", ...adminSettingsManage, settingsController.updateEnquiryNotificationEmail);

router.get("/career-notification", ...adminSettingsView, settingsController.getCareerNotificationEmail);
router.put("/career-notification", ...adminSettingsManage, settingsController.updateCareerNotificationEmail);

module.exports = router;
