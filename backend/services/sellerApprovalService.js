// backend/services/sellerApprovalService.js

const mongoose = require('mongoose');
const Seller = require('../models/Seller');
const { notifySellerStatusUpdate } = require('../utils/notificationService');
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS } = require('../utils/errorHandler');

/**
 * Unified Seller Approval Service
 * Single source of truth for all seller approval operations
 */

/**
 * Update seller approval status with unified logic
 * @param {string} sellerId - Seller ID
 * @param {boolean} isApproved - Approval status
 * @param {string} reason - Rejection reason (optional)
 * @param {string} adminId - Admin ID who made the change
 * @returns {Object} Result object with success status and data
 */
const updateSellerApproval = async (sellerId, isApproved, reason = null, adminId = null) => {
  try {
    // Validate seller ID
    if (!sellerId) {
      return {
        success: false,
        error: 'Seller ID is required',
        code: ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      };
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return {
        success: false,
        error: 'Invalid seller ID format',
        code: ERROR_CODES.VALIDATION_INVALID_FORMAT
      };
    }

    // Find seller
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return {
        success: false,
        error: ERROR_MESSAGES.SELLER_NOT_FOUND,
        code: ERROR_CODES.RESOURCE_NOT_FOUND
      };
    }

    // Update seller status
    seller.isApproved = isApproved;
    const status = isApproved ? 'approved' : 'rejected';

    // Add to approval history
    const approvalEntry = {
      status: status,
      updatedBy: adminId,
      updatedAt: new Date()
    };

    // Add reason for rejections
    if (!isApproved && reason) {
      approvalEntry.reason = reason;
    }

    seller.approvalHistory.push(approvalEntry);

    // Save seller
    await seller.save();

    // Send notification to seller
    const notificationResult = await notifySellerStatusUpdate(seller, status, reason);
    if (!notificationResult.success) {
      console.log('⚠️ Seller notification failed:', notificationResult.message);
      // Don't fail the approval if notification fails
    }

    return {
      success: true,
      data: {
        seller: {
          _id: seller._id,
          email: seller.email,
          firstName: seller.firstName,
          lastName: seller.lastName,
          isApproved: seller.isApproved,
          status: status
        },
        message: `Seller ${status} successfully`
      }
    };

  } catch (error) {
    console.error('❌ Seller approval update error:', error);
    return {
      success: false,
      error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_SERVER_ERROR
    };
  }
};

/**
 * Bulk approve multiple sellers
 * @param {Array} sellerIds - Array of seller IDs
 * @param {string} adminId - Admin ID who made the change
 * @returns {Object} Result object with success status and data
 */
const bulkApproveSellers = async (sellerIds, adminId = null) => {
  try {
    // Validate input
    if (!Array.isArray(sellerIds) || sellerIds.length === 0) {
      return {
        success: false,
        error: 'Array of seller IDs is required',
        code: ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      };
    }

    // Validate all IDs are valid ObjectIds
    const validIds = sellerIds.filter(id => {
      try {
        return require('mongoose').Types.ObjectId.isValid(id);
      } catch {
        return false;
      }
    });

    if (validIds.length !== sellerIds.length) {
      return {
        success: false,
        error: 'One or more invalid seller IDs provided',
        code: ERROR_CODES.VALIDATION_FAILED
      };
    }

    // Update sellers in bulk
    const result = await Seller.updateMany(
      { _id: { $in: validIds } },
      {
        $set: { 
          isApproved: true, 
          status: 'approved' 
        },
        $push: {
          approvalHistory: {
            status: 'approved',
            updatedBy: adminId,
            updatedAt: new Date()
          }
        }
      }
    );

    // Send notifications to approved sellers
    const approvedSellers = await Seller.find({ _id: { $in: validIds } });
    for (const seller of approvedSellers) {
      const notificationResult = await notifySellerStatusUpdate(seller, 'approved');
      if (!notificationResult.success) {
        console.log(`⚠️ Notification failed for seller ${seller._id}:`, notificationResult.message);
      }
    }

    return {
      success: true,
      data: {
        modifiedCount: result.modifiedCount,
        message: `${result.modifiedCount} sellers approved successfully`
      }
    };

  } catch (error) {
    console.error('❌ Bulk approval error:', error);
    return {
      success: false,
      error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_SERVER_ERROR
    };
  }
};

/**
 * Get seller approval history
 * @param {string} sellerId - Seller ID
 * @returns {Object} Result object with approval history
 */
const getSellerApprovalHistory = async (sellerId) => {
  try {
    const seller = await Seller.findById(sellerId).select('approvalHistory firstName lastName email');
    if (!seller) {
      return {
        success: false,
        error: ERROR_MESSAGES.SELLER_NOT_FOUND,
        code: ERROR_CODES.RESOURCE_NOT_FOUND
      };
    }

    return {
      success: true,
      data: {
        seller: {
          _id: seller._id,
          firstName: seller.firstName,
          lastName: seller.lastName,
          email: seller.email
        },
        approvalHistory: seller.approvalHistory || []
      }
    };

  } catch (error) {
    console.error('❌ Get approval history error:', error);
    return {
      success: false,
      error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_SERVER_ERROR
    };
  }
};

/**
 * Get sellers by approval status
 * @param {string} status - Approval status ('pending', 'approved', 'rejected')
 * @param {Object} options - Query options (limit, skip, sort)
 * @returns {Object} Result object with sellers list
 */
const getSellersByStatus = async (status, options = {}) => {
  try {
    const { limit = 50, skip = 0, sort = { createdAt: -1 } } = options;

    let query = {};
    if (status === 'pending') {
      query = { $or: [{ isApproved: { $exists: false } }, { isApproved: null }] };
    } else if (status === 'approved') {
      query = { isApproved: true };
    } else if (status === 'rejected') {
      query = { isApproved: false };
    }

    const sellers = await Seller.find(query)
      .select('-password')
      .sort(sort)
      .limit(limit)
      .skip(skip);

    const total = await Seller.countDocuments(query);

    return {
      success: true,
      data: {
        sellers,
        pagination: {
          total,
          limit,
          skip,
          hasMore: skip + sellers.length < total
        }
      }
    };

  } catch (error) {
    console.error('❌ Get sellers by status error:', error);
    return {
      success: false,
      error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_SERVER_ERROR
    };
  }
};

module.exports = {
  updateSellerApproval,
  bulkApproveSellers,
  getSellerApprovalHistory,
  getSellersByStatus
};
