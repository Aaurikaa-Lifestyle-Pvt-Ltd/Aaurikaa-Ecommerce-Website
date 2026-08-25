// backend/controllers/skuRuleController.js
const SkuRule = require("../../models/SkuRule");
const { sendErrorResponse, sendSuccessResponse, HTTP_STATUS, ERROR_CODES, asyncHandler } = require("../../utils/errorHandler");

/**
 * Get active SKU rule
 */
exports.getActiveRule = asyncHandler(async (req, res) => {
    const rule = await SkuRule.findOne({ isActive: true });
    if (!rule) {
        return sendSuccessResponse(res, HTTP_STATUS.OK, "No active SKU rule found", { rule: null });
    }
    
    // Clean segments in response to filter out invalid types
    const ruleObj = rule.toObject();
    if (ruleObj.segments && Array.isArray(ruleObj.segments)) {
        ruleObj.segments = cleanSegments(ruleObj.segments);
    }
    
    sendSuccessResponse(res, HTTP_STATUS.OK, "Active SKU rule retrieved", { rule: ruleObj });
});

/**
 * Get all SKU rules
 */
exports.getAllRules = asyncHandler(async (req, res) => {
    const rules = await SkuRule.find().sort({ createdAt: -1 });
    
    // Clean segments in response to filter out invalid types
    const cleanedRules = rules.map(rule => {
        const ruleObj = rule.toObject();
        if (ruleObj.segments && Array.isArray(ruleObj.segments)) {
            ruleObj.segments = cleanSegments(ruleObj.segments);
        }
        return ruleObj;
    });
    
    sendSuccessResponse(res, HTTP_STATUS.OK, "SKU rules retrieved", { rules: cleanedRules });
});

/**
 * Create a new SKU rule
 */
exports.createRule = asyncHandler(async (req, res) => {
    const { name, description, segments, separator, allowedCharacters, isActive } = req.body;

    // Basic validation
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Segments are required", ERROR_CODES.INVALID_INPUT);
    }

    // Clean and validate segments
    const cleanedSegments = cleanSegments(segments);
    
    if (cleanedSegments.length === 0) {
        return sendErrorResponse(
            res, 
            HTTP_STATUS.BAD_REQUEST, 
            "At least one valid segment is required", 
            ERROR_CODES.INVALID_INPUT
        );
    }

    // Sort segments by order
    cleanedSegments.sort((a, b) => (a.order || 0) - (b.order || 0));

    const rule = new SkuRule({
        name,
        description,
        segments: cleanedSegments,
        separator,
        allowedCharacters,
        isActive
    });

    await rule.save();
    sendSuccessResponse(res, HTTP_STATUS.CREATED, "SKU rule created successfully", { rule });
});

/**
 * Valid segment types (from enum)
 */
const VALID_SEGMENT_TYPES = [
    "category_name",
    "product_name",
    "quantity",
    "pack_size",
    "weight_number",
    "brand_name",
    "seller_shop_name",
    "regular_price",
    "sale_price"
];

/**
 * Validate and clean segments - filter out invalid types
 */
const cleanSegments = (segments) => {
    if (!Array.isArray(segments)) return segments;
    
    return segments
        .filter(seg => seg && seg.type && VALID_SEGMENT_TYPES.includes(seg.type))
        .map(seg => ({
            type: seg.type,
            length: seg.length || null,
            prefix: seg.prefix || null,
            suffix: seg.suffix || null,
            enabled: seg.enabled !== false,
            order: seg.order || 0
        }));
};

/**
 * Update SKU rule
 */
exports.updateRule = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Clean and validate segments if provided
    if (updateData.segments && Array.isArray(updateData.segments)) {
        const cleanedSegments = cleanSegments(updateData.segments);
        
        if (cleanedSegments.length === 0) {
            return sendErrorResponse(
                res, 
                HTTP_STATUS.BAD_REQUEST, 
                "At least one valid segment is required", 
                ERROR_CODES.INVALID_INPUT
            );
        }
        
        updateData.segments = cleanedSegments;
        updateData.segments.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    const rule = await SkuRule.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!rule) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "SKU rule not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    sendSuccessResponse(res, HTTP_STATUS.OK, "SKU rule updated successfully", { rule });
});

/**
 * Delete SKU rule
 */
exports.deleteRule = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const rule = await SkuRule.findByIdAndDelete(id);
    if (!rule) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "SKU rule not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    sendSuccessResponse(res, HTTP_STATUS.OK, "SKU rule deleted successfully");
});
