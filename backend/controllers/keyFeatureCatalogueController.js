const KeyFeatureCatalogue = require('../models/KeyFeatureCatalogue');
const {
  listActiveCatalogueEntries,
  seedCatalogueFromBaseline,
  getCatalogueCount,
  toPublicCatalogueEntry,
} = require('../utils/keyFeatureCatalogueService');

/**
 * GET /api/key-feature-catalogue
 * Read-only. Does not auto-seed. Empty catalogue → success with seeded:false.
 */
async function listCatalogue(req, res) {
  try {
    const count = await getCatalogueCount();
    if (count === 0) {
      return res.json({
        success: true,
        seeded: false,
        count: 0,
        data: [],
        message:
          'Key feature catalogue is empty. Run npm run seed:key-feature-catalogue or POST /api/key-feature-catalogue/seed.',
      });
    }

    const entries = await listActiveCatalogueEntries();
    return res.json({
      success: true,
      seeded: true,
      count: entries.length,
      data: entries,
    });
  } catch (err) {
    console.error('listCatalogue error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load key feature catalogue',
    });
  }
}

/**
 * POST /api/key-feature-catalogue/seed
 * Admin: (re)load baseline spreadsheet-derived catalogue into Mongo.
 */
async function seedCatalogue(req, res) {
  try {
    const result = await seedCatalogueFromBaseline();
    return res.json({
      success: true,
      message: 'Key feature catalogue seeded from baseline',
      ...result,
    });
  } catch (err) {
    console.error('seedCatalogue error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to seed key feature catalogue',
    });
  }
}

/**
 * POST /api/key-feature-catalogue
 * Admin: add a catalogue entry (extensibility without redeploy).
 */
async function createCatalogueEntry(req, res) {
  try {
    const {
      code,
      displayLabel,
      domain,
      domainSlug,
      aliases,
      candidateAllowedValues,
      allowedValuesStatus,
      sortOrder,
      active,
    } = req.body || {};

    if (!code || !displayLabel || !domain) {
      return res.status(400).json({
        success: false,
        message: 'code, displayLabel, and domain are required',
      });
    }

    const slug =
      domainSlug ||
      String(domain)
        .replace(/^\d+\.\s*/, '')
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-');

    const candidates = Array.isArray(candidateAllowedValues)
      ? candidateAllowedValues.map(String)
      : [];

    const entry = await KeyFeatureCatalogue.create({
      code: String(code).trim(),
      displayLabel: String(displayLabel).trim(),
      domain: String(domain).trim(),
      domainSlug: slug,
      aliases: Array.isArray(aliases) ? aliases.map(String) : [],
      candidateAllowedValues: candidates,
      allowedValuesStatus:
        allowedValuesStatus ||
        (candidates.length ? 'unverified_xlsx_shift' : 'none'),
      allowedValues: [],
      sortOrder: Number(sortOrder) || 0,
      active: active !== false,
    });

    return res.status(201).json({
      success: true,
      data: toPublicCatalogueEntry(entry.toObject ? entry.toObject() : entry),
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A catalogue entry with this code already exists',
      });
    }
    console.error('createCatalogueEntry error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create catalogue entry',
    });
  }
}

/**
 * PATCH /api/key-feature-catalogue/:id
 * Admin: update / deactivate an entry (prefer deactivate over delete).
 */
async function updateCatalogueEntry(req, res) {
  try {
    const allowed = [
      'displayLabel',
      'domain',
      'domainSlug',
      'aliases',
      'candidateAllowedValues',
      'allowedValuesStatus',
      'sortOrder',
      'active',
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    // Never accept legacy allowedValues as authoritative via API
    if (req.body?.allowedValues !== undefined && patch.candidateAllowedValues === undefined) {
      patch.candidateAllowedValues = req.body.allowedValues;
      patch.allowedValuesStatus = patch.allowedValuesStatus || 'unverified_xlsx_shift';
      patch.allowedValues = [];
    }

    const entry = await KeyFeatureCatalogue.findByIdAndUpdate(
      req.params.id,
      { $set: patch },
      { new: true, runValidators: true }
    );
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Catalogue entry not found' });
    }
    return res.json({
      success: true,
      data: toPublicCatalogueEntry(entry.toObject ? entry.toObject() : entry),
    });
  } catch (err) {
    console.error('updateCatalogueEntry error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update catalogue entry',
    });
  }
}

module.exports = {
  listCatalogue,
  seedCatalogue,
  createCatalogueEntry,
  updateCatalogueEntry,
};
