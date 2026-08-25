const SellerPickupLocation = require('../models/SellerPickupLocation');
const Seller = require('../models/Seller');

class PickupLocationService {
    /**
     * Resolve pickup location for a specific seller
     */
    async resolvePickupForSeller(sellerId) {
        if (!sellerId) {
            console.log('🔍 No sellerId provided, fetching default pickup');
            return await this.getDefaultPickup();
        }

        const seller = await Seller.findById(sellerId).populate('pickupLocation');
        if (seller) {
            console.log(`🔍 Seller found: ${seller.shopName || seller.firstName}, Pickup: ${seller.pickupLocation ? seller.pickupLocation.name : 'NONE'}`);
            if (seller.pickupLocation && seller.pickupLocation.isActive) {
                return seller.pickupLocation;
            }
        } else {
            console.warn(`🔍 Seller NOT found in DB for ID: ${sellerId}`);
        }

        console.log('🔍 Falling back to default pickup');
        return await this.getDefaultPickup();
    }

    /**
     * Resolve pickup location for an order
     * Note: In a multi-seller order, this might need refinement if shipping is handled per items.
     * For now, it takes the first seller found in items if not provided.
     */
    async resolvePickupForOrder(orderId) {
        // This would require fetching the order and its items
        // For brevity in this service, we expect caller to pass sellerId if known
        return await this.getDefaultPickup();
    }

    /**
     * Get platform default pickup location
     */
    async getDefaultPickup() {
        // Try to find an active default first
        let defaultPickup = await SellerPickupLocation.findOne({ isDefault: true, isActive: true });

        // Fallback to any default if active one not found
        if (!defaultPickup) {
            defaultPickup = await SellerPickupLocation.findOne({ isDefault: true });
        }

        console.log(`🔍 Default Pickup Search Result: ${defaultPickup ? defaultPickup.name : 'NOT FOUND'} (Active: ${defaultPickup?.isActive})`);
        return defaultPickup;
    }

    /**
     * Resolve pickup locations for multiple sellers
     */
    async resolvePickupsForMultipleSellers(sellerIds) {
        const result = {};
        for (const sellerId of sellerIds) {
            result[sellerId] = await this.resolvePickupForSeller(sellerId);
        }
        return result;
    }

    /**
     * Validate if a seller has a valid pickup configuration (either explicit or via default)
     */
    async validatePickupConfiguration(sellerId) {
        const pickup = await this.resolvePickupForSeller(sellerId);
        return !!pickup;
    }
}

module.exports = new PickupLocationService();
