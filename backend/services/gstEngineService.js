const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const ChildCategory = require('../models/ChildCategory');
const State = require('../models/location/State');

/**
 * Union Territories that typically use UGST instead of SGST
 */
const UT_NAMES = [
    'Andaman and Nicobar Islands',
    'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu',
    'Lakshadweep',
    'Ladakh'
];

/**
 * GST Engine Service - Single Source of Truth for Tax Calculations (Objective 4.5)
 */
const gstEngineService = {
    /**
     * Calculate GST for an order
     * @param {Object} params - Calculation parameters
     * @param {Array} params.items - Order items (price, quantity, category, taxIncluded)
     * @param {number} params.shippingCharge - Shipping charge from the order
     * @param {Object} params.shippingAddress - Delivery address (stateId/state)
     * @returns {Promise<Object>} GST calculation result
     */
    async calculateGST({ items, shippingCharge, shippingAddress }) {
        try {
            let totalTaxableAmount = 0;
            let totalTax = 0;
            let totalCgst = 0;
            let totalSgst = 0;
            let totalIgst = 0;
            let totalUgst = 0;
            let maxTaxRate = 0;

            const itemsBreakdown = [];

            // Check UT and Destination State
            // shippingAddress usually contains stateId or state name
            const isUT = await this.checkIfUnionTerritory(shippingAddress);
            const destinationStateId = shippingAddress.stateId || shippingAddress.state;

            for (const item of items) {
                const gstRateDecimal = await this.resolveGstRate(item);
                const gstRatePercent = gstRateDecimal * 100;

                if (gstRateDecimal > maxTaxRate) {
                    maxTaxRate = gstRateDecimal;
                }

                const quantity = item.quantity || 1;
                const linePrice = item.price * quantity;
                const taxIncluded = item.taxIncluded || false;

                let lineTaxableAmount = 0;
                let lineTaxAmount = 0;

                if (taxIncluded) {
                    lineTaxableAmount = linePrice / (1 + gstRateDecimal);
                    lineTaxAmount = linePrice - lineTaxableAmount;
                } else {
                    lineTaxableAmount = linePrice;
                    lineTaxAmount = linePrice * gstRateDecimal;
                }

                // Determine Tax Type (IGST vs CGST/SGST)
                let isInterState = false;

                // If origin state is available (from seller), compare with destination
                if (item.originState) {
                    isInterState = await this.isInterState(item.originState, destinationStateId);
                } else {
                    // Default logic if no origin (e.g. Admin product)
                    // Assumption: Default Warehouse is in same state as most customers? 
                    // Or safer: Treat as Intra-state (CGST+SGST) by default to avoid IGST compliance issues for local-first shops.
                    isInterState = false;
                }

                let cgst = 0, sgst = 0, ugst = 0, igst = 0;

                if (isInterState) {
                    igst = lineTaxAmount;
                    totalIgst += igst;
                } else {
                    cgst = lineTaxAmount / 2;
                    totalCgst += cgst;

                    if (isUT) {
                        ugst = lineTaxAmount / 2;
                        totalUgst += ugst;
                    } else {
                        sgst = lineTaxAmount / 2;
                        totalSgst += sgst;
                    }
                }

                totalTaxableAmount += lineTaxableAmount;
                totalTax += lineTaxAmount;

                itemsBreakdown.push({
                    productId: item.productId || item.product,
                    name: item.name || 'Product',
                    quantity,
                    unitPrice: item.price,
                    totalPrice: linePrice,
                    taxRate: gstRatePercent,
                    taxAmount: lineTaxAmount,
                    taxableAmount: lineTaxableAmount,
                    cgst,
                    sgst,
                    ugst,
                    igst,
                    [isUT ? 'ugst' : 'sgst']: isInterState ? 0 : (isUT ? ugst : sgst), // For backward compat/display
                    isInterState,
                    inclusive: taxIncluded
                });
            }

            // Shipping Tax (highest rate from items)
            // Shipping tax follows the tax type of the main goods? 
            // Usually shipping is from the warehouse (same origin).
            // We'll calculate shipping tax split based on majority of items or defaulting to Inter-state if any item is inter-state?
            // Simplification: If ANY item is inter-state, shipping is likely inter-state? 
            // Better: Shipping usually has its own origin (warehouse). 
            // But we don't have shipping origin here easily. 
            // Strategy: Calculate split based on whether `totalIgst > 0`. If Mixed, it's messy.
            // Let's assume shipping follows the dominant tax mode or just default to Intra-state if unsure.
            // Robust Approach: If totalIgst > totalCgst, treat shipping as Inter-state.

            let shippingTaxAmount = 0;
            // Calculations here assume shipping is exclusive of tax by default
            shippingTaxAmount = shippingCharge * maxTaxRate;

            let shippingCgst = 0, shippingSgst = 0, shippingUgst = 0, shippingIgst = 0;
            const isShippingInterState = totalIgst > totalCgst; // Heuristic

            if (isShippingInterState) {
                shippingIgst = shippingTaxAmount;
                totalIgst += shippingIgst;
            } else {
                shippingCgst = shippingTaxAmount / 2;
                totalCgst += shippingCgst;
                if (isUT) {
                    shippingUgst = shippingTaxAmount / 2;
                    totalUgst += shippingUgst;
                } else {
                    shippingSgst = shippingTaxAmount / 2;
                    totalSgst += shippingSgst;
                }
            }

            totalTaxableAmount += shippingCharge;
            totalTax += shippingTaxAmount;

            // Calculate how much tax needs to be ADDED to the subtotal (Exclusive taxes)
            let totalTaxAdded = 0;
            let addedCgst = 0, addedSgst = 0, addedUgst = 0, addedIgst = 0;

            items.forEach((item, index) => {
                const isInclusive = item.taxIncluded || false;
                const breakdownItem = itemsBreakdown[index];

                if (breakdownItem && !isInclusive) {
                    totalTaxAdded += breakdownItem.taxAmount;
                    addedCgst += breakdownItem.cgst;
                    addedSgst += breakdownItem.sgst;
                    addedUgst += breakdownItem.ugst;
                    addedIgst += breakdownItem.igst;
                }
            });

            // Add shipping tax (always exclusive/added on top)
            totalTaxAdded += shippingTaxAmount;
            addedCgst += shippingCgst;
            addedSgst += shippingSgst;
            addedUgst += shippingUgst;
            addedIgst += shippingIgst;

            return {
                taxableAmount: Math.round(totalTaxableAmount * 100) / 100,
                totalTax: Math.round(totalTax * 100) / 100,
                cgst: Math.round(totalCgst * 100) / 100,
                sgst: Math.round(totalSgst * 100) / 100,
                ugst: Math.round(totalUgst * 100) / 100,
                igst: Math.round(totalIgst * 100) / 100,
                totalTaxAdded: Math.round(totalTaxAdded * 100) / 100, // Amount to add to subtotal
                addedCgst: Math.round(addedCgst * 100) / 100,
                addedSgst: Math.round(addedSgst * 100) / 100,
                addedUgst: Math.round(addedUgst * 100) / 100,
                addedIgst: Math.round(addedIgst * 100) / 100,
                taxType: items.some(i => i.taxIncluded) ? 'mixed/inclusive' : 'exclusive',
                taxBreakdown: {
                    items: itemsBreakdown,
                    shipping: {
                        amount: shippingCharge,
                        taxRate: maxTaxRate * 100,
                        taxAmount: shippingTaxAmount,
                        cgst: shippingCgst,
                        sgst: shippingSgst,
                        ugst: shippingUgst,
                        igst: shippingIgst
                    }
                }
            };
        } catch (error) {
            console.error('❌ GST Calculation Error:', error);
            throw error;
        }
    },

    /**
     * Resolve GST rate from category hierarchy
     */
    async resolveGstRate(item) {
        // Priority: ChildCategory -> Subcategory -> Category
        const { childCategory, subcategory, category } = item;

        // Check if item already has taxRate (from product snapshot)
        // Ignore 0 to allow category-based fallback (since Product default is 0)
        if (item.taxRate !== undefined && item.taxRate !== null && item.taxRate > 0) {
            console.log(`[GST Debug] Using Product-level Tax Rate: ${item.taxRate}%`);
            return item.taxRate / 100;
        }

        let rate = 0;

        // Helper to fetch rate from models
        const getRate = async (id, Model) => {
            if (!id) return null;
            const doc = await Model.findById(id).select('taxRate');
            return doc ? doc.taxRate : null;
        };

        // Try finding in ChildCategory
        rate = await getRate(childCategory, ChildCategory);
        console.log(`[GST Debug] ChildCategory ${childCategory} rate: ${rate}`);

        // Try finding in Subcategory if not in Child
        if (rate === null || rate === undefined) {
            rate = await getRate(subcategory, Subcategory);
            console.log(`[GST Debug] Subcategory ${subcategory} rate: ${rate}`);
        }

        // Try finding in Category if still not found
        if (rate === null || rate === undefined) {
            rate = await getRate(category, Category);
            console.log(`[GST Debug] Category ${category} rate: ${rate}`);
        }

        console.log(`[GST Debug] Final Resolved Rate for ${item.name}: ${rate}`);

        // Fallback to 0 if not found anywhere (SRS says "hard error", but per-item fallback 0 is safer for stability)
        // Actually SRS 5.1 says "If category GST is missing -> hard error".
        // I will throw error if no rate is found.
        if (rate === null || rate === undefined) {
            throw new Error(`GST rate missing for category/product: ${item.name || item.productId}`);
        }

        return rate / 100;
    },

    /**
     * Check if the shipping location is a Union Territory
     */
    async checkIfUnionTerritory(address) {
        if (!address) return false;

        const stateIdOrName = address.stateId || address.state;
        if (!stateIdOrName) return false;

        let stateName = '';

        if (stateIdOrName.toString().match(/^[0-9a-fA-F]{24}$/)) {
            const state = await State.findById(stateIdOrName);
            stateName = state ? state.name : '';
        } else {
            stateName = stateIdOrName;
        }

        return UT_NAMES.some(ut => stateName.toLowerCase().includes(ut.toLowerCase()));
    },

    /**
     * Determine if transaction is Inter-state (IGST) or Intra-state (CGST+SGST)
     * @param {Object} origin - Origin state object (from seller)
     * @param {string} destination - Destination state ID or Name
     */
    async isInterState(origin, destination) {
        if (!origin || !destination) return false; // Default to Intra-state if unsure

        // Normalize Origin
        const originId = origin._id ? origin._id.toString() : null;
        const originName = origin.name ? origin.name.trim().toLowerCase() : null;

        // Normalize Destination
        let destId = null;
        let destName = null;

        if (destination.toString().match(/^[0-9a-fA-F]{24}$/)) {
            destId = destination.toString();
            // If we have origin ID and dest ID, compare directly
            if (originId) {
                return originId !== destId;
            }
            // If origin has no ID (unlikely if populated), fetch dest name to compare names
            const destState = await State.findById(destId);
            destName = destState ? destState.name.trim().toLowerCase() : '';
        } else {
            destName = destination.toString().trim().toLowerCase();
        }

        // Compare Names (fallback)
        if (originName && destName) {
            return originName !== destName;
        }

        // Fallback: If only IDs available and didn't match above? 
        // If we reached here, it means we couldn't strictly match. 
        // Assume Intra-state (safe default).
        return false;
    }
};

module.exports = gstEngineService;
