/**
 * Computes the overall status of an import batch based on individual product decisions.
 * @param {Array} products - Array of product objects belonging to the batch
 * @returns {string} - Computed status: PENDING, APPROVED, REJECTED, or PARTIAL
 */
const computeBatchStatus = (products) => {
    if (!products || products.length === 0) return "PENDING";

    const total = products.length;
    const pendingCount = products.filter(p => p.importDecision === "PENDING").length;
    const approvedCount = products.filter(p => p.importDecision === "APPROVED").length;
    const rejectedCount = products.filter(p => p.importDecision === "REJECTED").length;

    if (pendingCount > 0) return "PENDING";
    if (approvedCount === total) return "APPROVED";
    if (rejectedCount === total) return "REJECTED";

    return "PARTIAL";
};

module.exports = computeBatchStatus;
