const mongoose = require('mongoose');
const WeightClass = require('../models/WeightClass');

const WEIGHT_CLASS_REQUIRED_MESSAGE = 'Shipping Slab is required.';
const WEIGHT_CLASS_INVALID_MESSAGE = 'Shipping Slab is invalid or no longer exists.';
const WEIGHT_CLASS_INACTIVE_MESSAGE = 'Shipping Slab is inactive.';
const WEIGHT_CLASS_NAME_NOT_FOUND_MESSAGE = 'Shipping Slab name not found.';
const WEIGHT_CLASS_NAME_AMBIGUOUS_MESSAGE =
  'Shipping Slab name is ambiguous; use WeightClass ID.';
const WEIGHT_CLASS_ID_INVALID_MESSAGE = 'Shipping Slab ID is invalid.';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isEmptyWeightClassInput(value) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'null' ||
    value === 'undefined'
  );
}

function isStrictObjectIdString(value) {
  if (value instanceof mongoose.Types.ObjectId) return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    mongoose.Types.ObjectId.isValid(trimmed) &&
    String(new mongoose.Types.ObjectId(trimmed)) === trimmed
  );
}

/**
 * Validate product weightClass (Shipping Slab) when provided.
 * @returns {Promise<{ valid: boolean, message?: string, value?: import('mongoose').Types.ObjectId|null }>}
 */
async function validateProductWeightClass(weightClassInput, { required = false } = {}) {
  if (isEmptyWeightClassInput(weightClassInput)) {
    if (required) {
      return { valid: false, message: WEIGHT_CLASS_REQUIRED_MESSAGE };
    }
    return { valid: true, value: null };
  }

  if (!isStrictObjectIdString(weightClassInput)) {
    return { valid: false, message: WEIGHT_CLASS_INVALID_MESSAGE };
  }

  const id =
    weightClassInput instanceof mongoose.Types.ObjectId
      ? weightClassInput
      : new mongoose.Types.ObjectId(String(weightClassInput).trim());

  const doc = await WeightClass.findById(id).lean();
  if (!doc) {
    return { valid: false, message: WEIGHT_CLASS_INVALID_MESSAGE };
  }
  if (!doc.active) {
    return { valid: false, message: WEIGHT_CLASS_INACTIVE_MESSAGE };
  }
  return { valid: true, value: doc._id };
}

/**
 * Resolve import weightClass by ObjectId or unique name (plan import contract).
 * @returns {Promise<{ ok: boolean, missing?: boolean, value?: import('mongoose').Types.ObjectId, message?: string }>}
 */
async function resolveWeightClassForImport(raw) {
  if (isEmptyWeightClassInput(raw)) {
    return { ok: true, missing: true, value: undefined };
  }

  const trimmed = String(raw).trim();

  if (isStrictObjectIdString(trimmed)) {
    const doc = await WeightClass.findById(trimmed).lean();
    if (!doc) {
      return { ok: false, message: WEIGHT_CLASS_ID_INVALID_MESSAGE };
    }
    if (!doc.active) {
      return { ok: false, message: WEIGHT_CLASS_INACTIVE_MESSAGE };
    }
    return { ok: true, value: doc._id };
  }

  const matches = await WeightClass.find({
    name: { $regex: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
  }).lean();

  if (matches.length === 0) {
    return { ok: false, message: WEIGHT_CLASS_NAME_NOT_FOUND_MESSAGE };
  }
  if (matches.length > 1) {
    return { ok: false, message: WEIGHT_CLASS_NAME_AMBIGUOUS_MESSAGE };
  }
  if (!matches[0].active) {
    return { ok: false, message: WEIGHT_CLASS_INACTIVE_MESSAGE };
  }
  return { ok: true, value: matches[0]._id };
}

module.exports = {
  validateProductWeightClass,
  resolveWeightClassForImport,
  WEIGHT_CLASS_REQUIRED_MESSAGE,
  WEIGHT_CLASS_INVALID_MESSAGE,
  WEIGHT_CLASS_INACTIVE_MESSAGE,
  WEIGHT_CLASS_NAME_NOT_FOUND_MESSAGE,
  WEIGHT_CLASS_NAME_AMBIGUOUS_MESSAGE,
  WEIGHT_CLASS_ID_INVALID_MESSAGE,
};
