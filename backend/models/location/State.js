const mongoose = require("mongoose");

const stateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Country",
      required: true,
    },
    code: {
      type: String, // Optional short code (e.g., MH for Maharashtra, CA for California)
      uppercase: true,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("State", stateSchema);
