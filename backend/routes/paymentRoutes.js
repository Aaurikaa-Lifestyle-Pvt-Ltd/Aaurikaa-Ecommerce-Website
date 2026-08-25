const express = require("express");
const verifyShopper = require("../middleware/verifyShopper");
const { updatePaymentStatus, initiatePayment, verifyPaymentStatus } = require("../controllers/paymentController");
const { withAdminAuth } = require("../utils/adminAuthChain");

const router = express.Router();

router.post("/initiate", verifyShopper, initiatePayment);
router.post("/verify", verifyShopper, verifyPaymentStatus);
router.post("/update-status", ...withAdminAuth("orders", "manage"), updatePaymentStatus);

module.exports = router;
