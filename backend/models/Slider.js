const mongoose = require('mongoose');

const PLACEMENTS = ['hero', 'promo1', 'promo2'];

const bannerSchema = new mongoose.Schema({
  /**
   * Homepage section this slide belongs to.
   * Required for new API writes; legacy rows may be unset until migration/manual assign.
   */
  placement: {
    type: String,
    enum: PLACEMENTS,
    // Not schema-required so ambiguous legacy docs can exist until assigned.
  },
  /** Desktop creative (required). */
  image: {
    type: String,
    required: true,
  },
  /** Mobile creative — required when isActive (enforced in controller). */
  mobileImage: {
    type: String,
    default: '',
  },
  // AAURIKAA: caption/CTA fields are optional; images are the content fields.
  heading: {
    type: String,
    default: '',
  },
  offerText: {
    type: String,
    default: '',
  },
  buttonText: {
    type: String,
    default: '',
  },
  buttonLink: {
    type: String,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  /** Order within placement (not global). */
  displayOrder: {
    type: Number,
    default: 0,
    required: true,
  },
}, { timestamps: true });

bannerSchema.index({ placement: 1, displayOrder: 1 });

module.exports = mongoose.model('Slider', bannerSchema);
module.exports.PLACEMENTS = PLACEMENTS;
