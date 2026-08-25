// backend/utils/productImportExport/bulkImportOrchestrator.js
const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../../models/Product');
const ImportBatch = require('../../models/ImportBatch');
const { validateProductRows } = require('../bulkUploadValidator');
const { convertProductRows } = require('../bulkUploadTypeConverter');
const { generateSku } = require('../skuGenerator');
const { generateUniqueSlug } = require('../slugUtils');
const { parseUploadFile, getContractVersionFromRows } = require('./parseUploadFile');
const { withImportLock } = require('./importLock');
const { validateRowsGovernance } = require('./productImportGovernance');
const { loadGlobalSkuSet, extractVariantSkuValues } = require('./variantSkuCollision');
const { BULK_INSERT_CHUNK_SIZE, MIXED_VARIANT_PATHS } = require('./constants');

async function cleanupBatch(batchId) {
  if (!batchId) return;
  await Product.deleteMany({ batchId });
  await ImportBatch.findByIdAndDelete(batchId);
}

async function loadUpsertIgnoreSkuSet(rows) {
  const productSkus = rows
    .map((row) => String(row.sku || '').trim())
    .filter(Boolean);
  if (!productSkus.length) return new Set();
  const existing = await Product.find({ sku: { $in: productSkus } })
    .select('sku variantSku')
    .lean();
  const ignore = new Set();
  for (const product of existing) {
    if (product.sku && String(product.sku).trim()) {
      ignore.add(String(product.sku).trim());
    }
    extractVariantSkuValues(product.variantSku).forEach((sku) => ignore.add(sku));
  }
  return ignore;
}

function invalidRowNumbers(invalidRows) {
  return new Set(
    (invalidRows || [])
      .map((item) => Number(item.rowIndex) || Number(item.row) || 0)
      .filter(Boolean)
  );
}

async function loadExistingProductSkuSet(rows) {
  const productSkus = rows
    .map((row) => String(row.sku || '').trim())
    .filter(Boolean);
  if (!productSkus.length) return new Set();
  const existing = await Product.find({ sku: { $in: productSkus } }).select('sku').lean();
  return new Set(existing.map((p) => String(p.sku).trim()).filter(Boolean));
}

function classifyRowActions(rows, existingSkuSet, invalidRowNums) {
  let created = 0;
  let updated = 0;
  rows.forEach((row, index) => {
    if (invalidRowNums.has(index + 1)) return;
    const sku = String(row.sku || '').trim();
    if (sku && existingSkuSet.has(sku)) {
      updated += 1;
    } else {
      created += 1;
    }
  });
  return { created, updated };
}

async function persistProducts(rows, batchId, session) {
  const opts = session ? { session, ordered: true } : { ordered: true };
  for (let i = 0; i < rows.length; i += BULK_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BULK_INSERT_CHUNK_SIZE);
    await Product.insertMany(chunk, opts);
  }
}

async function tryTransactionalPersist(batchDoc, rows) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await batchDoc.save({ session });
      await persistProducts(rows, batchDoc._id, session);
    });
    return { usedTransaction: true };
  } finally {
    session.endSession();
  }
}

async function compensatingPersist(batchDoc, rows) {
  await batchDoc.save();
  try {
    await persistProducts(rows, batchDoc._id, null);
  } catch (err) {
    await cleanupBatch(batchDoc._id);
    throw err;
  }
  return { usedTransaction: false };
}

async function normalizeRows(validRows, options) {
  const { sellerId, role, autoPublish, autoApproveBatch } = options;
  const batchSkus = validRows.map((r) => r.sku).filter(Boolean);
  const existingSlugs = await Product.find({ slug: { $exists: true, $ne: null, $ne: '' } })
    .select('slug')
    .lean();
  const takenSlugs = new Set(existingSlugs.map((d) => d.slug).filter(Boolean));

  const Seller = mongoose.model('Seller');
  const Category = mongoose.model('Category');

  for (const row of validRows) {
    if (row.status === 'published') {
      if (!row.seo?.primaryKeyword) {
        row.status = 'draft';
        delete row.approvalStatus;
      } else if (role === 'Admin' && autoPublish) {
        // WS-1 regression guard: do not demote on duplicate primary keyword.
        row.approvalStatus = 'approved';
      }
    }

    if (!row.sku || String(row.sku).trim() === '') {
      const seller = await Seller.findById(row.seller);
      const category = await Category.findById(row.category);
      row.sku = await generateSku({
        product: row,
        category,
        seller,
        excludeSkus: batchSkus,
      });
      batchSkus.push(row.sku);
    }

    if (row.slug === undefined || row.slug === null || row.slug === '') {
      const gen = generateUniqueSlug({ input: row.name, taken: takenSlugs });
      if (gen.ok) row.slug = gen.slug;
      if (gen.slug) takenSlugs.add(gen.slug);
    }

    if (role === 'Seller') {
      row.status = 'draft';
      row.approvalStatus = 'pending';
      row.importDecision = 'PENDING';
    } else {
      row.importDecision = autoApproveBatch ? 'APPROVED' : 'PENDING';
      if (autoPublish && autoApproveBatch && row.weightClass) {
        row.status = 'published';
        row.approvalStatus = 'approved';
      } else {
        row.status = 'draft';
        row.approvalStatus = 'pending';
      }
    }
  }
}

async function applyUpsert(validRows, batchId) {
  const results = { inserted: 0, updated: 0, skipped: 0 };
  for (const row of validRows) {
    const sku = String(row.sku || '').trim();
    if (!sku) continue;
    row.batchId = batchId;
    const existing = await Product.findOne({ sku });
    if (existing) {
      const update = { ...row };
      delete update._id;
      Object.keys(update).forEach((key) => {
        if (update[key] !== undefined) {
          existing[key] = update[key];
          if (MIXED_VARIANT_PATHS.includes(key)) {
            existing.markModified(key);
          }
        }
      });
      await existing.save();
      results.updated++;
    } else {
      await Product.create(row);
      results.inserted++;
    }
  }
  return results;
}

/**
 * @param {Object} params
 * @param {Object} params.file - multer file
 * @param {mongoose.Types.ObjectId} params.uploaderId
 * @param {'Admin'|'Seller'} params.role
 * @param {mongoose.Types.ObjectId} params.sellerId - assigned seller/owner
 * @param {'create'|'upsert'|'validate'} [params.mode='create']
 * @param {boolean} [params.autoPublish=false]
 * @param {boolean} [params.autoApproveBatch=false]
 */
async function runBulkImport(params) {
  const {
    file,
    uploaderId,
    role,
    sellerId,
    mode = 'create',
    autoPublish = false,
    autoApproveBatch = false,
  } = params;

  const lockKey = `${role.toLowerCase()}:${uploaderId}`;

  return withImportLock(lockKey, async () => {
    const rawRows = await parseUploadFile(file);
    if (!rawRows.length) {
      const err = new Error('Import file contains no data');
      err.code = 'EMPTY_FILE';
      throw err;
    }

    const contractVersion = getContractVersionFromRows(rawRows);
    const convertedRows = await convertProductRows(rawRows, sellerId);

    const upsertIgnoreSkuSet =
      mode === 'upsert' ? await loadUpsertIgnoreSkuSet(convertedRows) : new Set();

    const legacyValidation = await validateProductRows(convertedRows, sellerId, { mode });
    const dbSkuSet = await loadGlobalSkuSet();
    const governance = validateRowsGovernance(
      convertedRows,
      contractVersion,
      dbSkuSet,
      upsertIgnoreSkuSet
    );

    const allErrors = [...legacyValidation.errors, ...governance.errors];
    const allWarnings = [...(legacyValidation.warnings || []), ...governance.warnings];
    const invalidRows = [...legacyValidation.invalidRows, ...governance.invalidRows];
    const invalidRowNums = invalidRowNumbers(invalidRows);
    const existingProductSkus = await loadExistingProductSkuSet(convertedRows);
    const actions = classifyRowActions(convertedRows, existingProductSkus, invalidRowNums);
    const validCount = Math.max(0, rawRows.length - invalidRowNums.size);

    const validationReport = {
      contractVersion,
      summary: {
        total: rawRows.length,
        valid: validCount,
        invalid: invalidRowNums.size,
        warnings: allWarnings.length,
        newRecords: actions.created,
        updates: actions.updated,
        skipped: 0,
      },
      errors: allErrors,
      warnings: allWarnings,
      invalidRows,
    };

    if (!legacyValidation.isValid || !governance.isValid) {
      const err = new Error('Validation failed');
      err.code = 'VALIDATION_FAILED';
      err.validationReport = validationReport;
      throw err;
    }

    const validRows = legacyValidation.validRows;

    if (mode === 'validate') {
      return {
        dryRun: true,
        validationReport,
        summary: validationReport.summary,
      };
    }

    if (mode === 'create') {
      for (const row of validRows) {
        const sku = String(row.sku || '').trim();
        if (sku && (await Product.exists({ sku }))) {
          const err = new Error(`SKU "${sku}" already exists in the database`);
          err.code = 'DUPLICATE_SKU';
          err.validationReport = validationReport;
          throw err;
        }
      }
    }

    const fileHash = file.buffer
      ? crypto.createHash('sha256').update(file.buffer).digest('hex')
      : undefined;

    const batch = new ImportBatch({
      uploader: uploaderId,
      role,
      productCount: validRows.length,
      status: role === 'Admin' && autoApproveBatch ? 'APPROVED' : 'PENDING',
      fileName: file.originalname,
      contractVersion,
      fileHash,
      validationReport,
      importMode: mode,
    });

    await normalizeRows(validRows, {
      sellerId,
      role,
      autoPublish: role === 'Admin' && autoPublish,
      autoApproveBatch: role === 'Admin' && autoApproveBatch,
    });

    validRows.forEach((row) => {
      row.batchId = batch._id;
    });

    try {
      if (mode === 'upsert') {
        const upsertResults = await applyUpsert(validRows, batch._id);
        await batch.save();
        return {
          batchId: batch._id,
          summary: validationReport.summary,
          upsert: upsertResults,
          validationReport,
        };
      }

      let persistMeta;
      try {
        persistMeta = await tryTransactionalPersist(batch, validRows);
      } catch (txErr) {
        if (
          txErr.code === 20 ||
          txErr.message?.includes('Transaction') ||
          txErr.message?.includes('replica set')
        ) {
          persistMeta = await compensatingPersist(batch, validRows);
        } else {
          await cleanupBatch(batch._id);
          throw txErr;
        }
      }

      return {
        batchId: batch._id,
        count: validRows.length,
        summary: validationReport.summary,
        validationReport,
        persistMeta,
      };
    } catch (insertErr) {
      await cleanupBatch(batch._id);
      throw insertErr;
    }
  });
}

module.exports = {
  runBulkImport,
  cleanupBatch,
};
