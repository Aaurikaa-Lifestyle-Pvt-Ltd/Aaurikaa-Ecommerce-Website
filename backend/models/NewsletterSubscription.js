const mongoose = require('mongoose');

const newsletterSubscriptionSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
  },
  subscribedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Add index on email for faster lookup
newsletterSubscriptionSchema.index({ email: 1 });

module.exports = mongoose.model('NewsletterSubscription', newsletterSubscriptionSchema);
