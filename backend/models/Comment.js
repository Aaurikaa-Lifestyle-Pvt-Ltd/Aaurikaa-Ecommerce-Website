// backend/models/Comment.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  // Blog post reference
  blog: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Blog',
    required: [true, 'Comment must be associated with a blog post']
  },
  
  // Comment content
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    minlength: [1, 'Comment must be at least 1 character long'],
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },
  
  // Comment author information
  author: {
    name: {
      type: String,
      required: [true, 'Author name is required'],
      trim: true,
      minlength: [1, 'Author name must be at least 1 character long'],
      maxlength: [100, 'Author name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Author email is required'],
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
    },
    website: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+/, 'Website must be a valid URL']
    }
  },
  
  // Comment status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'spam'],
    default: 'pending'
  },
  
  // Comment moderation
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  moderatedAt: {
    type: Date
  },
  
  moderationReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Moderation reason cannot exceed 500 characters']
  },
  
  // Comment hierarchy (for nested comments)
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  
  // Comment metadata
  ipAddress: {
    type: String,
    required: true
  },
  
  userAgent: {
    type: String,
    trim: true
  },
  
  // Comment engagement
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
  
  // Comment flags
  isEdited: {
    type: Boolean,
    default: false
  },
  
  editedAt: {
    type: Date
  },
  
  // SEO and analytics
  metaKeywords: {
    type: [String],
    default: []
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
commentSchema.index({ blog: 1, createdAt: -1 });
commentSchema.index({ status: 1 });
commentSchema.index({ parentComment: 1 });
commentSchema.index({ 'author.email': 1 });
commentSchema.index({ createdAt: -1 });

// Virtual for comment depth (for nested comments)
commentSchema.virtual('depth').get(function() {
  return this.parentComment ? 1 : 0; // Simple 2-level nesting
});

// Virtual for comment URL
commentSchema.virtual('url').get(function() {
  return `/blog/${this.blog}/comments/${this._id}`;
});

// Pre-save middleware
commentSchema.pre('save', function(next) {
  // Update updatedAt timestamp
  this.updatedAt = new Date();
  
  // Auto-approve comments from trusted sources (optional)
  if (this.isNew && this.author.email) {
    // You can add logic here to auto-approve based on email domain or other criteria
    // For now, all comments start as pending
  }
  
  next();
});

// Pre-save middleware for edited comments
commentSchema.pre('save', function(next) {
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }
  next();
});

// Instance methods
commentSchema.methods.approve = function(moderatorId, reason = '') {
  this.status = 'approved';
  this.moderatedBy = moderatorId;
  this.moderatedAt = new Date();
  this.moderationReason = reason;
  return this.save();
};

commentSchema.methods.reject = function(moderatorId, reason = '') {
  this.status = 'rejected';
  this.moderatedBy = moderatorId;
  this.moderatedAt = new Date();
  this.moderationReason = reason;
  return this.save();
};

commentSchema.methods.markAsSpam = function(moderatorId, reason = '') {
  this.status = 'spam';
  this.moderatedBy = moderatorId;
  this.moderatedAt = new Date();
  this.moderationReason = reason;
  return this.save();
};

commentSchema.methods.like = function() {
  this.likes += 1;
  return this.save();
};

commentSchema.methods.dislike = function() {
  this.dislikes += 1;
  return this.save();
};

// Static methods
commentSchema.statics.getByBlog = function(blogId, options = {}) {
  const {
    status = 'approved',
    includeReplies = true,
    sortBy = 'createdAt',
    sortOrder = 'asc',
    limit = 50,
    skip = 0
  } = options;

  let query = { blog: blogId, status };
  
  if (!includeReplies) {
    query.parentComment = null;
  }

  return this.find(query)
    .populate('moderatedBy', 'name email')
    .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
    .limit(limit)
    .skip(skip);
};

commentSchema.statics.getPendingComments = function(limit = 20, skip = 0) {
  return this.find({ status: 'pending' })
    .populate('blog', 'title slug')
    .populate('moderatedBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

commentSchema.statics.getCommentStats = function(blogId = null) {
  const matchStage = blogId ? { blog: new mongoose.Types.ObjectId(blogId) } : {};
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalLikes: { $sum: '$likes' },
        totalDislikes: { $sum: '$dislikes' }
      }
    }
  ]);
};

commentSchema.statics.getRecentComments = function(limit = 10) {
  return this.find({ status: 'approved' })
    .populate('blog', 'title slug')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Get threaded comments for a blog post
commentSchema.statics.getThreadedComments = function(blogId, options = {}) {
  const {
    status = 'approved',
    sortBy = 'createdAt',
    sortOrder = 'asc'
  } = options;

  return this.find({ blog: blogId, status })
    .populate('moderatedBy', 'name email')
    .populate('parentComment', 'author.name content createdAt')
    .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 });
};

// Get replies for a specific comment
commentSchema.statics.getReplies = function(parentCommentId, options = {}) {
  const {
    status = 'approved',
    sortBy = 'createdAt',
    sortOrder = 'asc'
  } = options;

  return this.find({ parentComment: parentCommentId, status })
    .populate('moderatedBy', 'name email')
    .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 });
};

// Get comment count including replies
commentSchema.statics.getCommentCountWithReplies = function(blogId, status = 'approved') {
  return this.countDocuments({ blog: blogId, status });
};

// Validation middleware
commentSchema.pre('validate', function(next) {
  // Check for spam patterns (basic implementation)
  if (this.content) {
    const spamKeywords = ['spam', 'scam', 'fake', 'viagra', 'casino', 'loan'];
    const contentLower = this.content.toLowerCase();
    
    if (spamKeywords.some(keyword => contentLower.includes(keyword))) {
      this.status = 'spam';
    }
  }
  
  next();
});

// Export the model
module.exports = mongoose.model('Comment', commentSchema);
