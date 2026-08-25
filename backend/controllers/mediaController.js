const mediaService = require("../services/mediaService");
const { sendErrorResponse, sendSuccessResponse, HTTP_STATUS, ERROR_CODES, asyncHandler } = require("../utils/errorHandler");

/**
 * Upload single media
 */
exports.uploadMedia = asyncHandler(async (req, res) => {
    if (!req.file) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "No file uploaded", ERROR_CODES.INVALID_INPUT);
    }

    const owner = {
        id: req.user._id || req.user.id,
        type: req.user.role === "admin" ? "admin" : "seller"
    };

    const metadata = {
        display_name: req.body.display_name,
        alt_text: req.body.alt_text,
        is_shared: req.body.is_shared === "true" || req.body.is_shared === true
    };

    const media = await mediaService.uploadMedia(req.file, owner, metadata);
    sendSuccessResponse(res, HTTP_STATUS.CREATED, "Media uploaded successfully", media);
});

/**
 * Get all media for current user
 */
exports.getMyMedia = asyncHandler(async (req, res) => {
    const ownerId = req.user._id || req.user.id;
    const ownerType = req.user.role === "admin" ? "admin" : "seller";

    const media = await mediaService.getMediaByOwner(ownerId, ownerType);

    // If seller, also get shared admin media
    let sharedMedia = [];
    if (ownerType === "seller") {
        sharedMedia = await mediaService.getSharedMedia();
    }

    sendSuccessResponse(res, HTTP_STATUS.OK, "Media fetched successfully", {
        myMedia: media,
        sharedMedia: sharedMedia
    });
});

/**
 * Update media metadata
 */
exports.updateMedia = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerId = req.user._id || req.user.id;
    const ownerType = req.user.role === "admin" ? "admin" : "seller";

    const media = await mediaService.updateMedia(id, ownerId, ownerType, req.body);
    sendSuccessResponse(res, HTTP_STATUS.OK, "Media updated successfully", media);
});

/**
 * Delete media (soft)
 */
exports.deleteMedia = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerId = req.user._id || req.user.id;
    const ownerType = req.user.role === "admin" ? "admin" : "seller";

    const media = await mediaService.softDeleteMedia(id, ownerId, ownerType);
    sendSuccessResponse(res, HTTP_STATUS.OK, "Media moved to trash", media);
});

