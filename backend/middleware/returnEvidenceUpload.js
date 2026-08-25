const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const { handleUploadError } = require("./secureUpload");
const { uploadFileToR2 } = require("../services/r2UploadService");
const {
  MAX_RETURN_EVIDENCE_FILES,
} = require("../constants/returnRequestConstants");

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;

const IMAGE_MIME = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
};

const VIDEO_MIME = {
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov"],
};

const ALLOWED_MIME = { ...IMAGE_MIME, ...VIDEO_MIME };

function mediaTypeFromMime(mimetype) {
  if (IMAGE_MIME[mimetype]) return "image";
  if (VIDEO_MIME[mimetype]) return "video";
  return null;
}

const evidenceFileFilter = (req, file, cb) => {
  const allowed = ALLOWED_MIME[file.mimetype];
  if (!allowed) {
    return cb(
      new Error(
        "Invalid file type. Evidence must be an image (JPEG, PNG, WebP, GIF) or video (MP4, WebM, MOV)."
      )
    );
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (ext && !allowed.includes(ext)) {
    return cb(new Error("File extension does not match evidence file type."));
  }

  cb(null, true);
};

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  fileFilter: evidenceFileFilter,
  limits: {
    fileSize: VIDEO_MAX_BYTES,
    files: MAX_RETURN_EVIDENCE_FILES,
  },
}).array("evidence", MAX_RETURN_EVIDENCE_FILES);

function buildEvidenceStorageKey(buyerId, orderId, originalname) {
  const random = crypto.randomBytes(8).toString("hex");
  const ext = path.extname(originalname).toLowerCase() || "";
  const base =
    path
      .basename(originalname, ext)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80) || "evidence";

  return `returns/evidence/${buyerId}/${orderId}/${Date.now()}_${random}_${base}${ext}`;
}

const parseReturnEvidenceUpload = (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return next(err);
    next();
  });
};

const enforceEvidenceFileSizeLimits = (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];
  for (const file of files) {
    const mediaType = mediaTypeFromMime(file.mimetype);
    const max = mediaType === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (file.size > max) {
      const limitMb = Math.round(max / (1024 * 1024));
      return res.status(400).json({
        message: `${mediaType === "video" ? "Video" : "Image"} evidence must be ${limitMb}MB or smaller.`,
      });
    }
  }
  next();
};

const uploadReturnEvidenceToR2 = (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) {
    req.uploadedEvidence = [];
    return next();
  }

  const buyerId = req.user?.id || "unknown";
  const orderId = req.params?.id || "order";

  (async () => {
    try {
      const uploaded = [];
      for (const file of files) {
        const key = buildEvidenceStorageKey(buyerId, orderId, file.originalname);
        const result = await uploadFileToR2(file.buffer, key, file.mimetype);
        if (!result?.success || !result?.publicUrl) {
          throw new Error(result?.error || "Evidence upload failed");
        }
        uploaded.push({
          url: result.publicUrl,
          mediaType: mediaTypeFromMime(file.mimetype),
          fileName: file.originalname,
          uploadedAt: new Date(),
        });
      }
      req.uploadedEvidence = uploaded;
      next();
    } catch (err) {
      console.error("Return evidence R2 upload error:", err);
      return res.status(500).json({
        message: "Failed to upload evidence. Please try again later.",
      });
    }
  })();
};

const handleReturnEvidenceUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        message: `You can upload at most ${MAX_RETURN_EVIDENCE_FILES} evidence files.`,
      });
    }
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "Evidence file is too large.",
      });
    }
  }
  if (
    err?.message?.includes("Invalid file type") ||
    err?.message?.includes("File extension")
  ) {
    return res.status(400).json({ message: err.message });
  }
  return handleUploadError(err, req, res, next);
};

module.exports = {
  parseReturnEvidenceUpload,
  enforceEvidenceFileSizeLimits,
  uploadReturnEvidenceToR2,
  handleReturnEvidenceUploadError,
  mediaTypeFromMime,
  MAX_RETURN_EVIDENCE_FILES,
};
