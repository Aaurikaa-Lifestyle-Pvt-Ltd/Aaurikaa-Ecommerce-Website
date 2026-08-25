const express = require("express");
const router = express.Router();
const verifyShopper = require("../middleware/verifyShopper");
const { listShopperOrders, getShopperOrderDetail, buyAgainFromOrder } = require("../controllers/shopperOrderController");

/**
 * Authoritative shopper order listing (normalized DTO + pagination).
 * Mounted at /api/shopper/orders
 */
router.get("/", verifyShopper, listShopperOrders);

/**
 * Normalized shopper order detail (read-only DTO).
 */
router.get("/:id", verifyShopper, getShopperOrderDetail);

/**
 * Buy Again orchestration — rehydrates cart from historical order with live validation.
 */
router.post("/:id/buy-again", verifyShopper, buyAgainFromOrder);

module.exports = router;
