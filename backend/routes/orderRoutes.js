const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const verifyShopper = require("../middleware/verifyShopper");
const { cancelShopperOrder } = require("../controllers/shopperOrderController");
const { createOrderWithBulkDiscounts } = require("../services/orderProcessingService");
const orderFulfillmentService = require("../services/orderFulfillmentService");
const paymentVisibilityService = require("../services/paymentVisibilityService");
const { productHasVariants, validateVariantCombination, combinationFromVariantKey } = require("../utils/variantUtils");
const { streamOrderInvoicePdf } = require("../services/invoiceDownloadService");
const { onOrderCreated } = require("../services/orderCommerceIntegrityService");
const {
  extractCheckoutIdempotencyKey,
  findOrderByCheckoutIdempotencyKey,
  isMongoDuplicateKeyError,
  isCheckoutIdempotencyDuplicateKey,
  buildOrderCreateSuccessPayload,
} = require("../services/orderCheckoutIdempotency");

/** AAURIKAA shopper checkout accepts only COD and PhonePe (no marketplace / legacy rails). */
const AAURIKAA_SHOPPER_PAYMENT_METHODS = new Set(["cod", "phonepe"]);

async function sendIdempotentOrderReplay(res, order) {
  const payload = await buildOrderCreateSuccessPayload(order, { idempotentReplay: true });
  return res.status(200).json(payload);
}

/**
 * Pending checkout: order + payment pending; no Shiprocket/commission until paid (Phase 1).
 */
async function createShopperOrderHandler(req, res) {
  try {
    const idempotency = extractCheckoutIdempotencyKey(req);
    if (idempotency.present && idempotency.error) {
      return res.status(400).json({ message: `❌ ${idempotency.error}` });
    }
    const checkoutIdempotencyKey = idempotency.present ? idempotency.key : null;

    if (checkoutIdempotencyKey) {
      const existing = await findOrderByCheckoutIdempotencyKey(req.user.id, checkoutIdempotencyKey);
      if (existing) {
        return sendIdempotentOrderReplay(res, existing);
      }
    }

    const {
      items,
      totalAmount, // This will be recalculated with bulk discounts
      paymentMethod,
      upiTxnId,
      billingAddress,
      shippingAddress,
      coupon,
      paymentData,
      timestamp,
    } = req.body;

    const paymentMethodLower =
      typeof paymentMethod === "string" ? paymentMethod.trim().toLowerCase() : "";
    if (!AAURIKAA_SHOPPER_PAYMENT_METHODS.has(paymentMethodLower)) {
      return res.status(400).json({
        message: "❌ Unsupported payment method. Allowed: cod, phonepe",
        allowedPaymentMethods: ["cod", "phonepe"],
      });
    }

    const isCod = paymentMethodLower === "cod";

    // Phase 4: Cart Normalization Rules - Validate cart before checkout
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "❌ Order must contain at least one item"
      });
    }

    const Product = require("../models/Product");
    const invalidItems = [];

    for (const item of items) {
      if (!item.product) continue;

      // Fully populate variant fields needed for validation and processing
      const product = await Product.findById(item.product)
        .select("variants variantStock variantPricing variantSku name");
      if (!product) continue;

      const hasVariants = productHasVariants(product);

      if (hasVariants) {
        if (!item.variantCombination && item.variantKey) {
          item.variantCombination = combinationFromVariantKey(item.variantKey);
        }
        // Product has variants - variantKey and variantCombination are required
        if (!item.variantKey || !item.variantCombination) {
          invalidItems.push({
            productId: item.product,
            error: "Variant selection required. Please select size, color, or other variant options."
          });
          continue;
        }

        // Validate variantCombination against product's actual variant definitions
        const validation = validateVariantCombination(product, item.variantCombination);
        if (!validation.valid) {
          invalidItems.push({
            productId: item.product,
            error: validation.error || "Invalid variant selection. Please select valid variant options."
          });
        }
      }
    }

    if (invalidItems.length > 0) {
      return res.status(400).json({
        message: "❌ Cart contains items without required variant selection",
        invalidItems: invalidItems.map(i => i.error).join(" "),
        details: invalidItems
      });
    }

    // Process order with bulk discount calculations
    const orderProcessingResult = await createOrderWithBulkDiscounts({
      items,
      paymentMethod: paymentMethodLower,
      upiTxnId,
      billingAddress,
      shippingAddress,
      coupon,
      paymentData,
      timestamp,
      status: isCod ? "processing" : "pending",
      paymentStatus: "pending",
      buyer: req.user.id,
    }, {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    if (!orderProcessingResult.success) {
      return res.status(400).json({
        message: "❌ Order processing failed",
        error: orderProcessingResult.error
      });
    }

    // Create order with processed data
    const order = new Order(orderProcessingResult.order);
    if (checkoutIdempotencyKey) {
      order.checkoutIdempotencyKey = checkoutIdempotencyKey;
    }

    try {
      await order.save();
    } catch (saveErr) {
      // Concurrent duplicate create with same attempt key — return the winner's order.
      if (checkoutIdempotencyKey && isMongoDuplicateKeyError(saveErr)) {
        const raced = await findOrderByCheckoutIdempotencyKey(req.user.id, checkoutIdempotencyKey);
        if (raced) {
          return sendIdempotentOrderReplay(res, raced);
        }
        // Unrelated unique conflict (e.g. invoiceNumber) when no sibling order exists
        if (!isCheckoutIdempotencyDuplicateKey(saveErr)) {
          throw saveErr;
        }
      }
      throw saveErr;
    }

    let integrityResult;
    try {
      integrityResult = await onOrderCreated(order, {
        isCod,
        requestInfo: {
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get("User-Agent"),
        },
      });
    } catch (integrityErr) {
      console.error("commerce integrity on order create failed:", integrityErr.message);
      integrityResult = { success: false, error: integrityErr.message };
    }

    if (!integrityResult.success) {
      order.status = "cancelled";
      order.paymentStatus = "failed";
      // Release attempt key so the client can retry create (cancelled order must not sticky-replay).
      order.checkoutIdempotencyKey = undefined;
      await order.save();
      return res.status(409).json({
        message: "❌ Insufficient stock for one or more items",
        error: integrityResult.error,
      });
    }
    await order.save();

    // Objective 4.9: Update product salesCount for best sellers (only after stock claim)
    if (order.items && order.items.length > 0) {
      try {
        for (const item of order.items) {
          const productId = item.product && (item.product._id || item.product);
          const qty = Math.max(0, parseInt(item.quantity, 10) || 0);
          if (productId && qty > 0) {
            await Product.updateOne(
              { _id: productId },
              { $inc: { salesCount: qty } }
            );
          }
        }
      } catch (salesErr) {
        console.warn('⚠️ Failed to update product salesCount:', salesErr.message);
      }
    }

    // Generate and store invoice number immediately upon order creation
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    // Count existing invoices for today to create sequential number
    const todayStart = new Date(year, today.getMonth(), today.getDate());
    const todayEnd = new Date(year, today.getMonth(), today.getDate() + 1);

    const todayInvoiceCount = await Order.countDocuments({
      createdAt: { $gte: todayStart, $lt: todayEnd },
      invoiceNumber: { $exists: true }
    });

    const sequentialNumber = String(todayInvoiceCount + 1).padStart(4, '0');
    const properInvoiceNumber = `INV-${year}${month}${day}-${sequentialNumber}`;

    // Update order with proper invoice number
    order.invoiceNumber = properInvoiceNumber;
    await order.save();

    // Phase 2 COD flow:
    // COD orders are payment-ready immediately and should trigger Shiprocket without waiting for payment.
    if (isCod) {
      await orderFulfillmentService.maybeSyncShiprocket(order._id).catch(() => {});
    }

    await paymentVisibilityService.normalizeAndPersist(order).catch((err) => {
      console.warn("payment visibility normalize failed on order create:", err.message);
    });

    const payload = await buildOrderCreateSuccessPayload(order);
    res.status(201).json(payload);
  } catch (error) {
    console.error("❌ Order Create Error:", error);
    res.status(500).json({ message: "❌ Failed to create order" });
  }
}

router.post("/", verifyShopper, createShopperOrderHandler);
router.post("/create-pending", verifyShopper, createShopperOrderHandler);

// ✅ নিজের অর্ডার লিস্ট (Shopper Only)
router.get("/my-orders", verifyShopper, async (req, res) => {
  try {
    const orders = await Order.find({ buyer: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error("❌ Fetch Orders Error:", error);
    res.status(500).json({ message: "❌ Failed to fetch orders" });
  }
});

// ✅ অর্ডার ক্যানসেল (Shopper Only)
router.put("/:id/cancel", verifyShopper, cancelShopperOrder);

// ✅ ইনভয়েস ডাউনলোড (PDF) – Shopper Only - Enhanced with Professional Formatting
router.get("/:id/invoice", verifyShopper, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("buyer")
      .populate("items.product", "name mainImage regularPrice salePrice hsnCode");

    if (!order) return res.status(404).json({ message: "❌ Order not found" });

    // Validate that the order belongs to the authenticated user
    if (order.buyer._id.toString() !== req.user.id) {
      return res.status(403).json({ message: "❌ Access denied - Order does not belong to you" });
    }

    // Validate order data integrity for invoice generation
    if (!order.items || order.items.length === 0) {
      return res.status(400).json({ message: "❌ Invalid order - No items found" });
    }

    if (!order.totalAmount || order.totalAmount <= 0) {
      return res.status(400).json({ message: "❌ Invalid order - Invalid total amount" });
    }

    // Generate sequential invoice number if not exists (fallback for legacy orders)
    if (!order.invoiceNumber) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");

      const todayStart = new Date(year, today.getMonth(), today.getDate());
      const todayEnd = new Date(year, today.getMonth(), today.getDate() + 1);

      const todayInvoiceCount = await Order.countDocuments({
        createdAt: { $gte: todayStart, $lt: todayEnd },
        invoiceNumber: { $exists: true },
      });

      const sequentialNumber = String(todayInvoiceCount + 1).padStart(4, "0");
      const properInvoiceNumber = `INV-${year}${month}${day}-${sequentialNumber}`;

      await Order.findByIdAndUpdate(order._id, { invoiceNumber: properInvoiceNumber });
      order.invoiceNumber = properInvoiceNumber;
    }

    await streamOrderInvoicePdf(res, order);
  } catch (err) {
    console.error("Invoice Error:", err);
    res.status(500).json({ message: "❌ Invoice generation failed" });
  }
});

// ✅ (OPTIONAL) Admin থেকে অর্ডার স্ট্যাটাস আপডেট
// router.put("/:id/status", verifyAdmin, async (req, res) => {
//   try {
//     const order = await Order.findById(req.params.id);
//     if (!order) return res.status(404).json({ message: "Order not found" });
//     order.status = req.body.status || order.status;
//     await order.save();
//     res.json({ message: "✅ Status updated", order });
//   } catch (err) {
//     res.status(500).json({ message: "❌ Failed to update status" });
//   }
// });

module.exports = router;
