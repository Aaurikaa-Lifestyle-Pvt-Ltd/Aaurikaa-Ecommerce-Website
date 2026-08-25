/**
 * Key Feature Catalogue load / list helpers (WS-1 / 1.7, storage C1).
 *
 * Feature Identity = catalogue `code`.
 * Product features[] persist that identity additively as `code` (key stays displayLabel).
 *
 * GET/list is read-only — does not auto-seed. Use seedCatalogueFromBaseline /
 * `npm run seed:key-feature-catalogue` / admin POST /seed.
 */
const path = require('path');
const KeyFeatureCatalogue = require('../models/KeyFeatureCatalogue');

const BASELINE_PATH = path.join(
  __dirname,
  '../data/keyFeatureCatalogueBaseline.json'
);

/**
 * Map baseline / legacy rows into catalogue write shape.
 * Baseline JSON still uses `allowedValues` for the XLSX heuristic — treated as candidates only.
 */
function loadBaseline() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const baseline = require(BASELINE_PATH);
  const entries = Array.isArray(baseline?.entries) ? baseline.entries : [];
  return entries
    .map((entry) => {
      const code = String(entry.code || '').trim();
      const displayLabel = String(entry.displayLabel || '').trim();
      const domain = String(entry.domain || '').trim();
      const domainSlug = String(entry.domainSlug || '').trim();
      const aliases = Array.isArray(entry.aliases)
        ? entry.aliases.map((a) => String(a).trim()).filter(Boolean)
        : [];
      const rawCandidates = Array.isArray(entry.candidateAllowedValues)
        ? entry.candidateAllowedValues
        : Array.isArray(entry.allowedValues)
          ? entry.allowedValues
          : [];
      const candidateAllowedValues = rawCandidates
        .map((v) => String(v).trim())
        .filter(Boolean);
      return {
        code,
        displayLabel,
        domain,
        domainSlug,
        aliases,
        candidateAllowedValues,
        allowedValuesStatus: candidateAllowedValues.length
          ? 'unverified_xlsx_shift'
          : 'none',
        sortOrder: Number(entry.sortOrder) || 0,
        active: entry.active !== false,
      };
    })
    .filter((e) => e.code && e.displayLabel && e.domain);
}

/**
 * Public catalogue DTO — never exposes unverified values as authoritative enums.
 */
function toPublicCatalogueEntry(doc) {
  const legacy = Array.isArray(doc.allowedValues) ? doc.allowedValues : [];
  const candidates = Array.isArray(doc.candidateAllowedValues) && doc.candidateAllowedValues.length
    ? doc.candidateAllowedValues
    : legacy;
  const status =
    doc.allowedValuesStatus ||
    (candidates.length ? 'unverified_xlsx_shift' : 'none');

  return {
    code: doc.code,
    /** Feature Identity (stable, context-qualified). */
    featureIdentity: doc.code,
    displayLabel: doc.displayLabel,
    domain: doc.domain,
    domainSlug: doc.domainSlug,
    aliases: Array.isArray(doc.aliases) ? doc.aliases : [],
    candidateAllowedValues: candidates.map((v) => String(v).trim()).filter(Boolean),
    allowedValuesStatus: status,
    sortOrder: doc.sortOrder,
  };
}

/**
 * Upsert baseline into Mongo. Safe to re-run (keyed by code).
 * Writes heuristic lists only to candidateAllowedValues; clears legacy allowedValues.
 * Does not deactivate admin-added codes absent from the baseline.
 */
async function seedCatalogueFromBaseline({ overwriteCandidates = true } = {}) {
  const entries = loadBaseline();
  if (!entries.length) {
    return { upserted: 0, modified: 0, total: 0 };
  }

  const ops = entries.map((entry) => {
    const $set = {
      displayLabel: entry.displayLabel,
      domain: entry.domain,
      domainSlug: entry.domainSlug,
      aliases: entry.aliases,
      sortOrder: entry.sortOrder,
      active: entry.active,
      allowedValues: [],
    };
    if (overwriteCandidates) {
      $set.candidateAllowedValues = entry.candidateAllowedValues;
      $set.allowedValuesStatus = entry.allowedValuesStatus;
    }
    return {
      updateOne: {
        filter: { code: entry.code },
        update: {
          $set,
          $setOnInsert: { code: entry.code },
        },
        upsert: true,
      },
    };
  });

  const result = await KeyFeatureCatalogue.bulkWrite(ops, { ordered: false });
  return {
    upserted: result.upsertedCount || 0,
    modified: result.modifiedCount || 0,
    matched: result.matchedCount || 0,
    total: entries.length,
  };
}

/**
 * Explicit seed helper (admin / CLI only). Not called from GET/list.
 * @deprecated Name kept for callers that previously auto-seeded; does not run on read.
 */
async function ensureCatalogueSeeded() {
  return seedCatalogueFromBaseline();
}

/**
 * Read-only list. Does not mutate Mongo when empty.
 */
async function listActiveCatalogueEntries() {
  const docs = await KeyFeatureCatalogue.find({ active: true })
    .sort({ sortOrder: 1, displayLabel: 1 })
    .select(
      'code displayLabel domain domainSlug aliases candidateAllowedValues allowedValuesStatus allowedValues sortOrder'
    )
    .lean();
  return docs.map(toPublicCatalogueEntry);
}

async function getCatalogueCount() {
  return KeyFeatureCatalogue.estimatedDocumentCount();
}

module.exports = {
  loadBaseline,
  toPublicCatalogueEntry,
  seedCatalogueFromBaseline,
  ensureCatalogueSeeded,
  listActiveCatalogueEntries,
  getCatalogueCount,
};
