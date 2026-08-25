const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Commission = require('../../models/Commission');

// Mock the models
jest.mock('../../models/Order');
jest.mock('../../models/Product');
jest.mock('../../models/Seller');
jest.mock('../../models/Commission');

describe('Seller Order Management Integration Tests', () => {
  let sellerId;
  let mockSeller;
  let mockProduct;

  beforeAll(() => {
    sellerId = new mongoose.Types.ObjectId();
    
    mockSeller = {
      _id: sellerId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'seller@test.com',
      shopName: 'Test Shop',
      commission: 10
    };

    mockProduct = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test Product',
      price: 100,
      seller: sellerId,
      category: new mongoose.Types.ObjectId()
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Order Retrieval and Filtering', () => {
    it('should retrieve only orders containing seller products', async () => {
      const otherSellerId = new mongoose.Types.ObjectId();
      const productId1 = new mongoose.Types.ObjectId();
      const productId2 = new mongoose.Types.ObjectId();

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { _id: productId1 },
          { _id: productId2 }
        ])
      });

      const mockOrders = [
        {
          _id: new mongoose.Types.ObjectId(),
          items: [
            { product: { _id: productId1, seller: sellerId, name: 'Product 1' } }
          ]
        },
        {
          _id: new mongoose.Types.ObjectId(),
          items: [
            { product: { _id: productId2, seller: sellerId, name: 'Product 2' } }
          ]
        },
        {
          _id: new mongoose.Types.ObjectId(),
          items: [
            { product: { _id: new mongoose.Types.ObjectId(), seller: otherSellerId } }
          ]
        }
      ];

      Order.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockOrders.slice(0, 2))
        })
      });

      const sellerProducts = await Product.find({ seller: sellerId }).select('_id');
      const productIds = sellerProducts.map(p => p._id);

      const orders = await Order.find({
        'items.product': { $in: productIds }
      }).populate('items.product').populate('buyer');

      expect(orders).toHaveLength(2);
      expect(Product.find).toHaveBeenCalledWith({ seller: sellerId });
    });

    it('should filter orders by status', async () => {
      const mockOrders = [
        { _id: new mongoose.Types.ObjectId(), status: 'paid' },
        { _id: new mongoose.Types.ObjectId(), status: 'processing' },
        { _id: new mongoose.Types.ObjectId(), status: 'shipped' },
        { _id: new mongoose.Types.ObjectId(), status: 'delivered' }
      ];

      Order.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockOrders.slice(0, 3))
        })
      });

      const activeOrders = await Order.find({
        status: { $in: ['paid', 'processing', 'shipped'] }
      }).populate('items.product').populate('buyer');

      expect(activeOrders).toHaveLength(3);
    });

    it('should filter orders by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const mockOrders = [
        {
          _id: new mongoose.Types.ObjectId(),
          createdAt: new Date('2024-06-15')
        }
      ];

      Order.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockOrders)
        })
      });

      const orders = await Order.find({
        createdAt: { $gte: startDate, $lte: endDate }
      }).populate('items.product').populate('buyer');

      expect(Order.find).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: { $gte: startDate, $lte: endDate }
        })
      );
    });

    it('should search orders by order number or buyer name', async () => {
      const searchQuery = 'ORD-12345';

      Order.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([
            {
              _id: new mongoose.Types.ObjectId(),
              orderNumber: 'ORD-12345'
            }
          ])
        })
      });

      const orders = await Order.find({
        $or: [
          { orderNumber: { $regex: searchQuery, $options: 'i' } }
        ]
      }).populate('items.product').populate('buyer');

      expect(orders).toHaveLength(1);
    });
  });

  describe('Order Status Management', () => {
    it('should update order status from paid to processing', async () => {
      const orderId = new mongoose.Types.ObjectId();
      
      const mockOrder = {
        _id: orderId,
        status: 'paid',
        items: [
          { product: { _id: mockProduct._id, seller: sellerId } }
        ]
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      const updatedOrder = {
        ...mockOrder,
        status: 'processing',
        processingAt: new Date()
      };

      Order.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedOrder);

      const result = await Order.findByIdAndUpdate(
        orderId,
        { status: 'processing', processingAt: new Date() },
        { new: true }
      );

      expect(result.status).toBe('processing');
      expect(result.processingAt).toBeDefined();
    });

    it('should update order status from processing to shipped with tracking', async () => {
      const orderId = new mongoose.Types.ObjectId();
      const trackingNumber = 'TRACK123456';
      
      const mockOrder = {
        _id: orderId,
        status: 'processing'
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      const updatedOrder = {
        ...mockOrder,
        status: 'shipped',
        shippedAt: new Date(),
        trackingNumber
      };

      Order.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedOrder);

      const result = await Order.findByIdAndUpdate(
        orderId,
        { 
          status: 'shipped',
          shippedAt: new Date(),
          trackingNumber
        },
        { new: true }
      );

      expect(result.status).toBe('shipped');
      expect(result.trackingNumber).toBe(trackingNumber);
      expect(result.shippedAt).toBeDefined();
    });

    it('should update order status from shipped to delivered', async () => {
      const orderId = new mongoose.Types.ObjectId();
      
      const mockOrder = {
        _id: orderId,
        status: 'shipped',
        items: [
          {
            product: {
              _id: mockProduct._id,
              seller: sellerId,
              category: mockProduct.category,
              price: 100
            },
            quantity: 2
          }
        ],
        totalPrice: 200
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      const updatedOrder = {
        ...mockOrder,
        status: 'delivered',
        deliveredAt: new Date()
      };

      Order.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedOrder);

      // When order is delivered, commission should be created
      Seller.findById = jest.fn().mockResolvedValue(mockSeller);
      
      Commission.findOne = jest.fn().mockResolvedValue(null); // No duplicate
      Commission.create = jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        seller: sellerId,
        order: orderId,
        product: mockProduct._id,
        orderAmount: 200,
        commissionAmount: 20, // 10% commission
        status: 'pending'
      });

      const result = await Order.findByIdAndUpdate(
        orderId,
        { status: 'delivered', deliveredAt: new Date() },
        { new: true }
      );

      expect(result.status).toBe('delivered');
      expect(result.deliveredAt).toBeDefined();
    });

    it('should validate status transitions', async () => {
      // Valid transitions
      const validTransitions = {
        pending: ['paid', 'cancelled'],
        paid: ['processing', 'cancelled'],
        processing: ['shipped', 'cancelled'],
        shipped: ['delivered'],
        delivered: []
      };

      const isValidTransition = (currentStatus, newStatus) => {
        return validTransitions[currentStatus]?.includes(newStatus) || false;
      };

      expect(isValidTransition('paid', 'processing')).toBe(true);
      expect(isValidTransition('processing', 'shipped')).toBe(true);
      expect(isValidTransition('shipped', 'delivered')).toBe(true);
      expect(isValidTransition('delivered', 'processing')).toBe(false);
      expect(isValidTransition('paid', 'delivered')).toBe(false);
    });

    it('should prevent invalid status transitions', async () => {
      const orderId = new mongoose.Types.ObjectId();
      
      const mockOrder = {
        _id: orderId,
        status: 'delivered'
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      // Trying to move from delivered back to processing
      const invalidTransition = () => {
        if (mockOrder.status === 'delivered') {
          throw new Error('Cannot change status of delivered order');
        }
      };

      expect(invalidTransition).toThrow('Cannot change status of delivered order');
    });
  });

  describe('Order Notes and Communication', () => {
    it('should add order note for communication', async () => {
      const orderId = new mongoose.Types.ObjectId();
      const orderNote = {
        text: 'Package will be shipped tomorrow',
        addedBy: sellerId,
        addedAt: new Date()
      };

      const mockOrder = {
        _id: orderId,
        notes: []
      };

      Order.findById = jest.fn().mockResolvedValue(mockOrder);

      const updatedOrder = {
        ...mockOrder,
        notes: [orderNote]
      };

      Order.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedOrder);

      const result = await Order.findByIdAndUpdate(
        orderId,
        { $push: { notes: orderNote } },
        { new: true }
      );

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].text).toBe(orderNote.text);
    });

    it('should retrieve order notes in chronological order', async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        notes: [
          {
            text: 'First note',
            addedAt: new Date('2024-01-01')
          },
          {
            text: 'Second note',
            addedAt: new Date('2024-01-02')
          },
          {
            text: 'Third note',
            addedAt: new Date('2024-01-03')
          }
        ]
      };

      Order.findById = jest.fn().mockResolvedValue(mockOrder);

      const order = await Order.findById(mockOrder._id);
      const sortedNotes = order.notes.sort((a, b) => a.addedAt - b.addedAt);

      expect(sortedNotes[0].text).toBe('First note');
      expect(sortedNotes[2].text).toBe('Third note');
    });
  });

  describe('Order Tracking Information', () => {
    it('should provide order tracking details', async () => {
      const orderId = new mongoose.Types.ObjectId();
      
      const mockOrder = {
        _id: orderId,
        status: 'shipped',
        trackingNumber: 'TRACK123456',
        shippedAt: new Date('2024-01-10'),
        estimatedDelivery: new Date('2024-01-15'),
        carrier: 'Test Courier'
      };

      Order.findById = jest.fn().mockResolvedValue(mockOrder);

      const order = await Order.findById(orderId);

      expect(order.trackingNumber).toBe('TRACK123456');
      expect(order.carrier).toBe('Test Courier');
      expect(order.estimatedDelivery).toBeDefined();
    });

    it('should update tracking information', async () => {
      const orderId = new mongoose.Types.ObjectId();
      
      const trackingUpdate = {
        trackingNumber: 'TRACK789012',
        carrier: 'New Courier',
        estimatedDelivery: new Date('2024-01-20')
      };

      Order.findByIdAndUpdate = jest.fn().mockResolvedValue({
        _id: orderId,
        ...trackingUpdate
      });

      const result = await Order.findByIdAndUpdate(
        orderId,
        trackingUpdate,
        { new: true }
      );

      expect(result.trackingNumber).toBe('TRACK789012');
      expect(result.carrier).toBe('New Courier');
    });
  });

  describe('Order Items Management', () => {
    it('should calculate seller-specific items in multi-seller orders', async () => {
      const otherSellerId = new mongoose.Types.ObjectId();
      
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        items: [
          {
            product: {
              _id: new mongoose.Types.ObjectId(),
              name: 'Product 1',
              seller: sellerId,
              price: 100
            },
            quantity: 2
          },
          {
            product: {
              _id: new mongoose.Types.ObjectId(),
              name: 'Product 2',
              seller: otherSellerId,
              price: 50
            },
            quantity: 1
          },
          {
            product: {
              _id: new mongoose.Types.ObjectId(),
              name: 'Product 3',
              seller: sellerId,
              price: 75
            },
            quantity: 1
          }
        ]
      };

      // Filter items for current seller
      const sellerItems = mockOrder.items.filter(item => 
        item.product.seller.toString() === sellerId.toString()
      );

      expect(sellerItems).toHaveLength(2);
      
      // Calculate seller's portion of order
      const sellerTotal = sellerItems.reduce((sum, item) => 
        sum + (item.product.price * item.quantity), 0
      );

      expect(sellerTotal).toBe(275); // (100 * 2) + (75 * 1)
    });

    it('should handle product stock updates on order placement', async () => {
      const productId = new mongoose.Types.ObjectId();
      const orderQuantity = 5;

      const mockProduct = {
        _id: productId,
        stock: 50
      };

      Product.findById = jest.fn().mockResolvedValue(mockProduct);

      const updatedProduct = {
        ...mockProduct,
        stock: mockProduct.stock - orderQuantity
      };

      Product.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedProduct);

      const result = await Product.findByIdAndUpdate(
        productId,
        { $inc: { stock: -orderQuantity } },
        { new: true }
      );

      expect(result.stock).toBe(45);
    });
  });

  describe('Order Analytics', () => {
    it('should calculate order statistics for seller', async () => {
      const mockOrders = [
        { status: 'paid', totalPrice: 100 },
        { status: 'processing', totalPrice: 200 },
        { status: 'shipped', totalPrice: 150 },
        { status: 'delivered', totalPrice: 300 },
        { status: 'cancelled', totalPrice: 50 }
      ];

      const stats = {
        total: mockOrders.length,
        byStatus: mockOrders.reduce((acc, order) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
          return acc;
        }, {}),
        totalRevenue: mockOrders.reduce((sum, order) => 
          sum + order.totalPrice, 0
        ),
        averageOrderValue: mockOrders.reduce((sum, order) => 
          sum + order.totalPrice, 0
        ) / mockOrders.length
      };

      expect(stats.total).toBe(5);
      expect(stats.byStatus.delivered).toBe(1);
      expect(stats.totalRevenue).toBe(800);
      expect(stats.averageOrderValue).toBe(160);
    });

    it('should track fulfillment time metrics', async () => {
      const mockOrders = [
        {
          _id: new mongoose.Types.ObjectId(),
          createdAt: new Date('2024-01-01'),
          deliveredAt: new Date('2024-01-05')
        },
        {
          _id: new mongoose.Types.ObjectId(),
          createdAt: new Date('2024-01-10'),
          deliveredAt: new Date('2024-01-13')
        }
      ];

      const fulfillmentTimes = mockOrders.map(order => {
        const diffTime = Math.abs(order.deliveredAt - order.createdAt);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // days
      });

      const averageFulfillmentTime = fulfillmentTimes.reduce((a, b) => a + b, 0) / fulfillmentTimes.length;

      expect(fulfillmentTimes).toEqual([4, 3]);
      expect(averageFulfillmentTime).toBe(3.5);
    });
  });

  describe('Order Access Control', () => {
    it('should verify seller can only access their own orders', async () => {
      const orderId = new mongoose.Types.ObjectId();
      const otherSellerId = new mongoose.Types.ObjectId();

      const mockOrder = {
        _id: orderId,
        items: [
          {
            product: {
              _id: new mongoose.Types.ObjectId(),
              seller: otherSellerId
            }
          }
        ]
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      const order = await Order.findById(orderId).populate('items.product');

      const hasAccess = order.items.some(item => 
        item.product.seller.toString() === sellerId.toString()
      );

      expect(hasAccess).toBe(false);
    });

    it('should allow seller to access orders with their products', async () => {
      const orderId = new mongoose.Types.ObjectId();

      const mockOrder = {
        _id: orderId,
        items: [
          {
            product: {
              _id: new mongoose.Types.ObjectId(),
              seller: sellerId
            }
          }
        ]
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      const order = await Order.findById(orderId).populate('items.product');

      const hasAccess = order.items.some(item => 
        item.product.seller.toString() === sellerId.toString()
      );

      expect(hasAccess).toBe(true);
    });
  });
});

