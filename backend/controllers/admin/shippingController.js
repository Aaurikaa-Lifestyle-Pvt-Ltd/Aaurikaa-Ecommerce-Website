const ShippingMethod = require("../../models/ShippingMethod");
const ShippingZone = require("../../models/ShippingZone");
const { asyncHandler, sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS } = require("../../utils/errorHandler");

// Input validation
const validateShippingMethodInput = (req) => {
  const { name, cost, zones } = req.body;
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push("Shipping method name is required");
  } else if (name.trim().length < 2) {
    errors.push("Shipping method name must be at least 2 characters long");
  } else if (name.trim().length > 50) {
    errors.push("Shipping method name cannot exceed 50 characters");
  }

  if (cost === undefined || cost === null) {
    errors.push("Shipping cost is required");
  } else if (typeof cost !== 'number' || cost < 0) {
    errors.push("Shipping cost must be a non-negative number");
  } else if (cost > 10000) {
    errors.push("Shipping cost cannot exceed ₹10,000");
  }

  if (zones && !Array.isArray(zones)) {
    errors.push("Zones must be an array");
  }

  return errors;
};

// Get all shipping methods
exports.getShippingMethods = asyncHandler(async (req, res) => {
  const methods = await ShippingMethod.find()
    .populate('zones', 'name code active')
    .sort({ name: 1 });

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Shipping methods retrieved successfully",
    methods
  );
});

// Add new shipping method
exports.addShippingMethod = asyncHandler(async (req, res) => {
  // Validate input
  const validationErrors = validateShippingMethodInput(req);
  if (validationErrors.length > 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      validationErrors.join(', '),
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const { name, cost, zones = [] } = req.body;

  // Check for duplicate name
  const existingMethod = await ShippingMethod.findOne({ 
    name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
  });
  
  if (existingMethod) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      "Shipping method with this name already exists",
      ERROR_CODES.DUPLICATE_ENTRY
    );
  }

  // Validate zones if provided
  if (zones.length > 0) {
    const validZones = await ShippingZone.find({ 
      _id: { $in: zones }, 
      active: true 
    });
    
    if (validZones.length !== zones.length) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "One or more shipping zones are invalid or inactive",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }
  }

  const method = new ShippingMethod({
    name: name.trim(),
    cost: Math.round(cost * 100) / 100, // Round to 2 decimal places
    zones: zones
  });

  await method.save();
  await method.populate('zones', 'name code active');

  return sendSuccessResponse(
    res,
    HTTP_STATUS.CREATED,
    "Shipping method created successfully",
    method
  );
});

// Update shipping method
exports.updateShippingMethod = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid shipping method ID",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Validate input
  const validationErrors = validateShippingMethodInput(req);
  if (validationErrors.length > 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      validationErrors.join(', '),
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const { name, cost, zones = [] } = req.body;

  // Check if method exists
  const existingMethod = await ShippingMethod.findById(id);
  if (!existingMethod) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Shipping method not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Check for duplicate name (excluding current method)
  const duplicateMethod = await ShippingMethod.findOne({ 
    name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    _id: { $ne: id }
  });
  
  if (duplicateMethod) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      "Shipping method with this name already exists",
      ERROR_CODES.DUPLICATE_ENTRY
    );
  }

  // Validate zones if provided
  if (zones.length > 0) {
    const validZones = await ShippingZone.find({ 
      _id: { $in: zones }, 
      active: true 
    });
    
    if (validZones.length !== zones.length) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "One or more shipping zones are invalid or inactive",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }
  }

  // Update method
  const method = await ShippingMethod.findByIdAndUpdate(
    id,
    {
      name: name.trim(),
      cost: Math.round(cost * 100) / 100, // Round to 2 decimal places
      zones: zones
    },
    { new: true, runValidators: true }
  ).populate('zones', 'name code active');

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Shipping method updated successfully",
    method
  );
});

// Delete shipping method
exports.deleteShippingMethod = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid shipping method ID",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const method = await ShippingMethod.findById(id);
  if (!method) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Shipping method not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Check if method is being used in any orders (optional business logic)
  // This would require checking Order model for shipping method references
  // For now, we'll allow deletion but log it for audit purposes
  console.log(`🗑️ Deleting shipping method: ${method.name} (ID: ${id})`);

  await ShippingMethod.findByIdAndDelete(id);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Shipping method deleted successfully",
    { id: method._id, name: method.name }
  );
});
