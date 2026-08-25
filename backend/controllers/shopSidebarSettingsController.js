const ShopSidebarSettings = require('../models/ShopSidebarSettings');

// @desc    Get shop sidebar settings
// @route   GET /api/settings/shop-sidebar
// @access  Public
exports.getShopSidebarSettings = async (req, res) => {
    try {
        let settings = await ShopSidebarSettings.findOne();
        if (!settings) {
            settings = await ShopSidebarSettings.create({});
        }
        res.status(200).json({
            success: true,
            data: settings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Update shop sidebar settings
// @route   PUT /api/settings/shop-sidebar
// @access  Private/Admin
exports.updateShopSidebarSettings = async (req, res) => {
    try {
        let settings = await ShopSidebarSettings.findOne();

        if (!settings) {
            settings = new ShopSidebarSettings(req.body);
        } else {
            settings.headings = req.body.headings || settings.headings;
            settings.banners = req.body.banners || settings.banners;
        }

        await settings.save();

        res.status(200).json({
            success: true,
            data: settings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
