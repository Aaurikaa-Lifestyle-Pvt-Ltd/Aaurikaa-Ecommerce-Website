const mongoose = require("mongoose");

const MediaSchema = new mongoose.Schema(
  {
    storage_key: {
      type: String,
      required: true,
      unique: true,
      comment: "Immutable Cloudflare R2 key",
    },
    public_url: {
      type: String,
      required: true,
    },
    media_type: {
      type: String,
      enum: ["image", "video"],
      required: true,
    },
    original_filename: {
      type: String,
    },
    display_name: {
      type: String,
    },
    alt_text: {
      type: String,
      default: "",
    },
    mime_type: {
      type: String,
    },
    size: {
      type: Number,
      comment: "File size in bytes",
    },
    owner_type: {
      type: String,
      enum: ["admin", "seller"],
      required: true,
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "owner_type_ref",
    },
    is_shared: {
      type: Boolean,
      default: false,
      comment: "If true, other sellers can view/use this (primarily for admin-shared assets)",
    },
    is_deleted: {
      type: Boolean,
      default: false,
      comment: "Soft delete flag",
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for dynamic refPath (though refPath doesn't work perfectly with enums in some versions, 
// we'll handle it via manual populates or specific lookups if needed)
MediaSchema.virtual("owner_type_ref").get(function () {
  return this.owner_type === "admin" ? "Admin" : "Seller";
});

module.exports = mongoose.model("Media", MediaSchema);
