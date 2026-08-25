// backend/middleware/maintenanceMode.js
const SiteSettings = require("../models/SiteSettings");
const { sendErrorResponse, HTTP_STATUS, ERROR_CODES } = require("../utils/errorHandler");

/**
 * Maintenance Mode Middleware
 * Blocks all public requests when maintenance is enabled
 * Allows admin users to bypass maintenance mode
 */
const maintenanceMode = async (req, res, next) => {
  try {
    // Allow static files and maintenance status endpoint to pass through
    if (
      req.path.startsWith('/uploads/') ||
      req.path.startsWith('/api/settings/maintenance') ||
      req.path === '/api/admin/login'
    ) {
      return next();
    }

    // Get maintenance settings from database
    let settings = await SiteSettings.findOne();
    
    // If no settings exist, create default
    if (!settings) {
      settings = new SiteSettings();
      await settings.save();
    }

    // Check if maintenance mode is enabled
    const isMaintenanceEnabled = settings.maintenance?.enabled || false;
    
    // Also check environment variable as fallback (for quick enable/disable)
    const envMaintenance = process.env.MAINTENANCE_MODE === 'true';
    
    if (!isMaintenanceEnabled && !envMaintenance) {
      // Maintenance mode is OFF, proceed normally
      return next();
    }

    // Maintenance mode is ON - check if user is admin
    // Check for admin token in Authorization header
    const authHeader = req.headers.authorization;
    let isAdmin = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const jwt = require("jsonwebtoken");
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify admin role
        if (decoded.role === "admin") {
          isAdmin = true;
        }
      } catch (err) {
        // Token invalid or expired - not an admin
        isAdmin = false;
      }
    }

    // Allow admin to bypass maintenance
    if (isAdmin) {
      return next();
    }

    // Block all other requests with maintenance response
    return sendErrorResponse(
      res,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      settings.maintenance?.message || "The site is currently under maintenance. Please check back later.",
      'MAINTENANCE_MODE',
      {
        maintenance: true,
        message: settings.maintenance?.message || "We're currently performing scheduled maintenance. We'll be back shortly."
      }
    );
  } catch (error) {
    // If there's an error checking maintenance mode, log it but don't block requests
    // This prevents maintenance check from breaking the site
    console.error("❌ Maintenance mode check error:", error);
    return next();
  }
};

module.exports = maintenanceMode;

