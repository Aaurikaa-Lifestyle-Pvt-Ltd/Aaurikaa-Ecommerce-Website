const mongoose = require('mongoose');

const HomepageCategoryConfigSchema = new mongoose.Schema({
  sectionName: {
    type: String,
    required: true,
  },
  sectionType: {
    type: String,
    required: true,
    enum: ['front-page', 'two-row'],
    default: 'front-page',
  },
  displayTitle: {
    type: String,
    trim: true,
    maxlength: [200, 'Display title cannot exceed 200 characters'],
    default: '',
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory', // Model name matches Subcategory.js filename
    default: null,
  },
  childCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChildCategory',
    default: null,
  },
}, { timestamps: true });

// Compound unique index: sectionName must be unique per sectionType
HomepageCategoryConfigSchema.index({ sectionName: 1, sectionType: 1 }, { unique: true });

module.exports = mongoose.model('HomepageCategoryConfig', HomepageCategoryConfigSchema);