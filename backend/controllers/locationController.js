const mongoose = require("mongoose");
const Country = require("../models/location/Country");
const State = require("../models/location/State");
const District = require("../models/location/District");

// -------------------- PUBLIC SIDE -------------------- //

// ➤ Get All Countries
exports.getCountries = async (req, res) => {
  try {
    const countries = await Country.find().sort({ name: 1 });
    res.json(countries);
  } catch (err) {
    console.error("❌ getCountries error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ➤ Get States by Country
exports.getStatesByCountry = async (req, res) => {
  try {
    const countryId = req.query.country || req.query.countryId; // ✅ flexible
    if (!countryId) {
      return res.status(400).json({ message: "country query is required" });
    }

    const states = await State.find({
      country: new mongoose.Types.ObjectId(countryId),
    }).sort({ name: 1 });

    res.json(states);
  } catch (err) {
    console.error("❌ getStatesByCountry error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ➤ Get Districts by State
exports.getDistrictsByState = async (req, res) => {
  try {
    const stateId = req.query.state || req.query.stateId; // ✅ flexible
    if (!stateId) {
      return res.status(400).json({ message: "state query is required" });
    }

    const districts = await District.find({
      state: new mongoose.Types.ObjectId(stateId),
    }).sort({ name: 1 });

    res.json(districts);
  } catch (err) {
    console.error("❌ getDistrictsByState error:", err);
    res.status(500).json({ message: err.message });
  }
};
