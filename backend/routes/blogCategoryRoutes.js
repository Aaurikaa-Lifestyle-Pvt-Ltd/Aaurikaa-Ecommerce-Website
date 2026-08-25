const express = require("express");
const router = express.Router();
const BlogCategory = require("../models/BlogCategory");
const { validateBlogCategory } = require("../middleware/validation");
const { withAdminAuth } = require("../utils/adminAuthChain");

const contentManage = withAdminAuth("content", "manage");

router.post("/add", ...contentManage, validateBlogCategory, async (req, res) => {
  try {
    const { name, description } = req.body;

    const existingCategory = await BlogCategory.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existingCategory) {
      return res.status(400).json({ 
        message: "❌ Category with this name already exists" 
      });
    }

    const category = new BlogCategory({ name, description });
    await category.save();

    res.json({ message: "✅ Category added successfully", category });
  } catch (err) {
    console.error("❌ Add Category Error:", err.message);
    
    if (err.code === 11000) {
      return res.status(400).json({ 
        message: "❌ Category with this name already exists" 
      });
    }
    
    res.status(500).json({ message: "❌ Failed to add category", error: err.message });
  }
});

router.get("/all", async (req, res) => {
  try {
    const categories = await BlogCategory.find().sort({ createdAt: -1 });
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ message: "Failed to load categories" });
  }
});

router.delete("/delete/:id", ...contentManage, async (req, res) => {
  try {
    await BlogCategory.findByIdAndDelete(req.params.id);
    res.json({ message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete category" });
  }
});

module.exports = router;
