const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema({
  // Site basic settings
  title: { type: String, default: "" },
  tagline: { type: String, default: "" },
  logo: { type: String, default: "" },
  favicon: { type: String, default: "" },

  seo: {
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    keywords: { type: String, default: "" },
  },

  scripts: {
    header: { type: String, default: "" },
    footer: { type: String, default: "" },
  },

  colors: {
    primary: { type: String, default: "#6b46c1" },
    secondary: { type: String, default: "#2b6cb0" },
    accent: { type: String, default: "#d69e2e" },
    background: { type: String, default: "#ffffff" },
  },

  subscriptionNotificationEmail: { type: String, default: "" },
  enquiryNotificationEmail: { type: String, default: "" },
  careerNotificationEmail: { type: String, default: "" },

  contactInfo: {
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    facebook: { type: String, default: "" },
    instagram: { type: String, default: "" },
    twitter: { type: String, default: "" },
  },

  footer: {
    text: { type: String, default: "" },
    copyright: { type: String, default: "" },
    companyName: { type: String, default: "" },
    gstin: { type: String, default: "" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    workingHours1: { type: String, default: "" },
    workingHours2: { type: String, default: "" },
    columns: [{
      title: { type: String, required: true },
      links: [{
        label: { type: String, required: true },
        url: { type: String, required: true }
      }]
    }],
    socialLinks: [{
      platform: { type: String },
      iconAsset: { type: String },
      url: { type: String },
      isEnabled: { type: Boolean, default: true },
      order: { type: Number, default: 0 }
    }],
    paymentIcons: [{
      name: { type: String },
      imageAsset: { type: String },
      url: { type: String },
      isEnabled: { type: Boolean, default: true },
      order: { type: Number, default: 0 }
    }]
  },

  header: {
    title: { type: String, default: "" },
    tagline: { type: String, default: "" },
    menuLinks: { type: [String], default: [] }, // comma-separated on frontend
  },

  pagination: {
    blogPostsPerPage: { type: Number, default: 15, min: 5, max: 50 },
    adminBlogsPerPage: { type: Number, default: 20, min: 10, max: 100 },
    categoriesPerPage: { type: Number, default: 20, min: 10, max: 100 },
    commentsPerPage: { type: Number, default: 10, min: 5, max: 50 },
    searchResultsPerPage: { type: Number, default: 12, min: 6, max: 30 },
    defaultSortBy: { type: String, enum: ['date', 'title', 'author', 'views', 'likes'], default: 'date' },
    defaultSortOrder: { type: String, enum: ['asc', 'desc'], default: 'desc' },
    showFirstLastButtons: { type: Boolean, default: true },
    showPrevNextButtons: { type: Boolean, default: true },
    maxVisiblePages: { type: Number, default: 5, min: 3, max: 10 }
  },

  homepageMedia: {
    youtubeVideoUrl: { type: String, default: "" },
    youtubeLinkText: { type: String, default: "" },
    youtubeLinkUrl: { type: String, default: "" },
  },

  // Maintenance mode settings
  maintenance: {
    enabled: { type: Boolean, default: false },
    message: { type: String, default: "We're currently performing scheduled maintenance. We'll be back shortly. Thank you for your patience." }
  },

  // Homepage – Objective 4.9 (optional, backward compatible)
  recentlyViewedVisibleCount: { type: Number, default: 6, min: 4, max: 8 },

  // Platform/global return policy retired — sellers own returnAllowed / returnWindowDays / returnConditions.

  // Best Sellers section: optional filter by seller or category (seller takes priority if both set)
  bestSellerSellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null },
  bestSellerCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
}, { timestamps: true });

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
