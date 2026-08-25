const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");
const verifySeller = require("../middleware/verifySeller");
const loadAdminContext = require("../middleware/loadAdminContext");
const requirePermission = require("../middleware/requirePermission");
const multer = require("multer");
const { createFileFilter, FILE_SIZE_LIMITS, handleUploadError } = require("../middleware/secureUpload");
const path = require("path");

const runAdminMediaAuth = (req, res, next) => {
  const action = req.method === "GET" ? "view" : "manage";
  requirePermission("media", action)(req, res, next);
};

const verifyUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
      if (decoded.role === "admin") {
        req.user = decoded;
        return loadAdminContext(req, res, () => runAdminMediaAuth(req, res, next));
      }
    } catch (e) {
      // Token might be for seller, continue
    }
  }

  return verifySeller(req, res, next);
};

const mediaFileFilter = (req, file, cb) => {
  const isImage = file.mimetype.startsWith('image/');
  const isVideo = file.mimetype.startsWith('video/');

  const extension = path.extname(file.originalname).toLowerCase();
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.wmv', '.flv'];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp'];

  if (isImage || isVideo || videoExtensions.includes(extension) || imageExtensions.includes(extension)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images and videos are allowed."), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: mediaFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }
});

router.post("/upload", verifyUser, upload.single("file"), handleUploadError, mediaController.uploadMedia);
router.get("/", verifyUser, mediaController.getMyMedia);
router.put("/:id", verifyUser, mediaController.updateMedia);
router.delete("/:id", verifyUser, mediaController.deleteMedia);

module.exports = router;
