const express = require("express");
const router = express.Router();
const stockNotificationController = require("../../controllers/stockNotificationController");
const { withAdminAuth } = require("../../utils/adminAuthChain");

router.get("/", ...withAdminAuth("catalog", "view"), stockNotificationController.listNotificationRequests);

module.exports = router;
