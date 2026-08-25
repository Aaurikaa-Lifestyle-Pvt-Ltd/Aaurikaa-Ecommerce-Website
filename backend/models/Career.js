const mongoose = require('mongoose');
const slugify = require('slugify');

const STATUSES = ['draft', 'active', 'inactive', 'trashed'];
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'other'];

const careerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    description: { type: mongoose.Schema.Types.Mixed, required: true },
    location: { type: String, trim: true, default: '' },
    employmentType: {
      type: String,
      enum: EMPLOYMENT_TYPES,
      default: 'other',
    },
    department: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: STATUSES,
      default: 'draft',
      required: true,
    },
    displayOrder: { type: Number, default: 0, required: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    migrationSourceKey: { type: String, default: null, sparse: true },

    metaTitle: { type: String, maxlength: 60, trim: true },
    metaDescription: { type: String, maxlength: 160, trim: true },
    metaKeywords: { type: [String], default: [] },
    canonicalUrl: { type: String, trim: true },
    ogTitle: { type: String, maxlength: 60, trim: true },
    ogDescription: { type: String, maxlength: 160, trim: true },
    twitterTitle: { type: String, maxlength: 70, trim: true },
    twitterDescription: { type: String, maxlength: 200, trim: true },
    structuredData: { type: mongoose.Schema.Types.Mixed, default: {} },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    statusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    statusChangedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

careerSchema.index({ status: 1, displayOrder: 1, createdAt: -1, _id: 1 });
careerSchema.index({ startDate: 1, endDate: 1 });
careerSchema.index({ migrationSourceKey: 1 }, { sparse: true });

careerSchema.methods.generateSEOMetadata = function (baseUrl = 'http://localhost:3000') {
  const excerpt = extractPlainTextFromDescription(this.description);
  const cleanDescription = excerpt.substring(0, 160) || 'Explore career opportunities at Anbazar';
  const careerUrl = `${baseUrl}/careers/${this.slug}`;

  return {
    title: this.metaTitle || `${this.title} | Careers | Anbazar`,
    description: this.metaDescription || cleanDescription,
    keywords: this.metaKeywords.length > 0 ? this.metaKeywords.join(', ') : `careers, jobs, ${this.title}`,
    canonicalUrl: this.canonicalUrl || careerUrl,
    ogTitle: this.ogTitle || this.title,
    ogDescription: this.ogDescription || cleanDescription,
    ogUrl: careerUrl,
    twitterTitle: this.twitterTitle || this.title,
    twitterDescription: this.twitterDescription || cleanDescription,
    structuredData: this.generateStructuredData(baseUrl, careerUrl, cleanDescription),
  };
};

careerSchema.methods.generateStructuredData = function (baseUrl, careerUrl, cleanDescription) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: this.title,
    description: cleanDescription,
    url: careerUrl,
    datePosted: this.publishedAt || this.createdAt,
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Anbazar',
      sameAs: baseUrl,
    },
  };

  if (this.location) {
    data.jobLocation = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: this.location,
      },
    };
  }

  if (this.employmentType && this.employmentType !== 'other') {
    const typeMap = {
      full_time: 'FULL_TIME',
      part_time: 'PART_TIME',
      contract: 'CONTRACTOR',
      internship: 'INTERN',
    };
    if (typeMap[this.employmentType]) {
      data.employmentType = typeMap[this.employmentType];
    }
  }

  if (this.endDate) {
    data.validThrough = new Date(this.endDate).toISOString();
  }

  return data;
};

function extractPlainTextFromDescription(description) {
  if (!description) return '';
  let parsed = description;
  if (typeof description === 'string') {
    try {
      parsed = JSON.parse(description);
    } catch {
      return description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
  }
  if (parsed && parsed.type === 'doc' && Array.isArray(parsed.content)) {
    const texts = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'text' && node.text) texts.push(node.text);
      if (Array.isArray(node.content)) node.content.forEach(walk);
    };
    parsed.content.forEach(walk);
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }
  return String(description).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

careerSchema.pre('save', function (next) {
  if (!this.slug && this.title) {
    const baseSlug = slugify(this.title, { lower: true, strict: true });
    this.slug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;
  }

  const excerpt = extractPlainTextFromDescription(this.description);
  if (!this.metaDescription && excerpt) {
    this.metaDescription = excerpt.substring(0, 160);
  }
  if (!this.ogTitle) this.ogTitle = this.title;
  if (!this.ogDescription && excerpt) {
    this.ogDescription = excerpt.substring(0, 160);
  }
  if (!this.twitterTitle) this.twitterTitle = this.title;
  if (!this.twitterDescription && excerpt) {
    this.twitterDescription = excerpt.substring(0, 200);
  }

  next();
});

module.exports = mongoose.model('Career', careerSchema);
module.exports.STATUSES = STATUSES;
module.exports.EMPLOYMENT_TYPES = EMPLOYMENT_TYPES;
module.exports.extractPlainTextFromDescription = extractPlainTextFromDescription;
