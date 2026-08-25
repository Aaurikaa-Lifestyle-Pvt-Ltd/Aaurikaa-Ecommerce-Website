const mongoose = require('mongoose');

const staticPageContentSchema = new mongoose.Schema(
  {
    pageKey: { type: String, required: true, unique: true, index: true, trim: true },
    slug: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['draft', 'published', 'trashed'],
      default: 'draft',
      required: true,
    },
    seo: {
      title: { type: String, default: '', trim: true },
      metaDescription: { type: String, default: '', trim: true },
    },
    zones: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => new Map(),
    },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

staticPageContentSchema.set('toJSON', {
  transform(doc, ret) {
    if (ret.zones instanceof Map) {
      ret.zones = Object.fromEntries(ret.zones);
    }
    return ret;
  },
});

staticPageContentSchema.methods.toPublicJSON = function toPublicJSON() {
  const obj = this.toJSON();
  return {
    pageKey: obj.pageKey,
    slug: obj.slug,
    status: obj.status,
    seo: obj.seo || { title: '', metaDescription: '' },
    zones: obj.zones || {},
    publishedAt: obj.publishedAt,
    updatedAt: obj.updatedAt,
  };
};

module.exports = mongoose.model('StaticPageContent', staticPageContentSchema);
