const Product = require("../models/Product");
const Blog = require("../models/Blog");
const { normalizeProductTagsForWrite } = require("../utils/productTags");

exports.getAllUniqueTags = async (req, res) => {
  try {
    const productTags = await Product.distinct("tags");
    const blogTags = await Blog.distinct("tags");

    const allTags = normalizeProductTagsForWrite([...productTags, ...blogTags]);

    res.set("Cache-Control", "public, max-age=60, s-maxage=60");
    res.status(200).json(allTags);
  } catch (err) {
    console.error("❌ Error fetching unique tags:", err);
    res.status(500).json({ message: "❌ Failed to fetch unique tags" });
  }
};