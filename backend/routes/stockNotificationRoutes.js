const express = require("express");
const router = express.Router();
const verifyShopper = require("../middleware/verifyShopper");
const stockNotificationController = require("../controllers/stockNotificationController");

router.post("/", verifyShopper, stockNotificationController.createNotificationRequest);

module.exports = router;
