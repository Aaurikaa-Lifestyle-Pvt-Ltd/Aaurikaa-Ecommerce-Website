const mongoose = require("mongoose");

const countrySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String, // ISO code (e.g., IN, US)
      uppercase: true,
      trim: true,
    },
    phoneCode: {
      type: String, // e.g. +91, +1
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Country", countrySchema);
