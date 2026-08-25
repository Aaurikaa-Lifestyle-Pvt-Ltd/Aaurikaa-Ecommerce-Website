// backend/middleware/verifyCategory.js

const jwt = require("jsonwebtoken");

// 🔐 Verify Admin Middleware
const verifyAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized: No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Not an admin" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(400).json({ message: "Invalid token" });
  }
};

// 🛡️ Validate Category Input Middleware
const validateCategoryInput = (req, res, next) => {
  const { name } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ message: "❌ Name is required" });
  }
  next();
};

module.exports = {
  verifyAdmin,
  validateCategoryInput,
};
