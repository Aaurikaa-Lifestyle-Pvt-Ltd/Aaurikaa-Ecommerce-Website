// backend/utils/notificationService.js

const sendMail = require('./sendMail');
const Admin = require('../models/Admin');

/**
 * Send notification to admin when new seller registers
 * @param {Object} sellerData - Seller registration data
 * @returns {Promise<Object>} - Result object
 */
const notifyAdminNewSeller = async (sellerData) => {
  try {
    // Get all admin emails
    const admins = await Admin.find({}, 'email name');
    
    if (admins.length === 0) {
      console.log('⚠️ No admins found to notify');
      return {
        success: false,
        message: 'No admins found to notify'
      };
    }

    const adminEmails = admins.map(admin => admin.email);
    const adminNames = admins.map(admin => admin.name).join(', ');

    // Create notification email content
    const subject = `New Seller Registration - ${sellerData.shopName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #007bff; margin: 0;">🛍️ New Seller Registration</h2>
          <p style="margin: 10px 0 0 0; color: #6c757d;">A new seller has registered and is awaiting approval</p>
        </div>

        <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px;">
          <h3 style="color: #495057; margin-top: 0;">Seller Information</h3>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div>
              <h4 style="color: #6c757d; margin: 0 0 10px 0;">Personal Details</h4>
              <p><strong>Name:</strong> ${sellerData.firstName} ${sellerData.lastName}</p>
              <p><strong>Email:</strong> ${sellerData.email}</p>
              <p><strong>Phone:</strong> ${sellerData.phone}</p>
              <p><strong>Username:</strong> ${sellerData.username}</p>
            </div>
            
            <div>
              <h4 style="color: #6c757d; margin: 0 0 10px 0;">Shop Details</h4>
              <p><strong>Shop Name:</strong> ${sellerData.shopName}</p>
              <p><strong>Shop URL:</strong> <a href="${sellerData.shopUrl}" target="_blank">${sellerData.shopUrl}</a></p>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            <h4 style="color: #6c757d; margin: 0 0 10px 0;">Address</h4>
            <p>${sellerData.address.address1}</p>
            ${sellerData.address.address2 ? `<p>${sellerData.address.address2}</p>` : ''}
            <p>${sellerData.address.district}, ${sellerData.address.state}</p>
            <p>${sellerData.address.country} - ${sellerData.address.pincode}</p>
          </div>

          <div style="margin-bottom: 20px;">
            <h4 style="color: #6c757d; margin: 0 0 10px 0;">Documents Submitted</h4>
            <ul style="margin: 0; padding-left: 20px;">
              ${sellerData.shopImage ? '<li>Shop Image</li>' : ''}
              ${sellerData.aadhaarFront ? '<li>Aadhaar Front</li>' : ''}
              ${sellerData.aadhaarBack ? '<li>Aadhaar Back</li>' : ''}
              ${sellerData.tradeLicense ? '<li>Trade License</li>' : ''}
              ${sellerData.panCard ? '<li>PAN Card</li>' : ''}
              ${sellerData.gst ? '<li>GST Certificate</li>' : ''}
              ${sellerData.otherDocs && sellerData.otherDocs.length > 0 ? `<li>Other Documents (${sellerData.otherDocs.length})</li>` : ''}
            </ul>
          </div>

          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin-bottom: 20px;">
            <h4 style="color: #856404; margin: 0 0 10px 0;">⚠️ Action Required</h4>
            <p style="color: #856404; margin: 0;">This seller is pending approval. Please review their documents and approve or reject their application.</p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3000/admin/sellers'}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Review Seller Application
            </a>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This is an automated notification from the Multi-Vendor E-commerce platform.<br>
            Registration Date: ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    `;

    // Send email to all admins
    const emailPromises = adminEmails.map(email => 
      sendMail(email, subject, html)
    );

    await Promise.all(emailPromises);

    console.log(`✅ Admin notification sent to ${adminEmails.length} admin(s): ${adminNames}`);

    return {
      success: true,
      message: `Notification sent to ${adminEmails.length} admin(s)`,
      adminCount: adminEmails.length,
      adminEmails
    };

  } catch (error) {
    console.error('❌ Admin notification error:', error);
    return {
      success: false,
      message: 'Failed to send admin notification',
      error: error.message
    };
  }
};

/**
 * Send notification to seller when their application is approved/rejected
 * @param {Object} sellerData - Seller data
 * @param {string} status - 'approved' or 'rejected'
 * @param {string} reason - Reason for rejection (optional)
 * @returns {Promise<Object>} - Result object
 */
const notifySellerStatusUpdate = async (sellerData, status, reason = '') => {
  try {
    const subject = `Seller Application ${status === 'approved' ? 'Approved' : 'Rejected'} - ${sellerData.shopName}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: ${status === 'approved' ? '#d4edda' : '#f8d7da'}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: ${status === 'approved' ? '#155724' : '#721c24'}; margin: 0;">
            ${status === 'approved' ? '✅ Application Approved!' : '❌ Application Rejected'}
          </h2>
          <p style="margin: 10px 0 0 0; color: ${status === 'approved' ? '#155724' : '#721c24'};">
            Your seller application has been ${status}.
          </p>
        </div>

        <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px;">
          <p>Hello ${sellerData.firstName} ${sellerData.lastName},</p>
          
          ${status === 'approved' 
            ? `
              <p>Congratulations! Your seller application for <strong>${sellerData.shopName}</strong> has been approved.</p>
              <p>You can now:</p>
              <ul>
                <li>Login to your seller dashboard</li>
                <li>Add products to your shop</li>
                <li>Manage your orders</li>
                <li>View your sales analytics</li>
              </ul>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.SELLER_DASHBOARD_URL || 'http://localhost:3000/seller/dashboard'}" 
                   style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                  Access Seller Dashboard
                </a>
              </div>
            `
            : `
              <p>We regret to inform you that your seller application for <strong>${sellerData.shopName}</strong> has been rejected.</p>
              ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              <p>You can submit a new application with the required corrections.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.SELLER_REGISTRATION_URL || 'http://localhost:3000/seller/register'}" 
                   style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                  Submit New Application
                </a>
              </div>
            `
          }
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This is an automated message from the Multi-Vendor E-commerce platform.<br>
            Date: ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    `;

    await sendMail(sellerData.email, subject, html);

    console.log(`✅ Seller notification sent to ${sellerData.email} - Status: ${status}`);

    return {
      success: true,
      message: `Seller notification sent - Status: ${status}`
    };

  } catch (error) {
    console.error('❌ Seller notification error:', error);
    return {
      success: false,
      message: 'Failed to send seller notification',
      error: error.message
    };
  }
};

/**
 * Send notification to seller for new order
 * @param {Object} sellerData - Seller data
 * @param {Object} orderData - Order data
 * @returns {Promise<Object>} - Result object
 */
const notifySellerNewOrder = async (sellerData, orderData) => {
  try {
    const subject = `New Order Received - Order #${orderData.orderNumber}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #1976d2; margin: 0;">🛍️ New Order Received!</h2>
          <p style="margin: 10px 0 0 0; color: #1976d2;">You have received a new order</p>
        </div>

        <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px;">
          <p>Hello ${sellerData.firstName} ${sellerData.lastName},</p>
          
          <p>You have received a new order for your shop <strong>${sellerData.shopName}</strong>.</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #495057;">Order Details</h3>
            <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
            <p><strong>Order Amount:</strong> ₹${orderData.totalAmount}</p>
            <p><strong>Customer:</strong> ${orderData.buyer?.name || 'N/A'}</p>
            <p><strong>Order Date:</strong> ${new Date(orderData.createdAt).toLocaleString()}</p>
          </div>
          
          <p>Please process this order as soon as possible to maintain good customer satisfaction.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.SELLER_DASHBOARD_URL || 'http://localhost:3000/seller/orders'}" 
               style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View Order Details
            </a>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This is an automated message from the Multi-Vendor E-commerce platform.<br>
            Date: ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    `;

    await sendMail(sellerData.email, subject, html);

    console.log(`✅ New order notification sent to seller ${sellerData.email} - Order: ${orderData.orderNumber}`);

    return {
      success: true,
      message: `New order notification sent to seller - Order: ${orderData.orderNumber}`
    };

  } catch (error) {
    console.error('❌ New order notification error:', error);
    return {
      success: false,
      message: 'Failed to send new order notification',
      error: error.message
    };
  }
};

/**
 * Send notification to seller for payment update
 * @param {Object} sellerData - Seller data
 * @param {Object} paymentData - Payment data
 * @returns {Promise<Object>} - Result object
 */
const notifySellerPaymentUpdate = async (sellerData, paymentData) => {
  try {
    const subject = `Payment Update - ${paymentData.status === 'completed' ? 'Payment Received' : 'Payment Pending'}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: ${paymentData.status === 'completed' ? '#e8f5e8' : '#fff3cd'}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: ${paymentData.status === 'completed' ? '#155724' : '#856404'}; margin: 0;">
            ${paymentData.status === 'completed' ? '💰 Payment Received!' : '⏳ Payment Pending'}
          </h2>
          <p style="margin: 10px 0 0 0; color: ${paymentData.status === 'completed' ? '#155724' : '#856404'};">
            ${paymentData.status === 'completed' ? 'Your payment has been processed' : 'Your payment is being processed'}
          </p>
        </div>

        <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px;">
          <p>Hello ${sellerData.firstName} ${sellerData.lastName},</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #495057;">Payment Details</h3>
            <p><strong>Amount:</strong> ₹${paymentData.amount}</p>
            <p><strong>Payment Method:</strong> ${paymentData.paymentMethod?.type || 'N/A'}</p>
            <p><strong>Status:</strong> ${paymentData.status}</p>
            <p><strong>Date:</strong> ${new Date(paymentData.requestedAt).toLocaleString()}</p>
          </div>
          
          ${paymentData.status === 'completed' 
            ? '<p>Your payment has been successfully processed and credited to your account.</p>'
            : '<p>Your payment request is being processed. You will receive another notification once it\'s completed.</p>'
          }
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.SELLER_DASHBOARD_URL || 'http://localhost:3000/seller/payments'}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View Payment History
            </a>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This is an automated message from the Multi-Vendor E-commerce platform.<br>
            Date: ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    `;

    await sendMail(sellerData.email, subject, html);

    console.log(`✅ Payment notification sent to seller ${sellerData.email} - Amount: ₹${paymentData.amount}`);

    return {
      success: true,
      message: `Payment notification sent to seller - Amount: ₹${paymentData.amount}`
    };

  } catch (error) {
    console.error('❌ Payment notification error:', error);
    return {
      success: false,
      message: 'Failed to send payment notification',
      error: error.message
    };
  }
};

/**
 * Send notification to seller for commission update
 * @param {Object} sellerData - Seller data
 * @param {Object} commissionData - Commission data
 * @returns {Promise<Object>} - Result object
 */
const notifySellerCommissionUpdate = async (sellerData, commissionData) => {
  try {
    const subject = `Commission Update - ${commissionData.status === 'approved' ? 'Commission Approved' : 'Commission Pending'}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: ${commissionData.status === 'approved' ? '#e8f5e8' : '#fff3cd'}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: ${commissionData.status === 'approved' ? '#155724' : '#856404'}; margin: 0;">
            ${commissionData.status === 'approved' ? '✅ Commission Approved!' : '⏳ Commission Pending'}
          </h2>
          <p style="margin: 10px 0 0 0; color: ${commissionData.status === 'approved' ? '#155724' : '#856404'};">
            ${commissionData.status === 'approved' ? 'Your commission has been approved' : 'Your commission is under review'}
          </p>
        </div>

        <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px;">
          <p>Hello ${sellerData.firstName} ${sellerData.lastName},</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #495057;">Commission Details</h3>
            <p><strong>Commission Amount:</strong> ₹${commissionData.commissionAmount}</p>
            <p><strong>Order Amount:</strong> ₹${commissionData.orderAmount}</p>
            <p><strong>Commission Rate:</strong> ${commissionData.commissionRate}%</p>
            <p><strong>Status:</strong> ${commissionData.status}</p>
            <p><strong>Date:</strong> ${new Date(commissionData.createdAt).toLocaleString()}</p>
          </div>
          
          ${commissionData.status === 'approved' 
            ? '<p>Your commission has been approved and will be included in your next payout.</p>'
            : '<p>Your commission is currently under review. You will receive another notification once it\'s approved.</p>'
          }
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.SELLER_DASHBOARD_URL || 'http://localhost:3000/seller/commissions'}" 
               style="background-color: #6f42c1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View Commission Details
            </a>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This is an automated message from the Multi-Vendor E-commerce platform.<br>
            Date: ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    `;

    await sendMail(sellerData.email, subject, html);

    console.log(`✅ Commission notification sent to seller ${sellerData.email} - Amount: ₹${commissionData.commissionAmount}`);

    return {
      success: true,
      message: `Commission notification sent to seller - Amount: ₹${commissionData.commissionAmount}`
    };

  } catch (error) {
    console.error('❌ Commission notification error:', error);
    return {
      success: false,
      message: 'Failed to send commission notification',
      error: error.message
    };
  }
};

module.exports = {
  notifyAdminNewSeller,
  notifySellerStatusUpdate,
  notifySellerNewOrder,
  notifySellerPaymentUpdate,
  notifySellerCommissionUpdate
};
