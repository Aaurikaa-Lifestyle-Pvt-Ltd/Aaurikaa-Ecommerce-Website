const express = require("express");
const router = express.Router();

const { getSuggestions } = require("../controllers/globalSearchController");

router.get("/suggestions", getSuggestions);

module.exports = router;
