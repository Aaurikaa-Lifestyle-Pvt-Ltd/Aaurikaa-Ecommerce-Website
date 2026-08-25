// backend/middleware/verifyAdmin.js
const jwt = require("jsonwebtoken");

const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "❌ No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Validate that the user has admin role
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "❌ Access denied. Admin role required." });
    }

    req.user = decoded;
    // Normalize for controllers that expect req.user._id (JWT payload uses "id")
    req.user._id = decoded.id;

    next();
  } catch (err) {
    console.error("❌ Token verification failed:", err.message);
    return res.status(403).json({ message: "❌ Invalid token" });
  }
};

module.exports = verifyAdmin;
