const express = require("express");
const router = express.Router();
const tagController = require("../controllers/tagController");

// GET all unique tags from products and blogs
router.get("/unique", tagController.getAllUniqueTags);

module.exports = router;
