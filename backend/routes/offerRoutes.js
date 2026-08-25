const express = require("express");
const router = express.Router();
const { withAnyAdminAuth } = require("../utils/adminAuthChain");
// Banners/homepage Admin may manage announcement offers with homepage:manage alone.
const offerManage = withAnyAdminAuth([
  { domain: "promotions", action: "manage" },
  { domain: "homepage", action: "manage" },
]);
const Offer = require("../models/offer");
const { applyTranslations } = require("../utils/applyTranslations");

// Helper function to normalize date to UTC midnight
const normalizeDate = (dateValue) => {
  if (!dateValue) return null;
  
  // If date string is in format YYYY-MM-DD, parse it as UTC midnight
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const [year, month, day] = dateValue.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }
  
  // Otherwise, parse and normalize to UTC midnight
  const date = new Date(dateValue);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0));
};

/**
 * Resolve type filter for GET /active.
 * Default: announcement-only (AAURIKAA announcement bar safety).
 * Pass type=all to return every active offer type.
 * Pass an explicit enum value to filter to that type.
 */
function resolveActiveOfferTypeFilter(typeQuery) {
  if (typeQuery === undefined || typeQuery === null || typeQuery === "") {
    return "announcement";
  }
  const normalized = String(typeQuery).trim().toLowerCase();
  if (normalized === "all" || normalized === "*") {
    return null;
  }
  return normalized;
}

// ✅ POST - Add Offer
router.post("/", ...offerManage, async (req, res) => {
  try {
    const { 
      text, 
      title, 
      description, 
      type, 
      priority, 
      validFrom, 
      validTo, 
      targetAudience, 
      tags 
    } = req.body;

    // Basic validation
    if (!text) {
      return res.status(400).json({ message: "Offer text is required" });
    }

    // Parse dates properly to avoid timezone issues
    const parsedValidFrom = normalizeDate(validFrom) || new Date();
    const parsedValidTo = normalizeDate(validTo);

    // Create offer with metadata (omit validTo when unset — null breaks active queries)
    const offerData = {
      text,
      title: title || '',
      description: description || '',
      type: type || 'announcement',
      priority: priority || 0,
      validFrom: parsedValidFrom,
      targetAudience: targetAudience || 'all',
      metadata: {
        createdBy: req.user?.id || req.user?._id,
        tags: tags || []
      }
    };
    if (parsedValidTo) {
      offerData.validTo = parsedValidTo;
    }

    const newOffer = new Offer(offerData);
    await newOffer.save();

    res.status(201).json({ 
      message: "Offer added successfully",
      offer: newOffer
    });
  } catch (err) {
    console.error("Offer POST error:", err);
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        message: "Validation failed", 
        errors: errors 
      });
    }
    
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET - All Offers
router.get("/", async (req, res) => {
  try {
    const { active, type, targetAudience } = req.query;
    
    let query = {};
    
    // Filter by active status
    if (active === 'true') {
      query.isActive = true;
    } else if (active === 'false') {
      query.isActive = false;
    }
    
    // Filter by type
    if (type) {
      query.type = type;
    }
    
    // Filter by target audience
    if (targetAudience) {
      query.targetAudience = targetAudience;
    }
    
    let offers = await Offer.find(query)
      .populate('metadata.createdBy', 'name email')
      .populate('metadata.lastModifiedBy', 'name email')
      .sort({ priority: -1, createdAt: -1 })
      .lean();
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      offers = await applyTranslations(offers, 'Offer', locale, ['text', 'title', 'description']);
    }
    res.json(offers);
  } catch (err) {
    console.error("Offer GET error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET - Active Offers (Public endpoint)
// Query: ?type=announcement (default) | ?type=discount | ?type=all
router.get("/active", async (req, res) => {
  try {
    const typeFilter = resolveActiveOfferTypeFilter(req.query.type);
    let offers = await Offer.getActiveOffers(typeFilter);
    if (Array.isArray(offers)) {
      offers = offers.map((o) => (o && o.toObject ? o.toObject() : o));
      const locale = req.query.locale;
      if (locale && locale !== 'en') {
        offers = await applyTranslations(offers, 'Offer', locale, ['text', 'title', 'description']);
      }
    }
    res.json(offers);
  } catch (err) {
    console.error("Active offers GET error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ PUT - Update Offer
router.put("/:id", ...offerManage, async (req, res) => {
  try {
    const { 
      text, 
      title, 
      description, 
      type, 
      priority, 
      validFrom, 
      validTo, 
      targetAudience, 
      tags,
      isActive 
    } = req.body;

    // Fetch existing offer
    const existingOffer = await Offer.findById(req.params.id);
    if (!existingOffer) {
      return res.status(404).json({ message: "Offer not found" });
    }

    // Update fields if provided
    if (text !== undefined) existingOffer.text = text;
    if (title !== undefined) existingOffer.title = title;
    if (description !== undefined) existingOffer.description = description;
    if (type !== undefined) existingOffer.type = type;
    if (priority !== undefined) existingOffer.priority = priority;
    if (targetAudience !== undefined) existingOffer.targetAudience = targetAudience;
    if (isActive !== undefined) existingOffer.isActive = isActive;
    if (tags !== undefined) existingOffer.metadata.tags = tags;
    
    // Normalize dates if provided - using save() ensures validators see updated values
    if (validFrom !== undefined) {
      existingOffer.validFrom = normalizeDate(validFrom) || existingOffer.validFrom;
    }
    if (validTo !== undefined) {
      existingOffer.validTo = normalizeDate(validTo);
    }
    
    // Always update lastModifiedBy
    existingOffer.metadata.lastModifiedBy = req.user?.id || req.user?._id;

    // Save with validation - validators will see all updated values correctly
    await existingOffer.save();

    // Populate the updated document
    await existingOffer.populate('metadata.createdBy', 'name email');
    await existingOffer.populate('metadata.lastModifiedBy', 'name email');

    res.json({ 
      message: "Offer updated successfully",
      offer: existingOffer
    });
  } catch (err) {
    console.error("Offer PUT error:", err);
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        message: "Validation failed", 
        errors: errors 
      });
    }
    
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ DELETE - Offer by ID
router.delete("/:id", ...offerManage, async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.json({ message: "Offer deleted" });
  } catch (err) {
    console.error("Offer DELETE error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
module.exports.resolveActiveOfferTypeFilter = resolveActiveOfferTypeFilter;
