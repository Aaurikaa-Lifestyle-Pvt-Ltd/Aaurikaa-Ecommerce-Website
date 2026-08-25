const mongoose = require("mongoose");

const districtSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "State",
      required: true,
    },
    code: {
      type: String, // Optional district code
      uppercase: true,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("District", districtSchema);
