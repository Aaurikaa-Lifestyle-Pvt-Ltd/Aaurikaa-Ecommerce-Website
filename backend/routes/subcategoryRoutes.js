// routes/subcategoryRoutes.js
const express = require("express");
const router = express.Router();
const Subcategory = require("../models/Subcategory");
const { verifyAdmin } = require("../middleware/verifyCategory");
const {
  getAllSubcategories,
  getSubcategoryById,
  getSubcategoriesByCategoryId,
} = require("../controllers/categoryController");

// GET all subcategories
router.get("/", getAllSubcategories);

// GET subcategory by ID
router.get("/:id", getSubcategoryById);

module.exports = router;
