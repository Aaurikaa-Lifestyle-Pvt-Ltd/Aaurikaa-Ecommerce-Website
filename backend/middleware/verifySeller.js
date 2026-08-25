// backend/middleware/verifySeller.js
const jwt = require("jsonwebtoken");
const Seller = require("../models/Seller");

const verifySeller = async (req, res, next) => {
  try {
    let token;

    if (req.cookies?.sellerToken) {
      token = req.cookies.sellerToken;
    } else if (req.headers["authorization"]?.startsWith("Bearer ")) {
      token = req.headers["authorization"].split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const seller = await Seller.findById(decoded.id).select("-password");

    if (!seller) {
      return res.status(401).json({ message: "Unauthorized: Seller not found" });
    }

    if (!seller.isApproved) {
      return res.status(403).json({ message: "Your account is not yet approved by admin." });
    }

    req.user = {
      ...seller.toObject(),
      role: "seller", // ✅ Ensure role is present
    };
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};

module.exports = verifySeller;
