const Order = require('../../models/Order');
const shipRocketService = require('../../services/shipRocketService');
const { asyncHandler, sendErrorResponse, sendSuccessResponse, HTTP_STATUS, ERROR_CODES } = require('../../utils/errorHandler');

const orderFulfillmentService = require('../../services/orderFulfillmentService');
const { orderRequiresShipping } = require('../../utils/orderFulfillmentGuards');

/**
 * Manually trigger Shiprocket Sync
 */
exports.manualSync = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate('items.product');

    if (!order) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Order not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    if (!orderRequiresShipping(order)) {
        return sendErrorResponse(
            res,
            HTTP_STATUS.BAD_REQUEST,
            "Shiprocket sync is not applicable for orders without physical shipping",
            ERROR_CODES.VALIDATION_FAILED
        );
    }

    // Force promotion to shiprocket if requested manually
    order.shippingProvider = 'shiprocket';
    await order.save();

    await orderFulfillmentService.syncToShiprocket(order._id);

    // Refresh order to get updated IDs
    const updatedOrder = await Order.findById(orderId);

    if (updatedOrder.shiprocketShipments && updatedOrder.shiprocketShipments.length > 0) {
        return sendSuccessResponse(res, HTTP_STATUS.OK, "Order synced successfully", {
            shipments: updatedOrder.shiprocketShipments.map(s => ({
                sellerId: s.seller,
                orderId: s.shiprocketOrderId,
                shipmentId: s.shiprocketShipmentId
            }))
        });
    } else if (updatedOrder.shiprocketOrderId) {
        // Legacy fallback
        return sendSuccessResponse(res, HTTP_STATUS.OK, "Order synced successfully (Legacy)", {
            orderId: updatedOrder.shiprocketOrderId,
            shipmentId: updatedOrder.shiprocketShipmentId
        });
    } else {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Sync failed. Check server logs for details.");
    }
});

/**
 * Generate AWB for an order (Handles multiple shipments)
 */
exports.generateAWB = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Order not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    if (!orderRequiresShipping(order)) {
        return sendErrorResponse(
            res,
            HTTP_STATUS.BAD_REQUEST,
            "AWB generation is not applicable for orders without physical shipping",
            ERROR_CODES.VALIDATION_FAILED
        );
    }

    const hasShipments = order.shiprocketShipments && order.shiprocketShipments.length > 0;
    const legacyShipmentId = order.shiprocketShipmentId;

    if (!hasShipments && !legacyShipmentId) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Order not synced with Shiprocket yet");
    }

    // Ownership check for sellers
    if (req.user.role === 'seller') {
        const productIds = (await require('../../models/Product').find({ seller: req.user._id })).map(p => p._id.toString());
        const ownsAnyItem = order.items.some(item => productIds.includes(item.product.toString()));
        if (!ownsAnyItem) {
            return sendErrorResponse(res, HTTP_STATUS.FORBIDDEN, "Access denied", ERROR_CODES.AUTH_ACCESS_DENIED);
        }
    }

    const results = [];
    const shipmentsToProcess = hasShipments ? order.shiprocketShipments : [{ shiprocketShipmentId: legacyShipmentId, isLegacy: true }];

    for (const shipment of shipmentsToProcess) {
        try {
            // Skip if already has tracking
            if (!shipment.isLegacy && shipment.trackingNumber) {
                results.push({ shipmentId: shipment.shiprocketShipmentId, awb: shipment.trackingNumber, status: 'already_exists' });
                continue;
            }

            const result = await shipRocketService.generateAWB(shipment.shiprocketShipmentId);
            if (result && result.response && result.response.data && result.response.data.awb_code) {
                const awb = result.response.data.awb_code;

                if (shipment.isLegacy) {
                    order.trackingNumber = awb;
                } else {
                    shipment.trackingNumber = awb;
                    // Also sync to legacy field if it's the first shipment
                    if (order.shiprocketShipments[0].shiprocketShipmentId === shipment.shiprocketShipmentId) {
                        order.trackingNumber = awb;
                    }
                }

                results.push({ shipmentId: shipment.shiprocketShipmentId, awb, status: 'success' });
            }
        } catch (error) {
            results.push({ shipmentId: shipment.shiprocketShipmentId, error: error.message, status: 'failed' });
        }
    }

    await order.save();
    return sendSuccessResponse(res, HTTP_STATUS.OK, "AWB generation processed", { results });
});

/**
 * Get Label URL for shipping (Handles multiple shipments)
 */
exports.getLabel = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Order not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    if (!orderRequiresShipping(order)) {
        return sendErrorResponse(
            res,
            HTTP_STATUS.BAD_REQUEST,
            "Shipping labels are not applicable for orders without physical shipping",
            ERROR_CODES.VALIDATION_FAILED
        );
    }

    const hasShipments = order.shiprocketShipments && order.shiprocketShipments.length > 0;
    const legacyShipmentId = order.shiprocketShipmentId;

    if (!hasShipments && !legacyShipmentId) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "No shipment ID found for this order");
    }

    // Ownership check (similar to generateAWB)
    if (req.user.role === 'seller') {
        const productIds = (await require('../../models/Product').find({ seller: req.user._id })).map(p => p._id.toString());
        const ownsAnyItem = order.items.some(item => productIds.includes(item.product.toString()));
        if (!ownsAnyItem) {
            return sendErrorResponse(res, HTTP_STATUS.FORBIDDEN, "Access denied", ERROR_CODES.AUTH_ACCESS_DENIED);
        }
    }

    const shipmentIds = hasShipments
        ? order.shiprocketShipments.map(s => s.shiprocketShipmentId)
        : [legacyShipmentId];

    try {
        const result = await shipRocketService.generateLabel(shipmentIds);
        if (result && result.label_url) {
            order.shiprocketLabelUrl = result.label_url;

            if (hasShipments) {
                // Update label URL for all shipments in this batch
                order.shiprocketShipments.forEach(s => {
                    if (shipmentIds.includes(s.shiprocketShipmentId)) {
                        s.shiprocketLabelUrl = result.label_url;
                    }
                });
            }

            await order.save();
            return sendSuccessResponse(res, HTTP_STATUS.OK, "Labels fetched successfully", { url: result.label_url });
        }
        throw new Error("Failed to fetch label");
    } catch (error) {
        return sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error.message);
    }
});
