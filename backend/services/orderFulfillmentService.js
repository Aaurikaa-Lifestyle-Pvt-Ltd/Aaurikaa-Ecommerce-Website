const Order = require('../models/Order');
const Product = require('../models/Product');
const shipRocketService = require('./shipRocketService');
const pickupLocationService = require('./pickupLocationService');
const {
    orderRequiresShipping,
    filterShippableItems,
} = require('../utils/orderFulfillmentGuards');

function resolveAddressLine(details) {
    if (!details) return '';
    if (typeof details.address === 'string') return details.address;
    if (details.address && typeof details.address === 'object') return details.address.street || '';
    return '';
}

function resolveCity(details) {
    if (!details) return '';
    if (details.city) return details.city;
    if (details.address && typeof details.address === 'object') return details.address.city || '';
    return '';
}

function resolveState(details) {
    if (!details) return '';
    if (details.state) return details.state;
    if (details.address && typeof details.address === 'object') return details.address.state || '';
    return '';
}

function resolvePincode(details) {
    if (!details) return '';
    if (details.pincode) return String(details.pincode);
    if (details.address && typeof details.address === 'object' && details.address.postalCode) {
        return String(details.address.postalCode);
    }
    return '';
}

function resolveCustomerName(details) {
    if (!details) return '';
    if (details.name) return details.name;
    const fn = details.firstName || '';
    const ln = details.lastName || '';
    return `${fn} ${ln}`.trim();
}

/**
 * Service to handle post-order-creation fulfillment logic
 */
class OrderFulfillmentService {
    /**
     * Shiprocket sync only after payment-ready state (paid/processing). No sync on pending orders.
     */
    async maybeSyncShiprocket(orderId) {
        let order = await Order.findById(orderId);
        if (!order) return;
        if (!orderRequiresShipping(order)) return;
        if (!['paid', 'processing'].includes(order.status)) return;
        if (order.shiprocketShipments && order.shiprocketShipments.length > 0) return;

        if (!order.shippingProvider || order.shippingProvider === 'manual') {
            order.shippingProvider = 'shiprocket';
            await order.save();
            order = await Order.findById(orderId);
        }

        if (!order || order.shippingProvider !== 'shiprocket') return;
        return this.syncToShiprocket(orderId);
    }
    /**
     * Group order items by seller
     */
    groupItemsBySeller(items) {
        const sellerGroups = {};
        items.forEach(item => {
            const rawSeller = item.product?.seller;
            console.log(`🔍 Item [${item.product?.name}] Raw Seller:`, rawSeller);
            const sellerId = rawSeller?.toString() || 'platform';
            if (!sellerGroups[sellerId]) {
                sellerGroups[sellerId] = [];
            }
            sellerGroups[sellerId].push(item);
        });
        return sellerGroups;
    }

    /**
     * Sync order to Shiprocket
     * Should be called when order moves to 'paid' or 'processing'
     */
    async syncToShiprocket(orderId) {
        try {
            const order = await Order.findById(orderId).populate('items.product');
            if (!order) return;

            if (!orderRequiresShipping(order)) return;
            if (order.shippingProvider !== 'shiprocket') return;
            if (!['paid', 'processing'].includes(order.status)) return;

            // Avoid double sync for same order - but check if ANY shipment is already created
            if (order.shiprocketShipments && order.shiprocketShipments.length > 0) return;

            const shippableItems = filterShippableItems(order.items, order);
            if (shippableItems.length === 0) return;

            // 1. Group applicable items by seller
            const sellerGroups = this.groupItemsBySeller(shippableItems);
            const sellerIds = Object.keys(sellerGroups);

            console.log(`📦 Syncing Order ${order.invoiceNumber}: Found ${sellerIds.length} sellers: ${sellerIds.join(', ')}`);

            const shipments = [];

            for (const sellerId of sellerIds) {
                const sellerItems = sellerGroups[sellerId];

                // 2. Resolve Pickup Location for this seller
                const pickup = await pickupLocationService.resolvePickupForSeller(sellerId === 'platform' ? null : sellerId);

                if (!pickup) {
                    const defaultPickup = await pickupLocationService.getDefaultPickup();
                    console.error(`❌ Fulfillment Error: No pickup location resolved for seller ${sellerId}. IsDefaultSet: ${!!defaultPickup}`);
                    continue;
                }

                // 3. Prepare order data for this seller's shipment
                // Note: Shiprocket order_id must be unique across the platform. 
                // For multi-seller, we append seller identifier or index to invoice number.
                const subOrderId = sellerIds.length > 1 ? `${order.invoiceNumber}-${sellerId.slice(-4)}` : order.invoiceNumber;

                const bd = order.billingDetails || {};
                const sd = order.shippingDetails || {};
                const orderData = {
                    order_id: subOrderId,
                    order_date: order.createdAt,
                    pickup_location: pickup.name,
                    billing_customer_name: resolveCustomerName(bd) || resolveCustomerName(sd) || "Customer",
                    billing_last_name: "",
                    billing_address: resolveAddressLine(bd) || resolveAddressLine(sd) || "Address not provided",
                    billing_city: resolveCity(bd) || resolveCity(sd) || "City not provided",
                    billing_pincode: (resolvePincode(bd) || resolvePincode(sd) || "110001").toString(),
                    billing_state: resolveState(bd) || resolveState(sd) || "State not provided",
                    billing_country: bd.country || sd.country || "India",
                    billing_email: bd.email || sd.email || "customer@example.com",
                    billing_phone: bd.phone || sd.phone || "9999999999",
                    shipping_is_billing: true,
                    order_items: sellerItems.map(item => ({
                        name: item.product.name,
                        sku: item.product.sku,
                        units: item.quantity,
                        selling_price: item.price,
                    })),
                    payment_method:
                        order.fulfilmentKind === 'replacement' || order.paymentMethod !== 'cod'
                            ? 'Prepaid'
                            : 'COD',
                    sub_total: sellerItems.reduce((sum, i) => sum + (i.price * i.quantity), 0),
                    length: 10,
                    width: 10,
                    height: 10,
                    weight: sellerItems.reduce((acc, i) => acc + ((i.product.weight || 0.5) * i.quantity), 0)
                };

                try {
                    const srResponse = await shipRocketService.createShipment(orderData);
                    if (srResponse && srResponse.order_id) {
                        shipments.push({
                            seller: sellerId === 'platform' ? null : sellerId,
                            sellerName: sellerItems[0]?.product?.sellerName || "Seller", // Fallback if name not in item
                            shiprocketOrderId: srResponse.order_id,
                            shiprocketShipmentId: srResponse.shipment_id,
                            status: 'synced'
                        });
                        console.log(`✅ Seller ${sellerId} items synced for ${order.invoiceNumber}. ID: ${srResponse.order_id}`);
                    }
                } catch (srError) {
                    console.error(`❌ Shiprocket API Error for seller ${sellerId}:`, srError.message);
                }
            }

            if (shipments.length > 0) {
                order.shiprocketShipments = shipments;
                order.shippingProvider = 'shiprocket';
                // For backward compatibility, store the first one in legacy fields
                order.shiprocketOrderId = shipments[0].shiprocketOrderId;
                order.shiprocketShipmentId = shipments[0].shiprocketShipmentId;
                await order.save();
            }
        } catch (error) {
            console.error(`❌ Order Sync Error (Order: ${orderId}):`, error.message);
        }
    }

    /**
     * Map Shiprocket progress to internal status (Idempotent)
     */
    async updateStatusFromShiprocket(order) {
        const shipmentsToTrack = (order.shiprocketShipments && order.shiprocketShipments.length > 0)
            ? order.shiprocketShipments
            : (order.trackingNumber ? [{ trackingNumber: order.trackingNumber }] : []);

        if (shipmentsToTrack.length === 0) return;

        let highestInternalStatus = order.status;
        const statusWeights = { 'pending': 0, 'pending_verification': 0, 'paid': 0, 'processing': 1, 'shipped': 2, 'delivered': 3 };

        for (const shipment of shipmentsToTrack) {
            const awb = shipment.trackingNumber;
            if (!awb) continue;

            const tracking = await shipRocketService.getTracking(awb);
            if (!tracking || !tracking.tracking_data || !tracking.tracking_data.shipment_track) continue;

            const srStatus = tracking.tracking_data.shipment_track[0]?.current_status;
            if (!srStatus) continue;

            const internalStatus = shipRocketService.constructor.MAP_STATUS(srStatus);

            // Update shipment specific status if it's in the array
            if (shipment.status) {
                shipment.status = internalStatus;
            }

            // Order status is determined by the "least progressed" shipment for business safety, 
            // OR we can decide it moves to 'shipped' if ANY moves to shipped.
            // Usually, 'shipped' means partially shipped if there are multiple.
            // For now, let's say the order overall status moves to the "highest" available status
            // among shipments to keep things moving.
            if (statusWeights[internalStatus] > statusWeights[highestInternalStatus]) {
                highestInternalStatus = internalStatus;
            }
        }

        if (order.status !== highestInternalStatus) {
            order.status = highestInternalStatus;
            await order.save();
            console.log(`🔄 Order ${order.invoiceNumber} status updated to ${highestInternalStatus} via Shiprocket`);
        }
    }

    /**
     * Poll Shiprocket for tracking updates on active shipments
     */
    async pollTrackingUpdates() {
        try {
            // Only poll for orders that might change status
            // Now we check if trackingNumber exists OR if any shipment HAS a tracking number
            const orders = await Order.find({
                status: { $in: ['shipped', 'processing', 'paid'] },
                shippingProvider: 'shiprocket',
                shippingApplicability: { $ne: 'none' },
                $or: [
                    { trackingNumber: { $ne: null } },
                    { 'shiprocketShipments.trackingNumber': { $ne: null } }
                ]
            });

            console.log(`📡 Polling tracking for ${orders.length} orders...`);
            for (const order of orders) {
                await this.updateStatusFromShiprocket(order);
            }
        } catch (error) {
            console.error("❌ Polling Error:", error.message);
        }
    }
}

module.exports = new OrderFulfillmentService();
