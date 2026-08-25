const { notifyAdminNewSeller, notifySellerStatusUpdate } = require('../../utils/notificationService');

// Mock the sendMail utility
jest.mock('../../utils/sendMail', () => jest.fn());

// Mock the Admin model
jest.mock('../../models/Admin', () => ({
  find: jest.fn(() => Promise.resolve([
    { email: 'admin1@example.com', name: 'Admin One' },
    { email: 'admin2@example.com', name: 'Admin Two' }
  ]))
}));

describe('Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('notifyAdminNewSeller', () => {
    const mockSellerData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '1234567890',
      username: 'johndoe',
      shopName: 'John\'s Shop',
      shopUrl: 'https://johnsshop.com',
      address: {
        address1: '123 Main Street',
        address2: 'Apt 4B',
        pincode: '123456',
        country: 'India',
        state: 'Maharashtra',
        district: 'Mumbai'
      },
      shopImage: 'shop-image.jpg',
      aadhaarFront: 'aadhaar-front.jpg',
      aadhaarBack: 'aadhaar-back.jpg',
      tradeLicense: 'trade-license.pdf',
      panCard: 'pan-card.jpg',
      gst: 'gst-certificate.pdf',
      otherDocs: ['doc1.pdf', 'doc2.pdf']
    };

    it('should send notification to all admins successfully', async () => {
      const result = await notifyAdminNewSeller(mockSellerData);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Notification sent to 2 admin(s)');
      expect(result.adminCount).toBe(2);
      expect(result.adminEmails).toEqual(['admin1@example.com', 'admin2@example.com']);
    });

    it('should handle case when no admins are found', async () => {
      const Admin = require('../../models/Admin');
      Admin.find.mockResolvedValueOnce([]);

      const result = await notifyAdminNewSeller(mockSellerData);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('No admins found to notify');
    });

    it('should handle notification errors gracefully', async () => {
      const sendMail = require('../../utils/sendMail');
      sendMail.mockRejectedValueOnce(new Error('Email service unavailable'));

      const result = await notifyAdminNewSeller(mockSellerData);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to send admin notification');
      expect(result.error).toBe('Email service unavailable');
    });
  });

  describe('notifySellerStatusUpdate', () => {
    const mockSellerData = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      shopName: 'Jane\'s Boutique'
    };

    it('should send approval notification successfully', async () => {
      const result = await notifySellerStatusUpdate(mockSellerData, 'approved');
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Seller notification sent - Status: approved');
    });

    it('should send rejection notification with reason successfully', async () => {
      const result = await notifySellerStatusUpdate(mockSellerData, 'rejected', 'Incomplete documentation');
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Seller notification sent - Status: rejected');
    });

    it('should handle notification errors gracefully', async () => {
      const sendMail = require('../../utils/sendMail');
      sendMail.mockRejectedValueOnce(new Error('Email service unavailable'));

      const result = await notifySellerStatusUpdate(mockSellerData, 'approved');
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to send seller notification');
      expect(result.error).toBe('Email service unavailable');
    });
  });
});
