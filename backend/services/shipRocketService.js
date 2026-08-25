/**
 * ShipRocket Integration Service
 * Objective 4.4 — Pluggable logistics provider
 */

const axios = require('axios');

class ShipRocketService {
    constructor() {
        this.baseUrl = process.env.SHIPROCKET_API_BASE_URL || 'https://apiv2.shiprocket.in/v1/external';
        this.token = null;
        this.tokenExpiry = null;
    }

    /**
     * Authenticate with ShipRocket
     */
    async authenticate() {
        if (this.token && this.tokenExpiry > Date.now()) {
            return this.token;
        }

        try {
            const response = await axios.post(`${this.baseUrl}/auth/login`, {
                email: process.env.SHIPROCKET_EMAIL,
                password: process.env.SHIPROCKET_PASSWORD
            });

            this.token = response.data.token;
            this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
            return this.token;
        } catch (error) {
            console.error('❌ ShipRocket Auth Error:', error.response?.data || error.message);
            throw new Error('ShipRocket authentication failed');
        }
    }

    /**
     * Fetch shipping rates for a shipment
     */
    async fetchRates({ pickupPincode, deliveryPincode, weight, length, width, height, cod = 0 }) {
        const token = await this.authenticate();
        try {
            const response = await axios.get(`${this.baseUrl}/courier/serviceability/`, {
                params: {
                    pickup_postcode: pickupPincode,
                    delivery_postcode: deliveryPincode,
                    weight,
                    cod,
                    length,
                    width,
                    height
                },
                headers: { Authorization: `Bearer ${token}` }
            });

            return response.data.data.available_courier_companies;
        } catch (error) {
            console.warn('⚠️ ShipRocket Rates Error:', error.response?.data || error.message);
            return []; // Return empty array if service unavailable
        }
    }

    /**
     * Get all pickup locations from ShipRocket
     */
    async getPickupLocations() {
        const token = await this.authenticate();
        try {
            const response = await axios.get(`${this.baseUrl}/settings/company/pickup`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data.data.shipping_address || [];
        } catch (error) {
            console.error('❌ ShipRocket Fetch Pickup Locations Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create an order in ShipRocket
     */
    async createShipment(orderData) {
        if (!orderData.pickup_location_id && !orderData.pickup_location) {
            console.error('❌ ShipRocket Shipment Error: pickup_location is required');
            throw new Error('pickup_location is required for shipment creation');
        }

        const token = await this.authenticate();
        try {
            const response = await axios.post(`${this.baseUrl}/shipments/create/forward-shipment`, orderData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        } catch (error) {
            console.error('❌ ShipRocket Shipment Creation Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create a reverse / return order in ShipRocket (pickup from customer → seller).
     * POST /orders/create/return
     */
    async createReturnOrder(returnOrderData) {
        const token = await this.authenticate();
        try {
            const response = await axios.post(
                `${this.baseUrl}/orders/create/return`,
                returnOrderData,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data;
        } catch (error) {
            console.error('❌ ShipRocket Return Order Error:', error.response?.data || error.message);
            const message =
                error.response?.data?.message ||
                (typeof error.response?.data === 'string' ? error.response.data : null) ||
                error.message ||
                'ShipRocket return order creation failed';
            const err = new Error(
                typeof message === 'string' ? message : JSON.stringify(message)
            );
            err.providerResponse = error.response?.data || null;
            err.statusCode = error.response?.status;
            err.isDuplicate = ShipRocketService.isDuplicateOrderError(
                err.statusCode,
                err.message,
                err.providerResponse
            );
            throw err;
        }
    }

    /**
     * Look up an existing Shiprocket order by our channel/reference order_id.
     * Used for idempotent recovery after timeout or duplicate-create responses.
     */
    async findOrderByChannelOrderId(channelOrderId) {
        if (!channelOrderId) return null;
        const token = await this.authenticate();
        try {
            const response = await axios.get(`${this.baseUrl}/orders`, {
                params: {
                    search: String(channelOrderId),
                    per_page: 10,
                },
                headers: { Authorization: `Bearer ${token}` },
            });

            const rows = response.data?.data || response.data?.orders || [];
            if (!Array.isArray(rows) || rows.length === 0) {
                // Fallback: explicit channel_order_id filter
                const filtered = await axios.get(`${this.baseUrl}/orders`, {
                    params: {
                        filter_by: 'channel_order_id',
                        filter: String(channelOrderId),
                        per_page: 5,
                    },
                    headers: { Authorization: `Bearer ${token}` },
                });
                const filteredRows = filtered.data?.data || filtered.data?.orders || [];
                return this.#pickMatchingChannelOrder(filteredRows, channelOrderId);
            }
            return this.#pickMatchingChannelOrder(rows, channelOrderId);
        } catch (error) {
            console.warn(
                '⚠️ ShipRocket findOrderByChannelOrderId:',
                error.response?.data || error.message
            );
            return null;
        }
    }

    #pickMatchingChannelOrder(rows, channelOrderId) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const key = String(channelOrderId);
        const exact = rows.find((row) => {
            const candidates = [
                row.channel_order_id,
                row.customer_order_id,
                row.channel_order,
            ];
            return candidates.some((value) => value != null && String(value) === key);
        });
        return exact || null;
    }

    /**
     * Detect Shiprocket "order_id already exists" / duplicate create responses.
     */
    static isDuplicateOrderError(statusCode, message, providerResponse) {
        const text = [
            typeof message === 'string' ? message : '',
            typeof providerResponse === 'string' ? providerResponse : '',
            providerResponse && typeof providerResponse === 'object'
                ? JSON.stringify(providerResponse)
                : '',
        ]
            .join(' ')
            .toLowerCase();

        if (statusCode === 422 && /order[_\s-]?id|already|exist|duplicate/.test(text)) {
            return true;
        }
        return /already\s+exist|duplicate\s+order|order_id.*(exist|taken)|channel order.*(exist)/i.test(
            text
        );
    }

    /**
     * Generate AWB for a shipment
     */
    async generateAWB(shipmentId, courierId = null) {
        const token = await this.authenticate();
        try {
            const response = await axios.post(`${this.baseUrl}/courier/assign/awb`, {
                shipment_id: shipmentId,
                courier_id: courierId
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        } catch (error) {
            console.error('❌ ShipRocket AWB Generation Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get Tracking details
     */
    async getTracking(awb) {
        const token = await this.authenticate();
        try {
            const response = await axios.get(`${this.baseUrl}/courier/track/awb/${awb}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        } catch (error) {
            console.error('❌ ShipRocket Tracking Error:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Generate Shipping Label
     */
    async generateLabel(shipmentIds) {
        const token = await this.authenticate();
        try {
            const response = await axios.post(`${this.baseUrl}/courier/generate/label`, {
                shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds]
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        } catch (error) {
            console.error('❌ ShipRocket Label Generation Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get Wallet Balance
     */
    async getWalletBalance() {
        const token = await this.authenticate();
        try {
            const response = await axios.get(`${this.baseUrl}/account/details/wallet-balance`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        } catch (error) {
            console.error('❌ ShipRocket Wallet Check Error:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Shiprocket to Internal Status Mapping (outbound orders)
     */
    static MAP_STATUS(srStatus) {
        const mapping = {
            'NEW': 'processing',
            'PICKUP SCHEDULED': 'shipped',
            'PICKUP GENERATED': 'shipped',
            'OUT FOR PICKUP': 'shipped',
            'PICKED UP': 'shipped',
            'IN TRANSIT': 'shipped',
            'OUT FOR DELIVERY': 'shipped',
            'DELIVERED': 'delivered',
            'CANCELED': 'cancelled',
            'RTO INITIATED': 'shipped', // Or a custom RTO status if SRS allowed
            'RTO DELIVERED': 'delivered'
        };
        return mapping[srStatus.toUpperCase()] || 'processing';
    }

    /**
     * Map Shiprocket tracking status → reverse-logistics case status bucket.
     * Does not auto-confirm seller receipt (awaiting_inspection remains seller-gated).
     */
    static MAP_RETURN_TRACKING(srStatus) {
        if (!srStatus) return null;
        const key = String(srStatus).trim().toUpperCase();
        const inTransit = new Set([
            'PICKED UP',
            'IN TRANSIT',
            'OUT FOR DELIVERY',
            'SHIPPED',
            'DISPATCHED',
        ]);
        const delivered = new Set(['DELIVERED', 'RTO DELIVERED']);
        const failed = new Set([
            'CANCELED',
            'CANCELLED',
            'LOST',
            'DESTROYED',
            'UNDELIVERED',
            'PICKUP FAILED',
            'PICKUP EXCEPTION',
        ]);
        const scheduled = new Set([
            'NEW',
            'PICKUP SCHEDULED',
            'PICKUP GENERATED',
            'OUT FOR PICKUP',
            'AWB ASSIGNED',
            'LABEL GENERATED',
        ]);

        if (delivered.has(key)) return 'delivered';
        if (failed.has(key)) return 'failed';
        if (inTransit.has(key)) return 'in_transit';
        if (scheduled.has(key)) return 'scheduled';
        return null;
    }
}

module.exports = new ShipRocketService();
