/**
 * Centralized Product Key Feature catalogue (WS-1 / 1.7, storage C1).
 *
 * Feature Identity  = `code` (stable, context-qualified; not globally unique by displayLabel)
 * Display label     = `displayLabel` (human-readable)
 * Product features[] = { key: displayLabel, value, code?, values? }
 *   code is additive catalogue identity; key remains the human-readable label.
 *
 * `candidateAllowedValues` holds unverified XLSX-derived suggestions only.
 * They are NOT authoritative enums until spreadsheet structure is confirmed.
 */
const mongoose = require('mongoose');

const ALLOWED_VALUES_STATUS = ['none', 'unverified_xlsx_shift', 'verified'];

const keyFeatureCatalogueSchema = new mongoose.Schema(
  {
    /**
     * Stable Feature Identity (domain-qualified; occurrence suffix when needed).
     * Distinct from displayLabel — duplicate labels across domains keep separate codes.
     */
    code: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    /**
     * Human-readable label. Written to Product.features[].key.
     * Catalogue identity is stored separately as Product.features[].code.
     * NOT globally unique; NOT Feature Identity.
     */
    displayLabel: {
      type: String,
      required: true,
      trim: true,
    },
    /** Spreadsheet product-domain section, e.g. "8. Electronics" (applicability context). */
    domain: {
      type: String,
      required: true,
      trim: true,
    },
    domainSlug: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    /** Catalogue aliases only (e.g. Brand Name → Brand). Not applied as Product key rewrite. */
    aliases: {
      type: [String],
      default: [],
    },
    /**
     * Unverified / candidate value suggestions (e.g. Phase 0 XLSX shift heuristic).
     * Not authoritative allowed-value enums.
     */
    candidateAllowedValues: {
      type: [String],
      default: [],
    },
    allowedValuesStatus: {
      type: String,
      enum: ALLOWED_VALUES_STATUS,
      default: 'none',
    },
    /**
     * @deprecated Legacy field — may still hold pre-correction heuristic data.
     * Public API maps this into candidateAllowedValues; do not treat as authoritative.
     */
    allowedValues: {
      type: [String],
      default: [],
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// displayLabel is intentionally NOT unique — cross-domain duplicates are distinct by `code`.
keyFeatureCatalogueSchema.index({ domain: 1, displayLabel: 1 });
keyFeatureCatalogueSchema.index({ active: 1, sortOrder: 1 });

module.exports =
  mongoose.models.KeyFeatureCatalogue ||
  mongoose.model('KeyFeatureCatalogue', keyFeatureCatalogueSchema);

module.exports.ALLOWED_VALUES_STATUS = ALLOWED_VALUES_STATUS;
