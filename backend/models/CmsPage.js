const mongoose = require('mongoose');

const cmsPageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    content: { type: String, required: true },
    type: {
      type: String,
      enum: ['about', 'contact', 'policy', 'custom'],
      required: true
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'trashed'],
      default: 'draft',
      required: true
    },
    published_at: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CmsPage', cmsPageSchema);
