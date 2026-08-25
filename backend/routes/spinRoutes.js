const express = require("express");
const verifyShopper = require("../middleware/verifyShopper");
const spinController = require("../controllers/spinController");
const adminSpinController = require("../controllers/adminSpinController");
const { withAdminAuth } = require("../utils/adminAuthChain");

const shopperRouter = express.Router();
const adminRouter = express.Router();
const publicRouter = express.Router();

shopperRouter.get("/status", verifyShopper, spinController.getSpinStatus);
shopperRouter.post("/spin", verifyShopper, spinController.spin);

publicRouter.get("/active", adminSpinController.getActiveCampaignPreview);

adminRouter.get("/", ...withAdminAuth("promotions", "view"), adminSpinController.listCampaigns);
adminRouter.post("/", ...withAdminAuth("promotions", "manage"), adminSpinController.createCampaign);
adminRouter.get("/:id", ...withAdminAuth("promotions", "view"), adminSpinController.getCampaign);
adminRouter.put("/:id", ...withAdminAuth("promotions", "manage"), adminSpinController.updateCampaign);
adminRouter.patch(
  "/:id/status",
  ...withAdminAuth("promotions", "manage"),
  adminSpinController.updateCampaignStatus
);
adminRouter.delete("/:id", ...withAdminAuth("promotions", "manage"), adminSpinController.deleteCampaign);
adminRouter.get(
  "/:id/attempts",
  ...withAdminAuth("promotions", "view"),
  adminSpinController.listAttempts
);

module.exports = {
  spinShopperRoutes: shopperRouter,
  spinAdminRoutes: adminRouter,
  spinPublicRoutes: publicRouter,
};
