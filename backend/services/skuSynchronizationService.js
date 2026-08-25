const mongoose = require('mongoose');
const Product = require('../models/Product');
const Review = require('../models/Review');

const PROMOTION_FIELDS = ['upsellSkus', 'crossSellSkus', 'boughtTogetherSkus'];
const VALID_SOURCES = ['admin_update', 'regenerate', 'admin_autosave', 'admin_publish'];

class SkuSyncValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SkuSyncValidationError';
    this.statusCode = 400;
    this.rollbackPerformed = false;
  }
}

class SkuSyncConflictError extends Error {
  constructor(message, rollbackPerformed = false) {
    super(message);
    this.name = 'SkuSyncConflictError';
    this.statusCode = 409;
    this.rollbackPerformed = rollbackPerformed;
  }
}

class SkuSyncOperationError extends Error {
  constructor(message, rollbackPerformed = false) {
    super(message);
    this.name = 'SkuSyncOperationError';
    this.statusCode = 500;
    this.rollbackPerformed = rollbackPerformed;
  }
}

function buildReplaceSkuPipeline(field, fromSku, toSku) {
  return [
    {
      $set: {
        [field]: {
          $map: {
            input: { $ifNull: [`$${field}`, []] },
            as: 's',
            in: { $cond: [{ $eq: ['$$s', fromSku] }, toSku, '$$s'] },
          },
        },
      },
    },
  ];
}

function cloneArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

async function capturePromotionSnapshots(field, oldSku) {
  const products = await Product.find({ [field]: oldSku })
    .select(`_id ${field}`)
    .lean();

  return products.map((product) => ({
    productId: product._id,
    previousArray: cloneArray(product[field]),
  }));
}

async function assertSkuAvailable(newSku, excludeProductId) {
  const baseConflict = await Product.findOne({
    _id: { $ne: excludeProductId },
    sku: newSku,
  })
    .select('_id sku')
    .lean();

  if (baseConflict) {
    throw new SkuSyncValidationError(
      `SKU "${newSku}" already exists on another product.`
    );
  }

  const selfProduct = await Product.findById(excludeProductId)
    .select('variantSku')
    .lean();

  if (selfProduct?.variantSku && typeof selfProduct.variantSku === 'object') {
    const ownVariantSkus = Object.values(selfProduct.variantSku)
      .map((sku) => String(sku || '').trim())
      .filter(Boolean);

    if (ownVariantSkus.includes(newSku)) {
      throw new SkuSyncValidationError(
        `SKU "${newSku}" is already used as a variant SKU on this product.`
      );
    }
  }

  const variantConflict = await Product.aggregate([
    {
      $match: {
        _id: { $ne: new mongoose.Types.ObjectId(String(excludeProductId)) },
        variantSku: { $exists: true, $type: 'object' },
      },
    },
    { $project: { variantValues: { $objectToArray: '$variantSku' } } },
    { $unwind: '$variantValues' },
    { $match: { 'variantValues.v': newSku } },
    { $limit: 1 },
    { $project: { _id: 1 } },
  ]);

  if (variantConflict.length > 0) {
    throw new SkuSyncValidationError(
      `SKU "${newSku}" already exists as a variant SKU on another product.`
    );
  }
}

async function assertNoAmbiguousPromotionRename(oldSku, newSku) {
  for (const field of PROMOTION_FIELDS) {
    const ambiguousProduct = await Product.findOne({
      [field]: { $all: [oldSku, newSku] },
    })
      .select('_id name')
      .lean();

    if (ambiguousProduct) {
      logSkuSync('error', {
        event: 'sku_synchronization_validation_rejected',
        reason: 'ambiguous_promotion_array',
        productId: ambiguousProduct._id,
        productName: ambiguousProduct.name,
        field,
        oldSku,
        newSku,
        rollbackPerformed: false,
      });

      throw new SkuSyncValidationError(
        `Cannot rename SKU "${oldSku}" to "${newSku}": product "${ambiguousProduct.name}" contains both values in ${field}. Resolve the conflicting promotion reference before renaming.`
      );
    }
  }
}

async function updatePromotionField(field, fromSku, toSku) {
  const result = await Product.updateMany(
    { [field]: fromSku },
    buildReplaceSkuPipeline(field, fromSku, toSku)
  );
  return result.modifiedCount || 0;
}

async function restorePromotionSnapshots(step) {
  for (const snapshot of step.snapshots || []) {
    await Product.updateOne(
      { _id: snapshot.productId },
      { $set: { [step.field]: snapshot.previousArray } }
    );
  }
}

async function compensatingRollback(completedSteps) {
  const errors = [];

  for (let i = completedSteps.length - 1; i >= 0; i -= 1) {
    const step = completedSteps[i];
    try {
      if (step.type === 'product_sku') {
        await Product.updateOne(
          { _id: step.productId, sku: step.newSku },
          { $set: { sku: step.oldSku } }
        );
      } else if (step.type === 'reviews') {
        await Review.updateMany(
          { product: step.productId },
          { $set: { productSku: step.oldSku } }
        );
      } else if (step.type === 'product_refs') {
        await restorePromotionSnapshots(step);
      }
    } catch (rollbackErr) {
      errors.push({ step, error: rollbackErr.message });
    }
  }

  return errors;
}

function remapPromotionSkuReferences(promotionArrays, oldSku, newSku) {
  const remapped = {};
  for (const field of PROMOTION_FIELDS) {
    if (!Array.isArray(promotionArrays[field])) continue;
    remapped[field] = promotionArrays[field].map((sku) => {
      const trimmed = String(sku || '').trim();
      return trimmed === oldSku ? newSku : trimmed;
    });
  }
  return remapped;
}

function logSkuSync(level, payload) {
  const entry = {
    level,
    event: 'sku_synchronization',
    ...payload,
    timestamp: new Date().toISOString(),
  };
  if (level === 'error') {
    console.error('[skuSynchronizationService]', JSON.stringify(entry));
  } else {
    console.info('[skuSynchronizationService]', JSON.stringify(entry));
  }
}

/**
 * Propagate base SKU change across promotion arrays and Review.productSku.
 * Product.sku is updated LAST with optimistic concurrency guard.
 */
async function synchronizeSkuChange(input) {
  const productId = input?.productId;
  const oldSku = String(input?.oldSku || '').trim();
  const newSku = String(input?.newSku || '').trim();
  const changedBy = input?.changedBy;
  const source = input?.source;

  if (!productId || !mongoose.Types.ObjectId.isValid(String(productId))) {
    throw new SkuSyncValidationError('Valid productId is required.');
  }
  if (!oldSku || !newSku) {
    throw new SkuSyncValidationError('oldSku and newSku are required.');
  }
  if (oldSku === newSku) {
    throw new SkuSyncValidationError('oldSku and newSku must differ.');
  }
  if (!VALID_SOURCES.includes(source)) {
    throw new SkuSyncValidationError(`source must be one of: ${VALID_SOURCES.join(', ')}`);
  }

  await assertSkuAvailable(newSku, productId);

  const product = await Product.findById(productId).select('_id sku').lean();
  if (!product) {
    throw new SkuSyncValidationError('Product not found.');
  }
  if (String(product.sku || '').trim() !== oldSku) {
    throw new SkuSyncConflictError('Product SKU changed concurrently.');
  }

  await assertNoAmbiguousPromotionRename(oldSku, newSku);

  const completedSteps = [];
  const counts = {
    upsellSkus: 0,
    crossSellSkus: 0,
    boughtTogetherSkus: 0,
    reviews: 0,
  };

  try {
    for (const field of PROMOTION_FIELDS) {
      const snapshots = await capturePromotionSnapshots(field, oldSku);
      counts[field] = await updatePromotionField(field, oldSku, newSku);
      completedSteps.push({ type: 'product_refs', field, snapshots, oldSku, newSku });
    }

    const reviewResult = await Review.updateMany(
      { product: productId },
      { $set: { productSku: newSku } }
    );
    counts.reviews = reviewResult.modifiedCount || 0;
    completedSteps.push({ type: 'reviews', productId, oldSku, newSku });

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: productId, sku: oldSku },
      { $set: { sku: newSku } },
      { new: true }
    );

    if (!updatedProduct) {
      throw new SkuSyncConflictError('Product SKU changed concurrently during sync.');
    }

    completedSteps.push({ type: 'product_sku', productId, oldSku, newSku });

    const result = {
      success: true,
      productId,
      oldSku,
      newSku,
      referencesUpdated: counts,
      warnings: [],
      rollbackPerformed: false,
    };

    logSkuSync('info', {
      source,
      productId,
      oldSku,
      newSku,
      referencesUpdated: counts,
      adminId: changedBy,
      rollbackPerformed: false,
    });

    return result;
  } catch (err) {
    const rollbackErrors = await compensatingRollback(completedSteps);
    const rollbackPerformed = completedSteps.length > 0;

    logSkuSync('error', {
      source,
      productId,
      oldSku,
      newSku,
      referencesUpdated: counts,
      adminId: changedBy,
      rollbackPerformed,
      error: err.message,
      rollbackErrors,
    });

    if (err instanceof SkuSyncValidationError || err instanceof SkuSyncConflictError) {
      err.rollbackPerformed = rollbackPerformed;
      throw err;
    }

    throw new SkuSyncOperationError(err.message, rollbackPerformed);
  }
}

module.exports = {
  synchronizeSkuChange,
  assertSkuAvailable,
  assertNoAmbiguousPromotionRename,
  compensatingRollback,
  capturePromotionSnapshots,
  remapPromotionSkuReferences,
  SkuSyncValidationError,
  SkuSyncConflictError,
  SkuSyncOperationError,
  PROMOTION_FIELDS,
};
