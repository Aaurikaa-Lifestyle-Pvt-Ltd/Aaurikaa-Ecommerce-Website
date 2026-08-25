
// publicProductController.js
const mongoose = require('mongoose');
const Product = require('../models/Product');

// 🧾 Get (paginated) Published Products
exports.getAllProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const filter = { status: 'published', approvalStatus: 'approved' };

    if (req.query.brand && mongoose.isValidObjectId(req.query.brand)) {
      filter.brand = req.query.brand;
    }

    const [products, total] = await Promise.all([
      Product.find(filter) // Use the filter object here
        .select('-vendorCost -internalNotes')
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .populate('childCategory', 'name slug')
        .populate('brand', 'name')
        .populate('seller', 'shopName firstName lastName avgRating reviewCount profileImage shopImage')
        .populate('sellerShop', 'shopName firstName lastName shopImage')  // ✅ sellerShop populate
        .populate('mainImageId', 'alt_text') // ✅ Added for ALT priority
        .sort({ createdAt: -1 })

        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter), // Use the filter object here
    ]);

    res.status(200).json({
      total,
      page,
      pages: Math.ceil(total / limit),
      products,
    });
  } catch (err) {
    next(err); // centrally handled
  }
};

// 🔍 Get Single Product By ID
exports.getProductById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const product = await Product.findOne({
      _id: req.params.id,
      status: 'published',
      approvalStatus: 'approved',
    })
      .select('-vendorCost -internalNotes')
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('childCategory', 'name slug')
      .populate('brand', 'name')               // ✅ brand populate
      .populate('seller', 'shopName email firstName lastName avgRating reviewCount profileImage shopImage')    // ✅ seller populate with ratings
      .populate('sellerShop', 'shopName firstName lastName shopImage')      // ✅ sellerShop populate (now references Seller)
      .populate('mainImageId', 'alt_text')    // ✅ ALT Priority
      .populate('galleryImageIds', 'alt_text') // ✅ ALT Priority
      .populate('videoId', 'alt_text')        // ✅ ALT Priority
      .lean();


    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json(product);
  } catch (err) {
    next(err);
  }
};

