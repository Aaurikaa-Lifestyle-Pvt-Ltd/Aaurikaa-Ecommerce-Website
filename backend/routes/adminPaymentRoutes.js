const express = require("express");
const router = express.Router();
const { verifyPaymentAdmin } = require("../controllers/paymentController");
const { withAdminAuth } = require("../utils/adminAuthChain");

router.post("/reverify/:orderId", ...withAdminAuth("orders", "manage"), verifyPaymentAdmin);

module.exports = router;
