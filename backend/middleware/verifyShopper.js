const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;

  // Handle both Bearer token and non-prefixed token
  if (authHeader) {
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else {
      // Non-prefixed token (direct token in Authorization header)
      token = authHeader;
    }
  }

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: "Unauthorized: No token provided. Please log in to continue." 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validate role equals "shopper"
    if (decoded.role !== "shopper") {
      return res.status(403).json({ 
        success: false,
        message: "Forbidden: Access denied. Shopper role required." 
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    // Provide clear error messages based on error type
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ 
        success: false,
        message: "Token expired. Please log in again." 
      });
    } else if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ 
        success: false,
        message: "Invalid token. Please log in again." 
      });
    } else {
      return res.status(401).json({ 
        success: false,
        message: "Invalid or expired token. Please log in again." 
      });
    }
  }
};
