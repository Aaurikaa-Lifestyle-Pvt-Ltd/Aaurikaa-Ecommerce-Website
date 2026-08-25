const Media = require("../models/Media");
const path = require("path");
const { uploadWithNaming } = require("./mediaNamingService");
const r2UploadService = require("./r2UploadService");

const isMediaNamingV2 = () => process.env.MEDIA_NAMING_V2 === "true";

/**
 * Handle media upload and record creation
 * @param {Object} file - Express file object (multer)
 * @param {Object} owner - { id, type }
 * @param {Object} metadata - { display_name, alt_text, is_shared }
 * @returns {Promise<Object>} - Created media record
 */
exports.uploadMedia = async (file, owner, metadata = {}) => {
    const extension =
        path.extname(file.originalname || "").toLowerCase() ||
        (file.mimetype === "image/png" ? ".png" : ".jpg");

    let key;
    let publicUrl;

    if (isMediaNamingV2()) {
        const baseLabel =
            metadata.display_name ||
            (file.originalname || "untitled-asset").replace(/\.[^/.]+$/, "");

        const namingResult = await uploadWithNaming(
            file.buffer,
            {
                mediaCategory: "media",
                baseLabel,
                extension,
            },
            file.mimetype
        );
        key = namingResult.key;
        publicUrl = namingResult.publicUrl;
    } else {
        const folder =
            owner.type === "admin"
                ? "admin/gallery"
                : `sellers/${owner.id}/gallery`;
        key = r2UploadService.generateSecureFilename(file.originalname, folder);

        const uploadResult = await r2UploadService.uploadFileToR2(
            file.buffer,
            key,
            file.mimetype
        );

        if (!uploadResult.success) {
            throw new Error(`R2 Upload failed: ${uploadResult.error}`);
        }
        publicUrl = uploadResult.publicUrl;
    }

    const videoExtensions = [
        ".mp4",
        ".webm",
        ".ogg",
        ".mov",
        ".avi",
        ".mkv",
        ".wmv",
        ".flv",
    ];
    const isVideo =
        file.mimetype.startsWith("video/") ||
        videoExtensions.includes(extension);

    const media = new Media({
        storage_key: key,
        public_url: publicUrl,
        media_type: isVideo ? "video" : "image",
        original_filename: file.originalname,
        display_name: metadata.display_name || file.originalname,
        alt_text: metadata.alt_text || "",
        mime_type: file.mimetype,
        size: file.size,
        owner_type: owner.type,
        owner_id: owner.id,
        is_shared: metadata.is_shared || false,
    });

    await media.save();
    return media;
};

/**
 * Get media for a specific owner
 */
exports.getMediaByOwner = async (ownerId, ownerType, filters = {}) => {
    const query = {
        owner_id: ownerId,
        owner_type: ownerType,
        is_deleted: false,
        ...filters,
    };
    return await Media.find(query).sort({ createdAt: -1 });
};

/**
 * Update media metadata
 */
exports.updateMedia = async (mediaId, ownerId, ownerType, updateData) => {
    const safeUpdate = {
        display_name: updateData.display_name,
        alt_text: updateData.alt_text,
    };

    if (ownerType === "admin") {
        safeUpdate.is_shared = updateData.is_shared;
    }

    const query = { _id: mediaId, owner_id: ownerId, owner_type: ownerType };
    const media = await Media.findOneAndUpdate(query, { $set: safeUpdate }, { new: true });
    if (!media) throw new Error("Media not found or unauthorized");
    return media;
};

/**
 * Check if media is referenced by products or blogs
 */
exports.isMediaReferenced = async (mediaId, publicUrl) => {
    const Product = require("../models/Product");
    const Blog = require("../models/Blog");

    const query = {
        $or: [
            { mainImageId: mediaId },
            { galleryImageIds: mediaId },
            { videoId: mediaId },
            { mainImage: publicUrl },
            { galleryImages: publicUrl },
            { video: publicUrl },
            { imageId: mediaId },
            { image: publicUrl },
        ],
    };

    const [productUsage, blogUsage] = await Promise.all([
        Product.exists(query),
        Blog.exists(query),
    ]);

    return productUsage || blogUsage;
};

/**
 * Soft delete media
 */
exports.softDeleteMedia = async (mediaId, ownerId, ownerType) => {
    const media = await Media.findOne({ _id: mediaId, owner_id: ownerId, owner_type: ownerType });
    if (!media) throw new Error("Media not found or unauthorized");

    const isReferenced = await exports.isMediaReferenced(mediaId, media.public_url);
    if (isReferenced) {
        throw new Error("❌ Cannot delete media that is currently referenced by products or blogs.");
    }

    media.is_deleted = true;
    await media.save();
    return media;
};

/**
 * Get shared media (for sellers to use admin-shared assets)
 */
exports.getSharedMedia = async () => {
    return await Media.find({ is_shared: true, is_deleted: false }).sort({ createdAt: -1 });
};
