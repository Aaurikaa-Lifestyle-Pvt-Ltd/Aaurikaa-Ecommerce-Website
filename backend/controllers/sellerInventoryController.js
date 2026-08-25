// backend/controllers/sellerInventoryController.js

const Product = require("../models/Product");
const Order = require("../models/Order");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");

// =========================
// 📦 Get Low Stock Products (Priority 21)
// =========================
exports.getLowStockProducts = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { threshold = 10 } = req.query; // Default threshold of 10

    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    // Get products with stock below threshold
    const lowStockProducts = await Product.find({
      seller: sellerId,
      stock: { $lte: parseInt(threshold) }
    })
    .populate("category subcategory childCategory brand", "name")
    .sort({ stock: 1 }); // Sort by stock ascending (lowest first)

    // Add stock status and reorder suggestions
    const productsWithStatus = lowStockProducts.map(product => ({
      ...product.toObject(),
      stockStatus: product.stock === 0 ? 'out_of_stock' : 'low_stock',
      reorderSuggestion: calculateReorderSuggestion(product.stock, threshold)
    }));

    sendSuccessResponse(res, HTTP_STATUS.OK, "Low stock products retrieved successfully", {
      products: productsWithStatus,
      count: productsWithStatus.length,
      threshold: parseInt(threshold)
    });

  } catch (error) {
    console.error("Get low stock products error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to retrieve low stock products", ERROR_CODES.INTERNAL_ERROR);
  }
});

// =========================
// 📊 Get Inventory Summary (Priority 21)
// =========================
exports.getInventorySummary = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;

    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    // Get inventory statistics
    const inventoryStats = await Product.aggregate([
      { $match: { seller: sellerId } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalStock: { $sum: "$stock" },
          outOfStock: { $sum: { $cond: [{ $eq: ["$stock", 0] }, 1, 0] } },
          lowStock: { $sum: { $cond: [{ $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", 10] }] }, 1, 0] } },
          inStock: { $sum: { $cond: [{ $gt: ["$stock", 10] }, 1, 0] } },
          totalValue: { $sum: { $multiply: ["$stock", "$regularPrice"] } }
        }
      }
    ]);

    // Get recent stock movements (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOrders = await Order.aggregate([
      {
        $match: {
          'items.product': { $exists: true },
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      { $match: { "product.seller": sellerId } },
      {
        $group: {
          _id: "$items.product",
          totalSold: { $sum: "$items.quantity" },
          productName: { $first: "$product.name" },
          productSku: { $first: "$product.sku" }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 }
    ]);

    const summary = {
      ...inventoryStats[0],
      recentMovements: recentOrders,
      lastUpdated: new Date()
    };

    sendSuccessResponse(res, HTTP_STATUS.OK, "Inventory summary retrieved successfully", summary);

  } catch (error) {
    console.error("Get inventory summary error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to retrieve inventory summary", ERROR_CODES.INTERNAL_ERROR);
  }
});

// =========================
// 🔄 Update Product Stock (Priority 21)
// =========================
exports.updateProductStock = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { productId } = req.params;
    const { stock, reason } = req.body;

    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    if (!productId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Product ID is required", ERROR_CODES.INVALID_INPUT);
    }

    if (stock === undefined || stock < 0) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Valid stock quantity is required", ERROR_CODES.INVALID_INPUT);
    }

    // Find and update product
    const product = await Product.findOneAndUpdate(
      { _id: productId, seller: sellerId },
      { 
        stock: parseInt(stock),
        updatedAt: new Date()
      },
      { new: true }
    ).populate("category subcategory childCategory brand", "name");

    if (!product) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Product not found or access denied", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    // Log stock update
    console.log(`📦 Stock updated: Product ${product.name} (${product.sku}) - New stock: ${stock} - Reason: ${reason || 'Manual update'}`);

    sendSuccessResponse(res, HTTP_STATUS.OK, "Product stock updated successfully", {
      product: {
        _id: product._id,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        stockStatus: product.stock === 0 ? 'out_of_stock' : product.stock <= 10 ? 'low_stock' : 'in_stock'
      }
    });

  } catch (error) {
    console.error("Update product stock error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to update product stock", ERROR_CODES.INTERNAL_ERROR);
  }
});

// =========================
// 📈 Get Stock Movement History (Priority 21)
// =========================
exports.getStockMovementHistory = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { productId, days = 30 } = req.query;

    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    let matchQuery = {
      'items.product': { $exists: true },
      createdAt: { $gte: daysAgo }
    };

    // If specific product requested, add to match query
    if (productId) {
      matchQuery['items.product'] = productId;
    }

    const stockMovements = await Order.aggregate([
      { $match: matchQuery },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      { $match: { "product.seller": sellerId } },
      {
        $group: {
          _id: {
            productId: "$items.product",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
          },
          productName: { $first: "$product.name" },
          productSku: { $first: "$product.sku" },
          quantitySold: { $sum: "$items.quantity" },
          totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } }
        }
      },
      { $sort: { "_id.date": -1 } }
    ]);

    sendSuccessResponse(res, HTTP_STATUS.OK, "Stock movement history retrieved successfully", {
      movements: stockMovements,
      period: `${days} days`,
      productId: productId || 'all'
    });

  } catch (error) {
    console.error("Get stock movement history error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to retrieve stock movement history", ERROR_CODES.INTERNAL_ERROR);
  }
});

// =========================
// 🔔 Get Inventory Alerts (Priority 21)
// =========================
exports.getInventoryAlerts = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;

    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    // Get out of stock products
    const outOfStockProducts = await Product.find({
      seller: sellerId,
      stock: 0
    }).select('name sku stock regularPrice').limit(10);

    // Get low stock products
    const lowStockProducts = await Product.find({
      seller: sellerId,
      stock: { $gt: 0, $lte: 10 }
    }).select('name sku stock regularPrice').limit(10);

    // Get products with high sales velocity (potential stockouts)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const highVelocityProducts = await Order.aggregate([
      {
        $match: {
          'items.product': { $exists: true },
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      { $match: { "product.seller": sellerId } },
      {
        $group: {
          _id: "$items.product",
          productName: { $first: "$product.name" },
          productSku: { $first: "$product.sku" },
          currentStock: { $first: "$product.stock" },
          totalSold: { $sum: "$items.quantity" },
          dailyAverage: { $avg: "$items.quantity" }
        }
      },
      {
        $addFields: {
          daysUntilStockout: {
            $cond: [
              { $gt: ["$currentStock", 0] },
              { $divide: ["$currentStock", { $max: ["$dailyAverage", 0.1] }] },
              0
            ]
          }
        }
      },
      { $match: { daysUntilStockout: { $lte: 7, $gt: 0 } } }, // Products that will stockout in 7 days or less
      { $sort: { daysUntilStockout: 1 } },
      { $limit: 10 }
    ]);

    const alerts = {
      outOfStock: outOfStockProducts,
      lowStock: lowStockProducts,
      potentialStockouts: highVelocityProducts,
      alertCount: outOfStockProducts.length + lowStockProducts.length + highVelocityProducts.length,
      lastChecked: new Date()
    };

    sendSuccessResponse(res, HTTP_STATUS.OK, "Inventory alerts retrieved successfully", alerts);

  } catch (error) {
    console.error("Get inventory alerts error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to retrieve inventory alerts", ERROR_CODES.INTERNAL_ERROR);
  }
});

// =========================
// 🛠️ Helper Functions
// =========================

function calculateReorderSuggestion(currentStock, threshold) {
  if (currentStock === 0) {
    return {
      action: 'urgent_reorder',
      suggestedQuantity: Math.max(threshold * 3, 50), // 3x threshold or minimum 50
      priority: 'high'
    };
  } else if (currentStock <= threshold) {
    return {
      action: 'reorder',
      suggestedQuantity: Math.max(threshold * 2, 30), // 2x threshold or minimum 30
      priority: 'medium'
    };
  } else {
    return {
      action: 'monitor',
      suggestedQuantity: 0,
      priority: 'low'
    };
  }
}
