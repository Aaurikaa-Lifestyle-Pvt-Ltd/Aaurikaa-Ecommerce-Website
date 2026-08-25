// backend/controllers/admin/importBatchController.js
const ImportBatch = require("../../models/ImportBatch");
const Product = require("../../models/Product");
const computeBatchStatus = require("../../utils/computeBatchStatus");
const { sendErrorResponse, sendSuccessResponse, HTTP_STATUS, ERROR_CODES, asyncHandler } = require("../../utils/errorHandler");

/**
 * List all import batches (Admin)
 */
exports.getImportBatches = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const batches = await ImportBatch.find(filter)
        .populate("uploader", "firstName lastName shopName")
        .sort({ createdAt: -1 });

    // Get breakdown for each batch
    const batchesWithBreakdown = await Promise.all(batches.map(async (batch) => {
        const products = await Product.find({ batchId: batch._id }, "importDecision");
        const total = products.length;
        const pending = products.filter(p => p.importDecision === "PENDING").length;
        const approved = products.filter(p => p.importDecision === "APPROVED").length;
        const rejected = products.filter(p => p.importDecision === "REJECTED").length;

        // Derived status
        const derivedStatus = computeBatchStatus(products);

        // Sync with DB if different (Step 4 & 5 compliance)
        if (batch.status !== derivedStatus) {
            batch.status = derivedStatus;
            await batch.save();
        }

        return {
            ...batch._doc,
            breakdown: { total, pending, approved, rejected }
        };
    }));

    sendSuccessResponse(res, HTTP_STATUS.OK, "Import batches retrieved", { batches: batchesWithBreakdown });
});

/**
 * Get batch details with associated products and their import decisions
 */
exports.getBatchDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const batch = await ImportBatch.findById(id).populate("uploader", "firstName lastName shopName");
    if (!batch) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Batch not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const products = await Product.find({ batchId: id })
        .populate("category subcategory childCategory brand", "name");

    // Re-sync batch status just in case
    const derivedStatus = computeBatchStatus(products);
    if (batch.status !== derivedStatus) {
        batch.status = derivedStatus;
        await batch.save();
    }

    sendSuccessResponse(res, HTTP_STATUS.OK, "Batch details retrieved", {
        batch: {
            ...batch._doc,
            status: derivedStatus
        },
        products
    });
});

/**
 * Approve an individual product in a batch
 */
exports.approveProduct = asyncHandler(async (req, res) => {
    const { batchId, productId } = req.params;

    const product = await Product.findOne({ _id: productId, batchId });
    if (!product) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Product not found in this batch", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    // Update product
    product.importDecision = "APPROVED";
    product.status = "published";
    product.approvalStatus = "approved";
    await product.save();

    // Recompute batch status
    const allProducts = await Product.find({ batchId });
    const newStatus = computeBatchStatus(allProducts);
    await ImportBatch.findByIdAndUpdate(batchId, { status: newStatus });

    sendSuccessResponse(res, HTTP_STATUS.OK, "Product approved successfully", {
        product,
        batchStatus: newStatus
    });
});

/**
 * Reject an individual product in a batch
 */
exports.rejectProduct = asyncHandler(async (req, res) => {
    const { batchId, productId } = req.params;

    const product = await Product.findOne({ _id: productId, batchId });
    if (!product) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Product not found in this batch", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    // Update product
    product.importDecision = "REJECTED";
    // Keep status as draft/unpublished
    product.approvalStatus = "rejected";
    await product.save();

    // Recompute batch status
    const allProducts = await Product.find({ batchId });
    const newStatus = computeBatchStatus(allProducts);
    await ImportBatch.findByIdAndUpdate(batchId, { status: newStatus });

    sendSuccessResponse(res, HTTP_STATUS.OK, "Product rejected successfully", {
        product,
        batchStatus: newStatus
    });
});

/**
 * Approve an entire import batch (Shortcut)
 */
exports.approveBatch = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const batch = await ImportBatch.findById(id);
    if (!batch) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Batch not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    // Update all pending products to APPROVED
    await Product.updateMany(
        { batchId: id, importDecision: "PENDING" },
        {
            $set: {
                importDecision: "APPROVED",
                status: "published",
                approvalStatus: "approved"
            }
        }
    );

    // Verify status
    const allProducts = await Product.find({ batchId: id });
    const newStatus = computeBatchStatus(allProducts);

    batch.status = newStatus;
    await batch.save();

    sendSuccessResponse(res, HTTP_STATUS.OK, "Batch approved successfully");
});

/**
 * Reject an entire import batch (Shortcut)
 */
exports.rejectBatch = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const batch = await ImportBatch.findById(id);
    if (!batch) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Batch not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    // Update all pending products to REJECTED
    await Product.updateMany(
        { batchId: id, importDecision: "PENDING" },
        {
            $set: {
                importDecision: "REJECTED",
                approvalStatus: "rejected",
                status: "draft"
            }
        }
    );

    // Verify status
    const allProducts = await Product.find({ batchId: id });
    const newStatus = computeBatchStatus(allProducts);

    batch.status = newStatus;
    await batch.save();

    sendSuccessResponse(res, HTTP_STATUS.OK, "Batch rejected successfully");
});
