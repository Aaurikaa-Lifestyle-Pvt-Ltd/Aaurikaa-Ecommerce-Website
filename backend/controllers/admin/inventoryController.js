const Product = require("../../models/Product");
const {
  sendErrorResponse,
  sendSuccessResponse,
  ERROR_CODES,
  HTTP_STATUS,
  asyncHandler,
} = require("../../utils/errorHandler");

const INVENTORY_SELECT =
  "name sku stock variantStock status approvalStatus updatedAt";

const STOCK_FILTERS = new Set(["all", "in_stock", "low", "out"]);

/**
 * Summarize variantStock map for Admin list UI (no marketplace inventory engine).
 */
function summarizeVariantStock(variantStock) {
  if (!variantStock || typeof variantStock !== "object" || Array.isArray(variantStock)) {
    return { keys: 0, total: 0, entries: [] };
  }
  const entries = Object.entries(variantStock).map(([key, qty]) => ({
    key,
    stock: Math.max(0, Number(qty) || 0),
  }));
  return {
    keys: entries.length,
    total: entries.reduce((sum, e) => sum + e.stock, 0),
    entries,
  };
}

function effectiveStock(product) {
  const parent = Math.max(0, Number(product.stock) || 0);
  const variantSummary = summarizeVariantStock(product.variantStock);
  if (variantSummary.keys > 0) {
    return variantSummary.total;
  }
  return parent;
}

function matchesStockFilter(stockEffective, stockFilter) {
  switch (stockFilter) {
    case "out":
      return stockEffective === 0;
    case "low":
      return stockEffective >= 1 && stockEffective <= 5;
    case "in_stock":
      return stockEffective > 0;
    case "all":
    default:
      return true;
  }
}

function parsePagination(query) {
  let page = Number.parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 25;
  limit = Math.min(100, limit);

  return { page, limit };
}

/**
 * GET /api/admin/inventory
 * Thin Admin inventory list over Product.stock / Product.variantStock.
 * Query: q|search (name/sku), status, stock (all|in_stock|low|out),
 *        lowStock (threshold; additive), page, limit.
 */
exports.listInventory = asyncHandler(async (req, res) => {
  try {
    const { q, search, status, lowStock, stock } = req.query;
    const filter = {};

    if (status && status !== "all") {
      filter.status = String(status);
    } else {
      // Exclude trash by default for operational inventory view
      filter.status = { $ne: "trash" };
    }

    const searchTerm = String(q || search || "").trim();
    if (searchTerm) {
      filter.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { sku: { $regex: searchTerm, $options: "i" } },
      ];
    }

    let products = await Product.find(filter)
      .select(INVENTORY_SELECT)
      .sort({ updatedAt: -1 })
      .lean();

    const thresholdRaw = lowStock !== undefined && lowStock !== "" ? Number(lowStock) : null;
    const threshold =
      thresholdRaw !== null && Number.isFinite(thresholdRaw) ? thresholdRaw : null;

    const stockRaw = stock !== undefined && stock !== null && String(stock).trim() !== ""
      ? String(stock).trim().toLowerCase()
      : "all";
    const stockFilter = STOCK_FILTERS.has(stockRaw) ? stockRaw : "all";

    let items = products.map((p) => {
      const variantStockSummary = summarizeVariantStock(p.variantStock);
      const stockEffective = effectiveStock(p);
      return {
        _id: p._id,
        name: p.name,
        sku: p.sku,
        stock: Math.max(0, Number(p.stock) || 0),
        stockEffective,
        variantStock: p.variantStock || {},
        variantStockSummary,
        status: p.status,
        approvalStatus: p.approvalStatus ?? null,
        updatedAt: p.updatedAt,
      };
    });

    // Additive threshold filter (optional)
    if (threshold !== null) {
      items = items.filter((p) => p.stockEffective <= threshold);
    }

    // Stock enum on stockEffective BEFORE pagination
    if (stockFilter !== "all") {
      items = items.filter((p) => matchesStockFilter(p.stockEffective, stockFilter));
    }

    const total = items.length;
    const { page, limit } = parsePagination(req.query);
    const pages = Math.max(1, Math.ceil(total / limit) || 1);
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);

    sendSuccessResponse(res, HTTP_STATUS.OK, "Inventory retrieved successfully", {
      products: paged,
      count: paged.length,
      pagination: { page, limit, total, pages },
      ...(threshold !== null ? { lowStockThreshold: threshold } : {}),
    });
  } catch (error) {
    console.error("Admin inventory list error:", error);
    sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to retrieve inventory",
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      { error: error.message }
    );
  }
});

module.exports.summarizeVariantStock = summarizeVariantStock;
module.exports.effectiveStock = effectiveStock;
module.exports.matchesStockFilter = matchesStockFilter;
module.exports.parsePagination = parsePagination;
