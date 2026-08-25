const mongoose = require("mongoose");
const Address = require("../models/Address");
const Country = require("../models/location/Country");
const State = require("../models/location/State");
const District = require("../models/location/District");
const { asyncHandler, sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS } = require("../utils/errorHandler");

// Input validation for create operations
const validateAddressInput = (req) => {
  const {
    type,
    addressLine1,
    city,
    pincode,
    contactName,
    contactPhone,
    country,
    state,
    district
  } = req.body;

  const errors = [];

  if (!addressLine1 || addressLine1.trim().length === 0) {
    errors.push("Address line 1 is required");
  }

  if (!city || city.trim().length === 0) {
    errors.push("City is required");
  }

  if (!pincode || !/^[0-9]{4,10}$/.test(pincode)) {
    errors.push("Valid pincode is required (4-10 digits)");
  }

  if (!contactName || contactName.trim().length === 0) {
    errors.push("Contact name is required");
  }

  if (!contactPhone || !/^[0-9]{10,15}$/.test(contactPhone)) {
    errors.push("Valid contact phone is required (10-15 digits)");
  }

  if (!country) {
    errors.push("Country is required");
  }

  if (!state) {
    errors.push("State is required");
  }

  if (!district) {
    errors.push("District is required");
  }

  if (type && !['home', 'work', 'billing', 'shipping', 'other'].includes(type)) {
    errors.push("Invalid address type");
  }

  return errors;
};

// Input validation for update operations (only validates provided fields)
const validateAddressUpdateInput = (req) => {
  const {
    type,
    addressLine1,
    city,
    pincode,
    contactName,
    contactPhone,
    country,
    state,
    district
  } = req.body;

  const errors = [];

  if (addressLine1 !== undefined && (!addressLine1 || addressLine1.trim().length === 0)) {
    errors.push("Address line 1 cannot be empty");
  }

  if (city !== undefined && (!city || city.trim().length === 0)) {
    errors.push("City cannot be empty");
  }

  if (pincode !== undefined && (!pincode || !/^[0-9]{4,10}$/.test(pincode))) {
    errors.push("Valid pincode is required (4-10 digits)");
  }

  if (contactName !== undefined && (!contactName || contactName.trim().length === 0)) {
    errors.push("Contact name cannot be empty");
  }

  if (contactPhone !== undefined && (!contactPhone || !/^[0-9]{10,15}$/.test(contactPhone))) {
    errors.push("Valid contact phone is required (10-15 digits)");
  }

  if (type !== undefined && !['home', 'work', 'billing', 'shipping', 'other'].includes(type)) {
    errors.push("Invalid address type");
  }

  return errors;
};

// Create new address
exports.createAddress = asyncHandler(async (req, res) => {
  // Validate input
  const validationErrors = validateAddressInput(req);
  if (validationErrors.length > 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      validationErrors.join(', '),
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const {
    type = 'home',
    addressLine1,
    addressLine2,
    landmark,
    city,
    pincode,
    contactName,
    contactPhone,
    contactEmail,
    country,
    state,
    district,
    instructions,
    isDefault = false
  } = req.body;

  // Get user info from request (set by auth middleware)
  const userId = req.user?.id || req.shopper?.id || req.seller?.id;
  // Determine userType based on role or context
  let userType = null;
  if (req.user?.role === 'admin') {
    userType = 'Admin';
  } else if (req.user?.role === 'shopper' || req.shopper) {
    userType = 'Shopper';
  } else if (req.user?.role === 'seller' || req.seller) {
    userType = 'Seller';
  }

  if (!userId || !userType) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      "User authentication required",
      ERROR_CODES.UNAUTHORIZED
    );
  }

  // Verify location references exist (all must be valid ObjectIds)
  // Validate country
  const countryDoc = await Country.findById(country);
  if (!countryDoc) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid country ID",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Validate state belongs to country
  const stateDoc = await State.findOne({ _id: state, country: countryDoc._id });
  if (!stateDoc) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid state ID or state does not belong to selected country",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Validate district belongs to state
  const districtDoc = await District.findOne({ _id: district, state: stateDoc._id });
  if (!districtDoc) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid district ID or district does not belong to selected state",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Use ObjectIds from found documents
  const countryId = countryDoc._id;
  const stateId = stateDoc._id;
  const districtId = districtDoc._id;

  // If setting as default, remove default flag from other addresses
  if (isDefault) {
    await Address.updateMany(
      { user: userId, userType: userType },
      { isDefault: false }
    );
  }

  const address = new Address({
    user: userId,
    userType: userType,
    type,
    addressLine1: addressLine1.trim(),
    addressLine2: addressLine2?.trim(),
    landmark: landmark?.trim(),
    city: city.trim(),
    pincode: pincode.trim(),
    contactName: contactName.trim(),
    contactPhone: contactPhone.trim(),
    contactEmail: contactEmail?.trim(),
    country: countryId,
    state: stateId,
    district: districtId,
    instructions: instructions?.trim(),
    isDefault
  });

  await address.save();
  await address.populate('country state district');

  return sendSuccessResponse(
    res,
    HTTP_STATUS.CREATED,
    "Address created successfully",
    address
  );
});

// Get all addresses for a user
exports.getUserAddresses = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.shopper?.id || req.seller?.id;
  // Determine userType based on role or context
  let userType = null;
  if (req.user?.role === 'admin') {
    userType = 'Admin';
  } else if (req.user?.role === 'shopper' || req.shopper) {
    userType = 'Shopper';
  } else if (req.user?.role === 'seller' || req.seller) {
    userType = 'Seller';
  }

  if (!userId || !userType) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      "User authentication required",
      ERROR_CODES.UNAUTHORIZED
    );
  }

  const addresses = await Address.getUserAddresses(userId, userType);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Addresses retrieved successfully",
    addresses
  );
});

// Get default address for a user
exports.getDefaultAddress = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.shopper?.id || req.seller?.id;
  // Determine userType based on role or context
  let userType = null;
  if (req.user?.role === 'admin') {
    userType = 'Admin';
  } else if (req.user?.role === 'shopper' || req.shopper) {
    userType = 'Shopper';
  } else if (req.user?.role === 'seller' || req.seller) {
    userType = 'Seller';
  }

  if (!userId || !userType) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      "User authentication required",
      ERROR_CODES.UNAUTHORIZED
    );
  }

  const address = await Address.getDefaultAddress(userId, userType);

  if (!address) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "No default address found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Default address retrieved successfully",
    address
  );
});

// Get address by ID
exports.getAddressById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || req.shopper?.id || req.seller?.id;
  // Determine userType based on role or context
  let userType = null;
  if (req.user?.role === 'admin') {
    userType = 'Admin';
  } else if (req.user?.role === 'shopper' || req.shopper) {
    userType = 'Shopper';
  } else if (req.user?.role === 'seller' || req.seller) {
    userType = 'Seller';
  }

  if (!userId || !userType) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      "User authentication required",
      ERROR_CODES.UNAUTHORIZED
    );
  }

  const address = await Address.findOne({
    _id: id,
    user: userId,
    userType: userType,
    isActive: true
  }).populate('country state district');

  if (!address) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Address not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Address retrieved successfully",
    address
  );
});

// Update address
exports.updateAddress = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || req.shopper?.id || req.seller?.id;
  // Determine userType based on role or context
  let userType = null;
  if (req.user?.role === 'admin') {
    userType = 'Admin';
  } else if (req.user?.role === 'shopper' || req.shopper) {
    userType = 'Shopper';
  } else if (req.user?.role === 'seller' || req.seller) {
    userType = 'Seller';
  }

  if (!userId || !userType) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      "User authentication required",
      ERROR_CODES.UNAUTHORIZED
    );
  }

  const address = await Address.findOne({
    _id: id,
    user: userId,
    userType: userType,
    isActive: true
  });

  if (!address) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Address not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Validate input if provided
  const validationErrors = validateAddressUpdateInput(req);
  if (validationErrors.length > 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      validationErrors.join(', '),
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const {
    type,
    addressLine1,
    addressLine2,
    landmark,
    city,
    pincode,
    contactName,
    contactPhone,
    contactEmail,
    country,
    state,
    district,
    instructions,
    isDefault
  } = req.body;

  // Handle location updates (country, state, district) - all must be valid ObjectIds
  if (country) {
    const countryDoc = await Country.findById(country);
    if (!countryDoc) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Invalid country ID",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }
    address.country = countryDoc._id;
  }

  if (state) {
    // Validate state belongs to country (if country is set)
    const stateQuery = address.country
      ? { _id: state, country: address.country }
      : { _id: state };
    const stateDoc = await State.findOne(stateQuery);
    if (!stateDoc) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Invalid state ID or state does not belong to selected country",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }
    address.state = stateDoc._id;
  }

  if (district) {
    // Validate district belongs to state (if state is set)
    const districtQuery = address.state
      ? { _id: district, state: address.state }
      : { _id: district };
    const districtDoc = await District.findOne(districtQuery);
    if (!districtDoc) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Invalid district ID or district does not belong to selected state",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }
    address.district = districtDoc._id;
  }

  // If setting as default, remove default flag from other addresses
  if (isDefault && !address.isDefault) {
    await Address.updateMany(
      { user: userId, userType: userType, _id: { $ne: id } },
      { isDefault: false }
    );
  }

  // Update fields
  if (type) address.type = type;
  if (addressLine1) address.addressLine1 = addressLine1.trim();
  if (addressLine2 !== undefined) address.addressLine2 = addressLine2?.trim();
  if (landmark !== undefined) address.landmark = landmark?.trim();
  if (city) address.city = city.trim();
  if (pincode) address.pincode = pincode.trim();
  if (contactName) address.contactName = contactName.trim();
  if (contactPhone) address.contactPhone = contactPhone.trim();
  if (contactEmail !== undefined) address.contactEmail = contactEmail?.trim();
  if (instructions !== undefined) address.instructions = instructions?.trim();
  if (isDefault !== undefined) address.isDefault = isDefault;

  await address.save();
  await address.populate('country state district');

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Address updated successfully",
    address
  );
});

// Delete address
exports.deleteAddress = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || req.shopper?.id || req.seller?.id;
  // Determine userType based on role or context
  let userType = null;
  if (req.user?.role === 'admin') {
    userType = 'Admin';
  } else if (req.user?.role === 'shopper' || req.shopper) {
    userType = 'Shopper';
  } else if (req.user?.role === 'seller' || req.seller) {
    userType = 'Seller';
  }

  if (!userId || !userType) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      "User authentication required",
      ERROR_CODES.UNAUTHORIZED
    );
  }

  const address = await Address.findOne({
    _id: id,
    user: userId,
    userType: userType,
    isActive: true
  });

  if (!address) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Address not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Deactivate instead of hard delete
  await address.deactivate();

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Address deleted successfully",
    { id: address._id }
  );
});

// Set address as default
exports.setDefaultAddress = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || req.shopper?.id || req.seller?.id;
  // Determine userType based on role or context
  let userType = null;
  if (req.user?.role === 'admin') {
    userType = 'Admin';
  } else if (req.user?.role === 'shopper' || req.shopper) {
    userType = 'Shopper';
  } else if (req.user?.role === 'seller' || req.seller) {
    userType = 'Seller';
  }

  if (!userId || !userType) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      "User authentication required",
      ERROR_CODES.UNAUTHORIZED
    );
  }

  const address = await Address.findOne({
    _id: id,
    user: userId,
    userType: userType,
    isActive: true
  });

  if (!address) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Address not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  await address.setAsDefault();
  await address.populate('country state district');

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Address set as default successfully",
    address
  );
});

// Get location data (countries, states, districts)
exports.getCountries = asyncHandler(async (req, res) => {
  const countries = await Country.find().sort({ name: 1 });

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Countries retrieved successfully",
    countries
  );
});

exports.getStatesByCountry = asyncHandler(async (req, res) => {
  const { countryId } = req.params;

  if (!countryId || !mongoose.Types.ObjectId.isValid(countryId)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Valid Country ID is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const states = await State.find({ country: countryId }).sort({ name: 1 });

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "States retrieved successfully",
    states
  );
});

exports.getDistrictsByState = asyncHandler(async (req, res) => {
  const { stateId } = req.params;

  if (!stateId || !mongoose.Types.ObjectId.isValid(stateId)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Valid State ID is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const districts = await District.find({ state: stateId }).sort({ name: 1 });

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Districts retrieved successfully",
    districts
  );
});
