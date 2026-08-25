const Admin = require("../models/Admin");
const { validatePermissionKeys } = require("../utils/adminPermissions");
const {
  isValidAdminPassword,
  ADMIN_PASSWORD_MESSAGE,
} = require("../utils/adminPasswordPolicy");
const { getPermissionCatalogForUi } = require("../config/adminPermissionCatalog");
const {
  sendErrorResponse,
  sendSuccessResponse,
  ERROR_MESSAGES,
  ERROR_CODES,
  HTTP_STATUS,
  asyncHandler,
} = require("../utils/errorHandler");

const formatStaffUser = (admin) => ({
  id: admin._id,
  name: admin.name,
  username: admin.username,
  email: admin.email,
  phone: admin.phone || null,
  profileImage: admin.profileImage || null,
  isSuperAdmin: admin.isSuperAdmin ?? false,
  isActive: admin.isActive ?? true,
  permissions: admin.isSuperAdmin ? [] : admin.permissions || [],
  displayLabel: admin.displayLabel || null,
  createdBy: admin.createdBy || null,
  lastLogin: admin.lastLogin || null,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
});

const permissionsChanged = (current, next) => {
  const a = [...(current || [])].sort();
  const b = [...(next || [])].sort();
  if (a.length !== b.length) return true;
  return a.some((key, index) => key !== b[index]);
};

exports.getPermissionCatalog = asyncHandler(async (req, res) => {
  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Permission catalog retrieved",
    getPermissionCatalogForUi()
  );
});

exports.listStaffUsers = asyncHandler(async (req, res) => {
  const users = await Admin.find().select("-password").sort({ createdAt: -1 });

  return sendSuccessResponse(res, HTTP_STATUS.OK, "Admin users retrieved", {
    users: users.map(formatStaffUser),
  });
});

exports.createStaffUser = asyncHandler(async (req, res) => {
  const { name, username, email, phone, password, permissions, displayLabel } =
    req.body;

  if (!name || !username || !email || !password) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Name, username, email, and password are required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  if (!isValidAdminPassword(password)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_PASSWORD_FORMAT,
      ERROR_CODES.VALIDATION_FAILED,
      { validationErrors: [ADMIN_PASSWORD_MESSAGE] }
    );
  }

  const permissionList = permissions || [];
  const validation = validatePermissionKeys(permissionList);
  if (!validation.valid) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      `Invalid permission keys: ${validation.invalid.join(", ")}`,
      ERROR_CODES.VALIDATION_FAILED,
      { invalid: validation.invalid }
    );
  }

  const exists = await Admin.findOne({
    $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
  });
  if (exists) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      exists.email === email.toLowerCase()
        ? ERROR_MESSAGES.EMAIL_ALREADY_EXISTS
        : ERROR_MESSAGES.USERNAME_ALREADY_EXISTS,
      ERROR_CODES.RESOURCE_ALREADY_EXISTS
    );
  }

  const newAdmin = new Admin({
    name,
    username,
    email,
    phone,
    password,
    permissions: permissionList,
    displayLabel: displayLabel || undefined,
    isSuperAdmin: false,
    isActive: true,
    createdBy: req.adminUser._id,
  });

  await newAdmin.save();

  return sendSuccessResponse(
    res,
    HTTP_STATUS.CREATED,
    "Staff account created successfully",
    { user: formatStaffUser(newAdmin) }
  );
});

exports.updateStaffUser = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.params.id);

  if (!admin) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.ADMIN_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  const {
    name,
    phone,
    password,
    permissions,
    displayLabel,
    isActive,
  } = req.body;

  const restrictedFieldsProvided =
    permissions !== undefined ||
    isActive !== undefined ||
    password !== undefined;

  if (admin.isSuperAdmin && restrictedFieldsProvided) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      "Super Admin accounts cannot be modified via staff management",
      ERROR_CODES.AUTH_ACCESS_DENIED
    );
  }

  if (
    isActive === false &&
    admin._id.toString() === req.adminUser._id.toString()
  ) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "You cannot deactivate your own account",
      ERROR_CODES.BUSINESS_RULE_VIOLATION
    );
  }

  let shouldBumpTokenVersion = false;

  if (permissions !== undefined) {
    const validation = validatePermissionKeys(permissions);
    if (!validation.valid) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        `Invalid permission keys: ${validation.invalid.join(", ")}`,
        ERROR_CODES.VALIDATION_FAILED,
        { invalid: validation.invalid }
      );
    }

    if (permissionsChanged(admin.permissions, permissions)) {
      shouldBumpTokenVersion = true;
    }
    admin.permissions = permissions;
  }

  if (isActive !== undefined && isActive !== admin.isActive) {
    admin.isActive = isActive;
    shouldBumpTokenVersion = true;
  }

  if (password?.trim()) {
    if (!isValidAdminPassword(password)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.INVALID_PASSWORD_FORMAT,
        ERROR_CODES.VALIDATION_FAILED,
        { validationErrors: [ADMIN_PASSWORD_MESSAGE] }
      );
    }
    admin.password = password;
    shouldBumpTokenVersion = true;
  }

  if (displayLabel !== undefined) {
    admin.displayLabel = displayLabel || undefined;
  }

  if (name) admin.name = name;
  if (phone !== undefined) admin.phone = phone;

  if (shouldBumpTokenVersion) {
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  }

  await admin.save();

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Staff account updated successfully",
    { user: formatStaffUser(admin) }
  );
});
