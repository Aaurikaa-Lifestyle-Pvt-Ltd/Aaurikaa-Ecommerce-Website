const Commission = require("../models/Commission");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const { calculateCommission } = require("../utils/calculateCommission");
const { asyncHandler, sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS } = require("../utils/errorHandler");
const { calculateCommissionAmount } = require("../utils/discountCalculator");
const { validateCommissionData } = require("../utils/pricingValidator");

// Create commission for an order
exports.createCommission = asyncHandler(async (req, res) => {
  const { orderId, sellerId, productId, orderAmount, commissionRate, notes } = req.body;

  // Validate required fields
  if (!orderId || !sellerId || !productId || orderAmount === undefined) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Order ID, seller ID, product ID, and order amount are required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Validate order amount
  if (typeof orderAmount !== 'number' || orderAmount <= 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Order amount must be a positive number",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Check if commission already exists for this order and product
  const existingCommission = await Commission.findOne({
    order: orderId,
    seller: sellerId,
    product: productId
  });

  if (existingCommission) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      "Commission already exists for this order and product",
      ERROR_CODES.DUPLICATE_ENTRY
    );
  }

  // Verify order exists
  const order = await Order.findById(orderId);
  if (!order) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Order not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Verify seller exists
  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Seller not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Verify product exists
  const product = await Product.findById(productId);
  if (!product) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Product not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Calculate commission if rate not provided
  let finalCommissionRate = commissionRate;
  let commissionAmount;

  if (commissionRate === undefined) {
    // Use the calculateCommission utility
    commissionAmount = await calculateCommission(sellerId, product.category, orderAmount);
    finalCommissionRate = (commissionAmount / orderAmount) * 100;
  } else {
    commissionAmount = calculateCommissionAmount(orderAmount, commissionRate);
  }

  // Validate commission data using centralized validation
  const commissionData = {
    orderAmount,
    commissionRate: finalCommissionRate,
    commissionAmount
  };

  const commissionValidation = validateCommissionData(commissionData);
  if (commissionValidation.hasErrors()) {
    const errorMessages = commissionValidation.errors.map(error => error.message);
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      errorMessages.join('; '),
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS,
      { validationErrors: commissionValidation.errors }
    );
  }

  // Log warnings if any
  if (commissionValidation.hasWarnings()) {
    console.warn('⚠️ Commission validation warnings:', commissionValidation.warnings);
  }

  // Create commission record
  const commission = new Commission({
    order: orderId,
    seller: sellerId,
    product: productId,
    orderAmount,
    commissionRate: finalCommissionRate,
    commissionAmount: Math.round(commissionAmount * 100) / 100, // Round to 2 decimal places
    category: product.category,
    period: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1
    },
    notes: notes?.trim(),
    createdBy: req.user?.id
  });

  await commission.save();
  await commission.populate([
    { path: 'order', select: 'orderNumber orderDate status' },
    { path: 'seller', select: 'name email' },
    { path: 'product', select: 'name price' },
    { path: 'category', select: 'name' }
  ]);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.CREATED,
    "Commission created successfully",
    commission
  );
});

// Get all commissions with filtering
exports.getCommissions = asyncHandler(async (req, res) => {
  const {
    sellerId,
    status,
    year,
    month,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter query
  const filter = {};
  
  if (sellerId) {
    filter.seller = sellerId;
  }
  
  if (status) {
    filter.status = status;
  }
  
  if (year) {
    filter['period.year'] = parseInt(year);
  }
  
  if (month) {
    filter['period.month'] = parseInt(month);
  }

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  // Execute query
  const commissions = await Commission.find(filter)
    .populate('order', 'orderNumber orderDate status')
    .populate('seller', 'name email')
    .populate('product', 'name price')
    .populate('category', 'name')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Commission.countDocuments(filter);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Commissions retrieved successfully",
    {
      commissions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    }
  );
});

// Get seller commissions
exports.getSellerCommissions = asyncHandler(async (req, res) => {
  const { sellerId } = req.params;
  const { year, month, status } = req.query;

  if (!sellerId) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Seller ID is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Verify seller exists
  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Seller not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  const commissions = await Commission.getSellerCommissions(sellerId, year, month);
  
  // Filter by status if provided
  const filteredCommissions = status 
    ? commissions.filter(commission => commission.status === status)
    : commissions;

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Seller commissions retrieved successfully",
    filteredCommissions
  );
});

// Get commission summary for a seller
exports.getSellerCommissionSummary = asyncHandler(async (req, res) => {
  const { sellerId } = req.params;
  const { year, month } = req.query;

  if (!sellerId) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Seller ID is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Verify seller exists
  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Seller not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  const summary = await Commission.getSellerCommissionSummary(sellerId, year, month);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Commission summary retrieved successfully",
    summary
  );
});

// Get pending commissions
exports.getPendingCommissions = asyncHandler(async (req, res) => {
  const pendingCommissions = await Commission.getPendingCommissions();

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Pending commissions retrieved successfully",
    pendingCommissions
  );
});

// Get commission statistics
exports.getCommissionStats = asyncHandler(async (req, res) => {
  const { year, month } = req.query;

  const stats = await Commission.getCommissionStats(year, month);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Commission statistics retrieved successfully",
    stats
  );
});

// Approve commission
exports.approveCommission = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid commission ID",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const commission = await Commission.findById(id);
  if (!commission) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Commission not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  if (commission.status !== 'pending') {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Only pending commissions can be approved",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  await commission.approve(req.user?.id);
  await commission.populate([
    { path: 'order', select: 'orderNumber orderDate status' },
    { path: 'seller', select: 'name email' },
    { path: 'product', select: 'name price' }
  ]);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Commission approved successfully",
    commission
  );
});

// Mark commission as paid
exports.markCommissionAsPaid = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paymentMethod = 'bank_transfer', paymentReference } = req.body;

  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid commission ID",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const commission = await Commission.findById(id);
  if (!commission) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Commission not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  if (commission.status !== 'approved') {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Only approved commissions can be marked as paid",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  await commission.markAsPaid(paymentMethod, paymentReference);
  await commission.populate([
    { path: 'order', select: 'orderNumber orderDate status' },
    { path: 'seller', select: 'name email' },
    { path: 'product', select: 'name price' }
  ]);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Commission marked as paid successfully",
    commission
  );
});

// Dispute commission
exports.disputeCommission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason, raisedBy = 'seller' } = req.body;

  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid commission ID",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  if (!reason || reason.trim().length === 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Dispute reason is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const commission = await Commission.findById(id);
  if (!commission) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Commission not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  if (commission.status === 'disputed') {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Commission is already disputed",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  await commission.raiseDispute(reason.trim(), raisedBy);
  await commission.populate([
    { path: 'order', select: 'orderNumber orderDate status' },
    { path: 'seller', select: 'name email' },
    { path: 'product', select: 'name price' }
  ]);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Commission disputed successfully",
    commission
  );
});

// Resolve dispute
exports.resolveDispute = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { resolution } = req.body;

  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid commission ID",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  if (!resolution || resolution.trim().length === 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Dispute resolution is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const commission = await Commission.findById(id);
  if (!commission) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Commission not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  if (commission.status !== 'disputed') {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Only disputed commissions can be resolved",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  await commission.resolveDispute(resolution.trim());
  await commission.populate([
    { path: 'order', select: 'orderNumber orderDate status' },
    { path: 'seller', select: 'name email' },
    { path: 'product', select: 'name price' }
  ]);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Dispute resolved successfully",
    commission
  );
});

// Get commission by ID
exports.getCommissionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid commission ID",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const commission = await Commission.findById(id)
    .populate('order', 'orderNumber orderDate status')
    .populate('seller', 'name email')
    .populate('product', 'name price')
    .populate('category', 'name')
    .populate('createdBy', 'name')
    .populate('approvedBy', 'name');

  if (!commission) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Commission not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Commission retrieved successfully",
    commission
  );
});

// Bulk approve commissions
exports.bulkApproveCommissions = asyncHandler(async (req, res) => {
  const { commissionIds } = req.body;

  if (!Array.isArray(commissionIds) || commissionIds.length === 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Commission IDs array is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Validate all IDs
  const invalidIds = commissionIds.filter(id => !id.match(/^[0-9a-fA-F]{24}$/));
  if (invalidIds.length > 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid commission IDs found",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Update commissions
  const result = await Commission.updateMany(
    { 
      _id: { $in: commissionIds },
      status: 'pending'
    },
    {
      status: 'approved',
      approvedBy: req.user?.id,
      approvedAt: new Date()
    }
  );

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    `${result.modifiedCount} commissions approved successfully`,
    { approvedCount: result.modifiedCount }
  );
});
