
const mongoose = require("mongoose");
const {
  ADMIN_PASSWORD_REGEX,
  ADMIN_PASSWORD_MESSAGE,
} = require("../utils/adminPasswordPolicy");

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Admin name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [50, "Name cannot exceed 50 characters"],
      validate: {
        validator: function(v) {
          return /^[a-zA-Z\s]+$/.test(v);
        },
        message: "Name can only contain letters and spaces"
      }
    },
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, "Username must be at least 3 characters long"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      validate: {
        validator: function(v) {
          return /^[a-zA-Z0-9_]+$/.test(v);
        },
        message: "Username can only contain letters, numbers, and underscores"
      }
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: function(v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: "Please provide a valid email address"
      }
    },
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Optional field
          return /^[\+]?[1-9][\d]{0,15}$/.test(v);
        },
        message: "Please provide a valid phone number"
      }
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
      validate: {
        validator: function (v) {
          if (!this.isModified("password")) return true;
          return ADMIN_PASSWORD_REGEX.test(v);
        },
        message: ADMIN_PASSWORD_MESSAGE,
      }
    },
    profileImage: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true; // Optional field
          return /\.(jpg|jpeg|png|gif|webp)$/i.test(v);
        },
        message: "Profile image must be a valid image file (jpg, jpeg, png, gif, webp)"
      }
    },
    role: {
      type: String,
      enum: {
        values: ["admin"],
        message: "Role must be 'admin'"
      },
      default: "admin"
    },
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },
    permissions: {
      type: [String],
      default: [],
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    displayLabel: {
      type: String,
      trim: true,
      maxlength: [100, "Display label cannot exceed 100 characters"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLogin: {
      type: Date
    },
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for better query performance
adminSchema.index({ email: 1 });
adminSchema.index({ username: 1 });
adminSchema.index({ isActive: 1 });
adminSchema.index({ isSuperAdmin: 1 });

// Virtual for account lock status
adminSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const bcrypt = require('bcrypt');
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare password
adminSchema.methods.comparePassword = async function(candidatePassword) {
  const bcrypt = require('bcrypt');
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to increment login attempts
adminSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Static method to find by email or username
adminSchema.statics.findByCredentials = function(emailOrUsername) {
  return this.findOne({
    $or: [
      { email: emailOrUsername },
      { username: emailOrUsername }
    ],
    isActive: true
  });
};

module.exports = mongoose.model("Admin", adminSchema);
