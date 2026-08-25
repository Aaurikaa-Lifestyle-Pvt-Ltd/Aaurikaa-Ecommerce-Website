const Coupon = require('../models/coupon');
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require('../utils/errorHandler');
const { validateCouponData } = require('../utils/pricingValidator');

// ➕ Add a new coupon
exports.addCoupon = asyncHandler(async (req, res) => {
  const { code, discountValue, discountType, expiry, minOrder, validFrom, freeShipping } = req.body;

  // Validate coupon data using centralized validation
  const couponData = {
    code,
    discountValue,
    discountType,
    validTo: expiry,
    minOrder,
    validFrom,
    freeShipping
  };

  const couponValidation = validateCouponData(couponData);
  if (couponValidation.hasErrors()) {
    const errorMessages = couponValidation.errors.map(error => error.message);
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      errorMessages.join('; '),
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS,
      { validationErrors: couponValidation.errors }
    );
  }

  // Log warnings if any
  if (couponValidation.hasWarnings()) {
    console.warn('⚠️ Coupon validation warnings:', couponValidation.warnings);
  }

  const exists = await Coupon.findOne({ code });
  if (exists) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      "Coupon code already exists",
      ERROR_CODES.RESOURCE_ALREADY_EXISTS
    );
  }

  const coupon = new Coupon({
    code,
    discountValue,
    discountType,
    validTo: expiry,
    minOrder,
    validFrom,
    freeShipping: freeShipping || false
  });
  await coupon.save();

  return sendSuccessResponse(
    res,
    HTTP_STATUS.CREATED,
    "✅ Coupon created successfully",
    coupon
  );
});

// 📋 Get all coupons
exports.getCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Coupons retrieved successfully",
    coupons
  );
});

// ✏️ Update a coupon
exports.updateCoupon = asyncHandler(async (req, res) => {
  const { code, discountValue, discountType, expiry, isActive, minOrder, validFrom, freeShipping } = req.body;
  const updated = await Coupon.findByIdAndUpdate(
    req.params.id,
    {
      code,
      discountValue,
      discountType,
      validTo: expiry,
      isActive,
      minOrder,
      validFrom,
      freeShipping: freeShipping !== undefined ? freeShipping : false
    },
    { new: true }
  );

  if (!updated) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Coupon updated successfully",
    updated
  );
});

// 🗑 Delete a coupon
exports.deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Coupon deleted successfully"
  );
});
