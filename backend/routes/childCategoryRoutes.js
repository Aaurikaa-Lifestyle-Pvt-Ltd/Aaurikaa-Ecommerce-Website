const express = require("express");
const router = express.Router();
const { verifyAdmin } = require("../middleware/verifyCategory"); // Assuming verifyAdmin is used for child category management

const {
  getAllChildCategories,
  getChildCategoryById,
} = require("../controllers/categoryController");

// GET all child categories
router.get("/", getAllChildCategories);

// GET child category by ID
router.get("/:id", getChildCategoryById);

module.exports = router;