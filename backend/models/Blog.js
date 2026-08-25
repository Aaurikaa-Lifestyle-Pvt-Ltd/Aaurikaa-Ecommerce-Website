const mongoose = require("mongoose");
const slugify = require("slugify");

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, index: true },
    description: { type: String, required: true },
    image: { type: String },
    imageId: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },

    date: { type: Date, default: () => new Date() },
    author: { type: String, default: "Admin" },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId }, // ✅ Fixed: User-scoped ownership (admin or seller)
    tags: { type: [String], default: [] },

    // SEO Metadata Fields
    metaTitle: {
      type: String,
      maxlength: 60,
      trim: true
    },
    metaDescription: {
      type: String,
      maxlength: 160,
      trim: true
    },
    metaKeywords: {
      type: [String],
      default: []
    },
    keyword: { // Main focus keyword
      type: String,
      trim: true
    },
    intro: { // Separate intro/excerpt
      type: String,
      trim: true
    },
    canonicalUrl: {
      type: String,
      trim: true
    },
    ogTitle: {
      type: String,
      maxlength: 60,
      trim: true
    },
    ogDescription: {
      type: String,
      maxlength: 160,
      trim: true
    },
    twitterTitle: {
      type: String,
      maxlength: 70,
      trim: true
    },
    twitterDescription: {
      type: String,
      maxlength: 200,
      trim: true
    },
    structuredData: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    categories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogCategory"
    }],

    // Legacy support (optional, can be removed after migration)
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogCategory"
    },

    status: {
      type: String,
      enum: ["draft", "published", "trash"],
      default: "draft",
    },

    // Engagement Features
    likes: {
      type: Number,
      default: 0,
      min: 0
    },

    dislikes: {
      type: Number,
      default: 0,
      min: 0
    },

    views: {
      type: Number,
      default: 0,
      min: 0
    },

    shares: {
      type: Number,
      default: 0,
      min: 0
    },

    // User engagement tracking (supports both ObjectIds for registered users and strings for anonymous users)
    likedBy: [{
      type: mongoose.Schema.Types.Mixed,
      validate: {
        validator: function (v) {
          return mongoose.Types.ObjectId.isValid(v) || typeof v === 'string';
        },
        message: 'User ID must be a valid ObjectId or string'
      }
    }],

    dislikedBy: [{
      type: mongoose.Schema.Types.Mixed,
      validate: {
        validator: function (v) {
          return mongoose.Types.ObjectId.isValid(v) || typeof v === 'string';
        },
        message: 'User ID must be a valid ObjectId or string'
      }
    }],
  },
  { timestamps: true }
);

// SEO Metadata generation methods
blogSchema.methods.generateSEOMetadata = function (baseUrl = 'http://localhost:5000') {
  const cleanDescription = this.description
    ? this.description.replace(/<[^>]*>/g, '').substring(0, 160)
    : 'Read this blog post on our platform';

  let imageUrl = `${baseUrl}/images/default-blog.jpg`;
  if (this.image) {
    const img = String(this.image);
    if (img.startsWith('http://') || img.startsWith('https://')) {
      imageUrl = img;
    } else if (img.includes('/')) {
      const { resolvePublicUrl } = require('../utils/mediaUrlUtils');
      imageUrl = resolvePublicUrl(img, baseUrl) || `${baseUrl}/uploads/blogs/${img}`;
    } else {
      imageUrl = `${baseUrl}/uploads/blogs/${img}`;
    }
  }

  const blogUrl = `${baseUrl}/blog/${this._id}`;

  return {
    title: this.ogTitle || `${this.title} | Blog`,
    description: this.metaDescription || cleanDescription,
    keywords: this.metaKeywords.length > 0 ? this.metaKeywords.join(', ') : `blog, ${this.title}, article, news`,
    canonicalUrl: this.canonicalUrl || blogUrl,
    ogTitle: this.ogTitle || this.title,
    ogDescription: this.ogDescription || cleanDescription,
    ogImage: imageUrl,
    ogUrl: blogUrl,
    twitterTitle: this.twitterTitle || this.title,
    twitterDescription: this.twitterDescription || cleanDescription,
    twitterImage: imageUrl,
    author: this.author || 'Blog Author',
    publishedTime: this.date,
    modifiedTime: this.updatedAt || this.date,
    structuredData: this.generateStructuredData(baseUrl, imageUrl, blogUrl, cleanDescription)
  };
};

blogSchema.methods.generateStructuredData = function (baseUrl, imageUrl, blogUrl, cleanDescription) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": this.title,
    "description": cleanDescription,
    "image": imageUrl,
    "author": {
      "@type": "Person",
      "name": this.author || 'Blog Author'
    },
    "publisher": {
      "@type": "Organization",
      "name": "Multi-Vendor Ecommerce",
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/images/logo.png`
      }
    },
    "datePublished": this.date,
    "dateModified": this.updatedAt || this.date,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": blogUrl
    },
    "url": blogUrl,
    "keywords": this.metaKeywords.length > 0 ? this.metaKeywords.join(', ') : `blog, ${this.title}`,
    "articleSection": "Blog",
    "wordCount": this.description ? this.description.replace(/<[^>]*>/g, '').split(' ').length : 0
  };
};

blogSchema.pre("save", function (next) {
  if ((this.isModified("title") || !this.slug) && this.title) {
    let newSlug = slugify(this.title, { lower: true, strict: true });

    // If slug is newly generated or title changed, we should ensure it's relatively unique
    // For full uniqueness, it's better handled in the save logic or by appending a short ID
    if (!this.slug || this.isModified("title")) {
      this.slug = `${newSlug}-${Math.random().toString(36).substring(2, 7)}`;
    }
  }

  // Ensure date field is always set
  if (!this.date || this.date === 'undefined') {
    this.date = new Date();
  }

  // Auto-generate SEO metadata if not provided
  const cleanIntro = this.intro ? this.intro.trim() : '';
  const cleanDescription = this.description ? this.description.replace(/<[^>]*>/g, '').trim() : '';

  if (!this.metaDescription) {
    this.metaDescription = (cleanIntro || cleanDescription).substring(0, 160);
  }

  if (!this.ogTitle) {
    this.ogTitle = this.title;
  }

  if (!this.ogDescription) {
    this.ogDescription = (cleanIntro || cleanDescription).substring(0, 160);
  }

  if (!this.twitterTitle) {
    this.twitterTitle = this.title;
  }

  if (!this.twitterDescription) {
    this.twitterDescription = (cleanIntro || cleanDescription).substring(0, 200);
  }

  next();
});

// Custom toJSON method to ensure proper date serialization
blogSchema.methods.toJSON = function () {
  const obj = this.toObject();

  // Ensure date fields are properly formatted
  if (obj.date && obj.date !== 'undefined') {
    obj.date = new Date(obj.date).toISOString();
  } else if (obj.createdAt) {
    obj.date = new Date(obj.createdAt).toISOString();
  } else {
    obj.date = new Date().toISOString();
  }

  if (obj.createdAt) {
    obj.createdAt = new Date(obj.createdAt).toISOString();
  }

  if (obj.updatedAt) {
    obj.updatedAt = new Date(obj.updatedAt).toISOString();
  }

  return obj;
};

// Engagement methods
blogSchema.methods.like = function (userId = null) {
  // Check if user already liked (if userId provided)
  if (userId && this.likedBy.includes(userId)) {
    return Promise.resolve(this); // Already liked, return without changes
  }

  // If user had disliked before, remove from disliked
  if (userId && this.dislikedBy.includes(userId)) {
    this.dislikedBy = this.dislikedBy.filter(id => id.toString() !== userId.toString());
    if (this.dislikes > 0) {
      this.dislikes -= 1;
    }
  }

  this.likes += 1;
  if (userId && !this.likedBy.includes(userId)) {
    this.likedBy.push(userId);
  }
  return this.save();
};

blogSchema.methods.dislike = function (userId = null) {
  // Check if user already disliked (if userId provided)
  if (userId && this.dislikedBy.includes(userId)) {
    return Promise.resolve(this); // Already disliked, return without changes
  }

  // If user had liked before, remove from liked
  if (userId && this.likedBy.includes(userId)) {
    this.likedBy = this.likedBy.filter(id => id.toString() !== userId.toString());
    if (this.likes > 0) {
      this.likes -= 1;
    }
  }

  this.dislikes += 1;
  if (userId && !this.dislikedBy.includes(userId)) {
    this.dislikedBy.push(userId);
  }
  return this.save();
};

blogSchema.methods.incrementViews = function () {
  this.views += 1;
  return this.save();
};

blogSchema.methods.incrementShares = function () {
  this.shares += 1;
  return this.save();
};

blogSchema.methods.removeLike = function (userId = null) {
  // Check if user actually liked the blog
  if (userId && !this.likedBy.includes(userId)) {
    return Promise.resolve(this); // User hasn't liked, return without changes
  }

  if (this.likes > 0) {
    this.likes -= 1;
  }
  if (userId) {
    this.likedBy = this.likedBy.filter(id => id.toString() !== userId.toString());
  }
  return this.save();
};

blogSchema.methods.removeDislike = function (userId = null) {
  // Check if user actually disliked the blog
  if (userId && !this.dislikedBy.includes(userId)) {
    return Promise.resolve(this); // User hasn't disliked, return without changes
  }

  if (this.dislikes > 0) {
    this.dislikes -= 1;
  }
  if (userId) {
    this.dislikedBy = this.dislikedBy.filter(id => id.toString() !== userId.toString());
  }
  return this.save();
};

// Check if user has already engaged with this blog
blogSchema.methods.hasUserEngaged = function (userId = null) {
  if (!userId) return { hasLiked: false, hasDisliked: false };

  return {
    hasLiked: this.likedBy.includes(userId),
    hasDisliked: this.dislikedBy.includes(userId)
  };
};

// Static methods for engagement analytics
blogSchema.statics.getMostLiked = function (limit = 10) {
  return this.find({ status: 'published' })
    .sort({ likes: -1 })
    .limit(limit)
    .select('title slug likes dislikes views shares createdAt');
};

blogSchema.statics.getMostViewed = function (limit = 10) {
  return this.find({ status: 'published' })
    .sort({ views: -1 })
    .limit(limit)
    .select('title slug likes dislikes views shares createdAt');
};

blogSchema.statics.getMostShared = function (limit = 10) {
  return this.find({ status: 'published' })
    .sort({ shares: -1 })
    .limit(limit)
    .select('title slug likes dislikes views shares createdAt');
};

blogSchema.statics.getEngagementStats = function () {
  return this.aggregate([
    { $match: { status: 'published' } },
    {
      $group: {
        _id: null,
        totalLikes: { $sum: '$likes' },
        totalDislikes: { $sum: '$dislikes' },
        totalViews: { $sum: '$views' },
        totalShares: { $sum: '$shares' },
        averageLikes: { $avg: '$likes' },
        averageViews: { $avg: '$views' },
        blogCount: { $sum: 1 }
      }
    }
  ]);
};

module.exports = mongoose.model("Blog", blogSchema);
