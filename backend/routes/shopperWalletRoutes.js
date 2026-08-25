const express = require("express");
const router = express.Router();
const verifyShopper = require("../middleware/verifyShopper");
const shopperWalletController = require("../controllers/shopperWalletController");

router.get("/", verifyShopper, shopperWalletController.getWalletSummary);
router.get("/transactions", verifyShopper, shopperWalletController.listWalletTransactions);

module.exports = router;
