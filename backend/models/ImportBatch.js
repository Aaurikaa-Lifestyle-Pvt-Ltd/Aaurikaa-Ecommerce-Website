// backend/models/ImportBatch.js
const mongoose = require("mongoose");

const importBatchSchema = new mongoose.Schema(
    {
        uploader: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "role", // Dynamic ref based on role
            required: true,
        },
        role: {
            type: String,
            enum: ["Admin", "Seller"],
            required: true,
        },
        productCount: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED", "PARTIAL"],
            default: "PENDING",
        },
        // Optional: store file metadata
        fileName: String,
        fileUrl: String, // If stored in R2
        contractVersion: { type: String, default: "1.0" },
        fileHash: String,
        importMode: {
            type: String,
            enum: ["create", "upsert", "validate"],
            default: "create",
        },
        validationReport: {
            type: mongoose.Schema.Types.Mixed,
            default: undefined,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("ImportBatch", importBatchSchema);
