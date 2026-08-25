const SellerPickupLocation = require('../../models/SellerPickupLocation');
const Seller = require('../../models/Seller');
const shipRocketService = require('../../services/shipRocketService');
const { asyncHandler, sendErrorResponse, sendSuccessResponse, HTTP_STATUS, ERROR_CODES } = require('../../utils/errorHandler');

/**
 * Sync pickup locations from ShipRocket
 */
exports.syncFromShiprocket = asyncHandler(async (req, res) => {
    const srLocations = await shipRocketService.getPickupLocations();

    const results = {
        created: 0,
        updated: 0,
        failed: 0
    };

    for (const loc of srLocations) {
        try {
            const updateData = {
                name: loc.pickup_location,
                address: {
                    address: loc.address,
                    address2: loc.address_2,
                    city: loc.city,
                    state: loc.state,
                    country: loc.country,
                    pincode: loc.pin_code
                },
                phone: loc.phone,
                email: loc.email,
                lastSyncedAt: new Date(),
                isActive: loc.status == 1 || loc.active == 1 || loc.status === '1' || loc.active === '1'
            };

            const existing = await SellerPickupLocation.findOne({ shiprocketId: loc.id || loc.pickup_id });

            if (existing) {
                await SellerPickupLocation.findByIdAndUpdate(existing._id, updateData);
                results.updated++;
            } else {
                await SellerPickupLocation.create({
                    shiprocketId: loc.id || loc.pickup_id,
                    ...updateData
                });
                results.created++;
            }
        } catch (error) {
            console.error(`Failed to sync location ${loc.pickup_location}:`, error.message);
            results.failed++;
        }
    }

    sendSuccessResponse(res, HTTP_STATUS.OK, 'Pickup locations synced successfully', results);
});

/**
 * Get all pickup locations
 */
exports.getAllPickupLocations = asyncHandler(async (req, res) => {
    const locations = await SellerPickupLocation.find().populate('seller', 'shopName');
    sendSuccessResponse(res, HTTP_STATUS.OK, 'Pickup locations retrieved successfully', locations);
});

/**
 * Assign pickup location to a seller
 */
exports.assignToSeller = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { sellerId } = req.body;

    const location = await SellerPickupLocation.findById(id);
    if (!location) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, 'Pickup location not found', ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    if (sellerId) {
        const seller = await Seller.findById(sellerId);
        if (!seller) {
            return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, 'Seller not found', ERROR_CODES.RESOURCE_NOT_FOUND);
        }

        // Update location
        location.seller = sellerId;
        await location.save();

        // Update seller
        seller.pickupLocation = id;
        await seller.save();
    } else {
        // Unassign if sellerId is null
        if (location.seller) {
            await Seller.findByIdAndUpdate(location.seller, { $unset: { pickupLocation: "" } });
            location.seller = undefined;
            await location.save();
        }
    }

    sendSuccessResponse(res, HTTP_STATUS.OK, 'Seller assigned to pickup location successfully', location);
});

/**
 * Set platform default pickup location
 */
exports.setDefaultPickup = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const location = await SellerPickupLocation.findById(id);
    if (!location) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, 'Pickup location not found', ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    // Reset current default
    await SellerPickupLocation.updateMany({ isDefault: true }, { isDefault: false });

    // Set new default and ensure it is active
    location.isDefault = true;
    location.isActive = true;
    await location.save();

    sendSuccessResponse(res, HTTP_STATUS.OK, 'Default pickup location set successfully', location);
});
