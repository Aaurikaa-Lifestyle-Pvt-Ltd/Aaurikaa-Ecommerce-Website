const mongoose = require("mongoose");
const Seller = require("../models/Seller");
const Country = require("../models/location/Country");
const State = require("../models/location/State");
const District = require("../models/location/District");
const sendEmail = require("../utils/sendMail");
const { notifySellerStatusUpdate } = require("../utils/notificationService");
const { updateSellerApproval, bulkApproveSellers, getSellerApprovalHistory, getSellersByStatus } = require("../services/sellerApprovalService");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");
const CommissionConfigAudit = require("../models/CommissionConfigAudit");

// ✅ Helper: Get full file URL (handles both R2 URLs and local paths)
const getFileUrl = (req, filename) => {
  if (!filename) return "";

  // If it's already a full URL (R2 URL), return as is
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    return filename;
  }

  // If it's a local path, construct the full URL
  return `${req.protocol}://${req.get("host")}/uploads/sellers/${filename}`;
};

// ----------------------------------------------------------------
// 🟢 GET: All Sellers (Short Summary for Admin Listing)
// ----------------------------------------------------------------
exports.getAll = asyncHandler(async (req, res) => {
  const sellers = await Seller.find();
  const result = sellers.map((seller) => ({
    _id: seller._id,
    firstName: seller.firstName,
    lastName: seller.lastName,
    email: seller.email,
    username: seller.username,
    phone: seller.phone,
    shopName: seller.shopName,
    shopUrl: seller.shopUrl,
    commission: seller.commission,
    isApproved: seller.isApproved,
    status: seller.isApproved ? 'approved' : 'pending',
    profileImage: getFileUrl(req, seller.profileImage),
  }));

  return sendSuccessResponse(res, HTTP_STATUS.OK, 'Sellers fetched successfully', result);
});

// ----------------------------------------------------------------
// 🟢 GET: Seller by ID (Full Detail View)
// ----------------------------------------------------------------
exports.getById = async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id)
      .populate('approvalHistory.updatedBy', 'name email')
      .select('-password');

    if (!seller) return res.status(404).json({ message: "Seller not found" });

    // Handle both nested (address.country) and top-level (country) for backward compatibility
    const countryId = seller.address?.country || seller.country;
    const stateId = seller.address?.state || seller.state;
    const districtId = seller.address?.district || seller.district;

    const [country, state, district] = await Promise.all([
      countryId ? Country.findById(countryId) : null,
      stateId ? State.findById(stateId) : null,
      districtId ? District.findById(districtId) : null,
    ]);

    // Flatten address and bankAccount for frontend compatibility
    const flattenedData = {
      ...seller._doc,
      profileImage: getFileUrl(req, seller.profileImage),
      shopImage: getFileUrl(req, seller.shopImage),
      aadhaarFront: getFileUrl(req, seller.aadhaarFront),
      aadhaarBack: getFileUrl(req, seller.aadhaarBack),
      panCard: getFileUrl(req, seller.panCard),
      gst: getFileUrl(req, seller.gst),
      tradeLicense: getFileUrl(req, seller.tradeLicense),
      otherDocs: Array.isArray(seller.otherDocs)
        ? seller.otherDocs.map((doc) => getFileUrl(req, doc))
        : [],
      country: country ? { _id: country._id, name: country.name } : null,
      state: state ? { _id: state._id, name: state.name } : null,
      district: district ? { _id: district._id, name: district.name } : null,

      // Address flattening
      address1: seller.address?.address1,
      address2: seller.address?.address2,
      pincode: seller.address?.pincode,

      // Bank Account flattening
      accountHolderName: seller.bankAccount?.accountHolderName,
      accountNumber: seller.bankAccount?.accountNumber,
      ifscCode: seller.bankAccount?.ifscCode,
      bankName: seller.bankAccount?.bankName,
      branch: seller.bankAccount?.branch,
      accountType: seller.bankAccount?.accountType,
      upiId: seller.bankAccount?.upiId,
    };

    res.json(flattenedData);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch seller", error: err.message });
  }
};

// ----------------------------------------------------------------
// 🟢 POST: Create Seller (Manual / Admin Use)
// ----------------------------------------------------------------
exports.create = async (req, res) => {
  try {
    const data = JSON.parse(JSON.stringify(req.body));
    const seller = new Seller(data);
    await seller.save();
    res.status(201).json(seller);
  } catch (err) {
    res.status(500).json({ message: "Failed to create seller", error: err.message });
  }
};

// ----------------------------------------------------------------
// 🟢 PUT: Update Seller Info (with file upload support)
// ----------------------------------------------------------------
exports.update = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID");
    }

    const updateData = {};

    // 1. Basic Information
    const basicFields = [
      "firstName", "lastName", "username", "email", "phone",
      "shopName", "shopUrl", "commission", "commissionType", "commissionAmount",
      "isApproved", "isVerified", "role"
    ];

    basicFields.forEach(field => {
      if (req.body[field] !== undefined) {
        // Only update if not empty string (except for fields where empty is valid)
        if (req.body[field] !== "" || ["firstName", "lastName"].includes(field)) {
          updateData[field] = req.body[field];
        }
      }
    });

    // 2. Extract Category Commission
    if (req.body.categoryCommission) {
      try {
        updateData.categoryCommission = typeof req.body.categoryCommission === 'string'
          ? JSON.parse(req.body.categoryCommission)
          : req.body.categoryCommission;
      } catch (e) {
        console.error("❌ Failed to parse categoryCommission:", e);
      }
    }

    // 3. Handle Address (Using dot notation to prevent overwriting whole object)
    const flatAddressFields = ["address1", "address2", "pincode"];
    flatAddressFields.forEach(field => {
      const val = req.body[field] || req.body[`address[${field}]`];
      if (val !== undefined) updateData[`address.${field}`] = val;
    });

    // Handle Location ObjectIDs safely
    const locationFields = ["country", "state", "district"];
    locationFields.forEach(field => {
      let val = req.body[field] || req.body[`address[${field}]`];

      // If the value is an object, extract the ID
      if (val && typeof val === 'object' && val._id) {
        val = val._id;
      }

      if (val && val !== "" && val !== "null") {
        if (mongoose.Types.ObjectId.isValid(val)) {
          updateData[`address.${field}`] = val;
        } else {
          console.warn(`⚠️ Invalid ObjectId for ${field}:`, val);
        }
      } else if (val === "" || val === "null") {
        updateData[`address.${field}`] = null;
      }
    });

    // 4. Handle Bank Account (Using dot notation to prevent overwriting whole object)
    const bankFields = [
      "accountHolderName", "accountNumber", "ifscCode",
      "bankName", "branch", "accountType", "upiId"
    ];

    bankFields.forEach(field => {
      const val = req.body[field] || req.body[`bankAccount[${field}]`];
      if (val !== undefined) updateData[`bankAccount.${field}`] = val;
    });

    // Handle account number confirmation manually in controller if confirm field is provided
    const confirmNum = req.body.accountNumberConfirm || req.body.confirmAccountNumber;
    if ((req.body.accountNumber || req.body["bankAccount[accountNumber]"]) && confirmNum) {
      if ((req.body.accountNumber || req.body["bankAccount[accountNumber]"]) !== confirmNum) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Account numbers do not match");
      }
    }

    // 5. Handle File Uploads (Safe update)
    if (req.files) {
      const fileMappings = {
        shopImage: "shopImage",
        aadhaarFront: "aadhaarFront",
        aadhaarBack: "aadhaarBack",
        tradeLicense: "tradeLicense",
        panCard: "panCard",
        gst: "gst"
      };

      Object.entries(fileMappings).forEach(([reqKey, schemaKey]) => {
        if (req.files[reqKey]?.[0]) {
          updateData[schemaKey] = req.files[reqKey][0].filename || req.files[reqKey][0].r2PublicUrl;
        }
      });

      if (req.files.profileImage?.[0]) {
        updateData.profileImage = req.files.profileImage[0].filename || req.files.profileImage[0].r2PublicUrl;
      }

      if (req.files.otherDocs && req.files.otherDocs.length > 0) {
        updateData.otherDocs = req.files.otherDocs.map(doc => doc.filename || doc.r2PublicUrl);
      }
    }


    const updated = await Seller.findByIdAndUpdate(
      sellerId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Seller not found");
    }

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Seller updated successfully', updated);

  } catch (err) {
    console.error("❌ Seller Update Error:", err);
    console.error("Error Stack:", err.stack);
    return sendErrorResponse(
      res,
      err.name === 'ValidationError' ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.INTERNAL_SERVER_ERROR,
      err.message || "Failed to update seller",
      null,
      err.errors
    );
  }
});

// ----------------------------------------------------------------
// 🔴 DELETE: Remove Seller
// ----------------------------------------------------------------
exports.delete = async (req, res) => {
  try {
    await Seller.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Seller deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete seller", error: err.message });
  }
};

// ----------------------------------------------------------------
// 🔁 PATCH: Update Seller Status (active/inactive/etc.)
// ----------------------------------------------------------------
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    seller.isApproved = status === "approved";
    await seller.save();

    res.json({ message: "Status updated", seller });
  } catch (err) {
    res.status(500).json({ message: "Failed to update status", error: err.message });
  }
};

// ----------------------------------------------------------------
// 💰 PATCH: Update Commission & Category-wise Commission
// ----------------------------------------------------------------
exports.updateSellerCommission = async (req, res) => {
  try {
    const { commission, categoryCommission } = req.body;
    const updated = await Seller.findByIdAndUpdate(
      req.params.id,
      { commission, categoryCommission },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Seller not found" });

    res.status(200).json({ message: "Commission updated", seller: updated });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ----------------------------------------------------------------
// ✅ PATCH: Approve / Reject Seller with Reason & Email (Unified)
// ----------------------------------------------------------------
exports.updateSellerApproval = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let { isApproved, reason } = req.body;
  const adminId = req.adminUser?._id || req.user?._id || req.user?.id;

  // Validate seller ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid seller ID",
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  // Convert string boolean to actual boolean
  if (typeof isApproved === "string") {
    isApproved = isApproved.toLowerCase() === "true";
  }

  // Use unified approval service
  const result = await updateSellerApproval(id, isApproved, reason, adminId);

  if (!result.success) {
    return sendErrorResponse(
      res,
      result.error === ERROR_MESSAGES.SELLER_NOT_FOUND ? HTTP_STATUS.NOT_FOUND : HTTP_STATUS.BAD_REQUEST,
      result.error,
      result.code
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    result.data.message,
    result.data
  );
});

// ----------------------------------------------------------------
// 🔁 POST: Bulk Approve Sellers (Unified)
// ----------------------------------------------------------------
exports.bulkApproveSellers = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  const adminId = req.adminUser?._id || req.user?._id || req.user?.id;

  // Use unified bulk approval service
  const result = await bulkApproveSellers(ids, adminId);

  if (!result.success) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      result.error,
      result.code
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    result.data.message,
    result.data
  );
});

// ----------------------------------------------------------------
// 🔍 EXTRA: Optional - Sorted Seller Fetch
// ----------------------------------------------------------------
exports.getAllSellersSorted = async (req, res) => {
  try {
    const sellers = await Seller.find().sort({ createdAt: -1 });
    res.json(sellers);
  } catch (err) {
    res.status(500).json({ message: "Error fetching sellers" });
  }
};

// ----------------------------------------------------------------
// 🔵 UPDATE: Seller Default Commission
// ----------------------------------------------------------------
exports.updateSellerCommission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { commission, commissionType, commissionAmount, reason } = req.body;
  const adminId = req.user._id;

  const seller = await Seller.findById(id);
  if (!seller) {
    return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Seller not found");
  }

  const changes = [];
  if (commission !== undefined && seller.commission !== commission) {
    changes.push({ field: 'commission', oldValue: seller.commission, newValue: commission });
    seller.commission = commission;
  }
  if (commissionType !== undefined && seller.commissionType !== commissionType) {
    changes.push({ field: 'commissionType', oldValue: seller.commissionType, newValue: commissionType });
    seller.commissionType = commissionType;
  }
  if (commissionAmount !== undefined && seller.commissionAmount !== commissionAmount) {
    changes.push({ field: 'commissionAmount', oldValue: seller.commissionAmount, newValue: commissionAmount });
    seller.commissionAmount = commissionAmount;
  }

  if (changes.length > 0) {
    await seller.save();

    // Audit Logging
    await CommissionConfigAudit.create({
      entityType: 'Seller',
      entityId: id,
      changes,
      changedBy: adminId,
      reason,
      metadata: { ipAddress: req.ip, userAgent: req.get('User-Agent') }
    });
  }

  sendSuccessResponse(res, HTTP_STATUS.OK, "Seller commission updated", { seller });
});

// ----------------------------------------------------------------
// 🔵 UPDATE: Seller Category Override
// ----------------------------------------------------------------
exports.updateSellerCategoryOverride = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { categoryId, commissionRate, commissionType, commissionAmount, reason } = req.body;
  const adminId = req.user._id;

  const seller = await Seller.findById(id);
  if (!seller) return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Seller not found");

  if (!seller.categoryCommission) seller.categoryCommission = [];

  const index = seller.categoryCommission.findIndex(cc => cc.categoryId.toString() === categoryId);
  const oldVal = index > -1 ? seller.categoryCommission[index] : null;

  const newVal = {
    categoryId,
    commissionRate,
    commissionType,
    commissionAmount
  };

  if (index > -1) {
    seller.categoryCommission[index] = newVal;
  } else {
    seller.categoryCommission.push(newVal);
  }

  await seller.save();

  // Audit Logging
  await CommissionConfigAudit.create({
    entityType: 'Seller',
    entityId: id,
    changes: [{
      field: 'categoryCommission',
      oldValue: oldVal,
      newValue: newVal
    }],
    changedBy: adminId,
    reason,
    metadata: { ipAddress: req.ip, userAgent: req.get('User-Agent') }
  });

  sendSuccessResponse(res, HTTP_STATUS.OK, "Seller category override updated", { seller });
});
