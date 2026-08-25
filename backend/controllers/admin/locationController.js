// backend/controllers/admin/locationController.js

const Country = require("../../models/location/Country");
const State = require("../../models/location/State");
const District = require("../../models/location/District");

// ================== COUNTRY CONTROLLERS ================== //

// Get all countries
exports.getCountries = async (req, res) => {
  try {
    const countries = await Country.find().sort({ name: 1 });
    res.json(countries);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch countries", error: err.message });
  }
};

// Add new country
exports.addCountry = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Country name is required" });
    }

    const existing = await Country.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: "Country already exists" });
    }

    const newCountry = new Country({ name });
    await newCountry.save();

    res.status(201).json({ message: "Country added successfully", country: newCountry });
  } catch (err) {
    res.status(500).json({ message: "Failed to add country", error: err.message });
  }
};

// Update country
exports.updateCountry = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updated = await Country.findByIdAndUpdate(id, { name }, { new: true });

    if (!updated) return res.status(404).json({ message: "Country not found" });

    res.json({ message: "Country updated successfully", country: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update country", error: err.message });
  }
};

// Delete country
exports.deleteCountry = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Country.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Country not found" });

    res.json({ message: "Country deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete country", error: err.message });
  }
};

// ================== STATE CONTROLLERS ================== //

// Get states (filter by country)
exports.getStates = async (req, res) => {
  try {
    const { country } = req.query;
    let query = {};
    if (country) query.country = country;

    const states = await State.find(query).populate("country", "name").sort({ name: 1 });
    res.json(states);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch states", error: err.message });
  }
};

// Add new state
exports.addState = async (req, res) => {
  try {
    const { name, country } = req.body;

    if (!name || !country) {
      return res.status(400).json({ message: "State name and country are required" });
    }

    const newState = new State({ name, country });
    await newState.save();

    res.status(201).json({ message: "State added successfully", state: newState });
  } catch (err) {
    res.status(500).json({ message: "Failed to add state", error: err.message });
  }
};

// Update state
exports.updateState = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, country } = req.body;

    const updated = await State.findByIdAndUpdate(id, { name, country }, { new: true });

    if (!updated) return res.status(404).json({ message: "State not found" });

    res.json({ message: "State updated successfully", state: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update state", error: err.message });
  }
};

// Delete state
exports.deleteState = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await State.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "State not found" });

    res.json({ message: "State deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete state", error: err.message });
  }
};

// ================== DISTRICT CONTROLLERS ================== //

// Get districts (filter by state)
exports.getDistricts = async (req, res) => {
  try {
    const { state } = req.query;
    let query = {};
    if (state) query.state = state;

    const districts = await District.find(query).populate("state", "name").sort({ name: 1 });
    res.json(districts);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch districts", error: err.message });
  }
};

// Add new district
exports.addDistrict = async (req, res) => {
  try {
    const { name, state } = req.body;

    if (!name || !state) {
      return res.status(400).json({ message: "District name and state are required" });
    }

    const newDistrict = new District({ name, state });
    await newDistrict.save();

    res.status(201).json({ message: "District added successfully", district: newDistrict });
  } catch (err) {
    res.status(500).json({ message: "Failed to add district", error: err.message });
  }
};

// Update district
exports.updateDistrict = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, state } = req.body;

    const updated = await District.findByIdAndUpdate(id, { name, state }, { new: true });

    if (!updated) return res.status(404).json({ message: "District not found" });

    res.json({ message: "District updated successfully", district: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update district", error: err.message });
  }
};

// Delete district
exports.deleteDistrict = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await District.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "District not found" });

    res.json({ message: "District deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete district", error: err.message });
  }
};
