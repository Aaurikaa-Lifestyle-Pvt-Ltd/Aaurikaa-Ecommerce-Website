const express = require("express");
const router = express.Router();
const verifySeller = require("../middleware/verifySeller");
const {
  listSellerReturns,
  getSellerReturn,
  patchSellerReview,
  patchSellerConfirmReceipt,
  patchSellerResolution,
  postSellerRetryPickup,
} = require("../controllers/sellerReturnController");

router.use(verifySeller);

router.get("/", listSellerReturns);
router.get("/:id", getSellerReturn);
router.patch("/:id/review", patchSellerReview);
router.patch("/:id/confirm-receipt", patchSellerConfirmReceipt);
router.patch("/:id/resolution", patchSellerResolution);
router.post("/:id/retry-pickup", postSellerRetryPickup);

module.exports = router;
