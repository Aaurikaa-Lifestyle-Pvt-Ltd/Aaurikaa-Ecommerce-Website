const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Translation = require('../../models/Translation');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../../utils/adminAuthChain');
const { translateStrings, isConfigured } = require('../../services/autoTranslate');

// Model name -> list of translatable field names (used for auto-translate)
const MODEL_TRANSLATABLE_FIELDS = {
  Product: ['name', 'shortDesc', 'longDesc'],
  Category: ['name', 'description', 'title'],
  Subcategory: ['name', 'description', 'title'],
  ChildCategory: ['name', 'description', 'title'],
  Slider: ['heading', 'offerText', 'buttonText'],
  Brand: ['name', 'description'],
  Blog: ['title', 'description', 'intro'],
  CmsPage: ['title', 'content'],
  StaticPageContent: ['seo', 'zones'],
  Offer: ['text', 'title', 'description'],
  HomepageCategoryConfig: ['displayTitle'],
};

// GET /api/admin/translations/list/:model?locale=bn&page=1 - List translations for a model (paginated)
router.get('/list/:model', verifyAdmin, loadAdminContext, requirePermission('localization', 'view'), async (req, res) => {
  try {
    const { model } = req.params;
    const locale = req.query.locale;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = { model };
    if (locale) filter.locale = locale;
    const [list, total] = await Promise.all([
      Translation.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Translation.countDocuments(filter),
    ]);
    return res.json({
      success: true,
      data: list,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/translations/:model/:documentId - Get all translations for a document
router.get('/:model/:documentId', verifyAdmin, loadAdminContext, requirePermission('localization', 'view'), async (req, res) => {
  try {
    const { model, documentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return res.status(400).json({ success: false, message: 'Invalid document ID' });
    }
    const doc = await Translation.find({ model, documentId }).lean();
    const byLocale = {};
    for (const d of doc) {
      byLocale[d.locale] = d.fields instanceof Map ? Object.fromEntries(d.fields) : d.fields || {};
    }
    return res.json({ success: true, data: byLocale });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/translations/:model/:documentId/:locale - Create or update translation
router.put('/:model/:documentId/:locale', verifyAdmin, loadAdminContext, requirePermission('localization', 'manage'), async (req, res) => {
  try {
    const { model, documentId, locale } = req.params;
    const { fields } = req.body;
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return res.status(400).json({ success: false, message: 'Invalid document ID' });
    }
    if (!['bn', 'hi'].includes(locale)) {
      return res.status(400).json({ success: false, message: 'Locale must be bn or hi' });
    }
    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ success: false, message: 'Body must include fields object' });
    }
    const update = { model, documentId: new mongoose.Types.ObjectId(documentId), locale, fields };
    const doc = await Translation.findOneAndUpdate(
      { model, documentId: update.documentId, locale },
      { $set: { fields: update.fields } },
      { new: true, upsert: true }
    );
    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/translations/:model/:documentId/:locale
router.delete('/:model/:documentId/:locale', verifyAdmin, loadAdminContext, requirePermission('localization', 'manage'), async (req, res) => {
  try {
    const { model, documentId, locale } = req.params;
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return res.status(400).json({ success: false, message: 'Invalid document ID' });
    }
    await Translation.deleteOne({ model, documentId: new mongoose.Types.ObjectId(documentId), locale });
    return res.json({ success: true, message: 'Translation deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/translations/auto-translate - Auto-translate a document and save
router.post("/auto-translate", verifyAdmin, loadAdminContext, requirePermission('localization', 'manage'), async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Auto-translate is not configured. Set GOOGLE_TRANSLATE_API_KEY in .env.",
      });
    }
    const { model: modelName, documentId, locale } = req.body;
    if (!modelName || !documentId || !locale) {
      return res.status(400).json({ success: false, message: "Body must include model, documentId, locale" });
    }
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return res.status(400).json({ success: false, message: "Invalid documentId" });
    }
    if (!["bn", "hi"].includes(locale)) {
      return res.status(400).json({ success: false, message: "Locale must be bn or hi" });
    }
    const fieldNames = MODEL_TRANSLATABLE_FIELDS[modelName];
    if (!fieldNames || fieldNames.length === 0) {
      return res.status(400).json({ success: false, message: `Auto-translate not supported for model: ${modelName}` });
    }
    const Model = mongoose.model(modelName);
    if (!Model) {
      return res.status(400).json({ success: false, message: `Unknown model: ${modelName}` });
    }
    const doc = await Model.findById(documentId).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    const texts = fieldNames.map((f) => (doc[f] != null ? String(doc[f]) : ""));
    const translated = await translateStrings(texts, locale);
    const fields = {};
    fieldNames.forEach((f, i) => {
      if (translated[i] != null) fields[f] = translated[i];
    });
    if (Object.keys(fields).length === 0) {
      return res.json({ success: true, message: "Nothing to translate", data: { fields: {} } });
    }
    await Translation.findOneAndUpdate(
      { model: modelName, documentId: new mongoose.Types.ObjectId(documentId), locale },
      { $set: { fields } },
      { new: true, upsert: true }
    );
    return res.json({ success: true, message: "Translation saved", data: { fields } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/translations/bulk - Bulk create/update translations
router.post('/bulk', verifyAdmin, loadAdminContext, requirePermission('localization', 'manage'), async (req, res) => {
  try {
    const { items } = req.body; // [{ model, documentId, locale, fields }, ...]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Body must include items array' });
    }
    const ops = items.map((item) => {
      if (!item.model || !item.documentId || !item.locale || !item.fields) {
        return null;
      }
      if (!mongoose.Types.ObjectId.isValid(item.documentId)) return null;
      if (!['bn', 'hi'].includes(item.locale)) return null;
      return {
        updateOne: {
          filter: { model: item.model, documentId: new mongoose.Types.ObjectId(item.documentId), locale: item.locale },
          update: { $set: { fields: item.fields } },
          upsert: true,
        },
      };
    }).filter(Boolean);
    if (ops.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid items' });
    }
    const result = await Translation.bulkWrite(ops);
    return res.json({ success: true, data: { inserted: result.upsertedCount, modified: result.modifiedCount } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.MODEL_TRANSLATABLE_FIELDS = MODEL_TRANSLATABLE_FIELDS;
