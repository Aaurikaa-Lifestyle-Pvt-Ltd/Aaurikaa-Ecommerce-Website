const express = require("express");
const router = express.Router();
const {
  getCountries,
  getStatesByCountry,
  getDistrictsByState,
} = require("../../controllers/locationController");

// ================= PUBLIC LOCATION ROUTES ================= //

// Get all countries (for dropdown)
router.get("/countries", getCountries);

// Get states by country (dropdown) -> /states?country=<countryId>
router.get("/states", getStatesByCountry);

// Get districts by state (dropdown) -> /districts?state=<stateId>
router.get("/districts", getDistrictsByState);

module.exports = router;
