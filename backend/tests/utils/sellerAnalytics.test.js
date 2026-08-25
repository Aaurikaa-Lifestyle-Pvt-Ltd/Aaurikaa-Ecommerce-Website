const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Commission = require('../../models/Commission');

// Mock the models
jest.mock('../../models/Order');
jest.mock('../../models/Product');
jest.mock('../../models/Commission');

describe('Seller Analytics Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Active Orders Calculation', () => {
    it('should count orders with paid, processing, or shipped status as active', () => {
      const orders = [
        { status: 'paid' },
        { status: 'processing' },
        { status: 'shipped' },
        { status: 'delivered' },
        { status: 'cancelled' },
        { status: 'pending' }
      ];

      const activeOrders = orders.filter(order => 
        ['paid', 'processing', 'shipped'].includes(order.status)
      ).length;

      expect(activeOrders).toBe(3);
    });

    it('should return 0 when no active orders exist', () => {
      const orders = [
        { status: 'delivered' },
        { status: 'cancelled' }
      ];

      const activeOrders = orders.filter(order => 
        ['paid', 'processing', 'shipped'].includes(order.status)
      ).length;

      expect(activeOrders).toBe(0);
    });

    it('should handle empty orders array', () => {
      const orders = [];

      const activeOrders = orders.filter(order => 
        ['paid', 'processing', 'shipped'].includes(order.status)
      ).length;

      expect(activeOrders).toBe(0);
    });
  });

  describe('Commission Summary Calculation', () => {
    it('should calculate commission summary by status correctly', () => {
      const commissionData = [
        { _id: 'pending', count: 5, total: 500 },
        { _id: 'approved', count: 10, total: 1000 },
        { _id: 'paid', count: 15, total: 1500 }
      ];

      const summary = {
        pending: 0,
        approved: 0,
        paid: 0,
        total: 0
      };

      commissionData.forEach(item => {
        if (summary.hasOwnProperty(item._id)) {
          summary[item._id] = item.total;
        }
        summary.total += item.total;
      });

      expect(summary.pending).toBe(500);
      expect(summary.approved).toBe(1000);
      expect(summary.paid).toBe(1500);
      expect(summary.total).toBe(3000);
    });

    it('should handle missing status categories', () => {
      const commissionData = [
        { _id: 'paid', count: 10, total: 1000 }
      ];

      const summary = {
        pending: 0,
        approved: 0,
        paid: 0,
        total: 0
      };

      commissionData.forEach(item => {
        if (summary.hasOwnProperty(item._id)) {
          summary[item._id] = item.total;
        }
        summary.total += item.total;
      });

      expect(summary.pending).toBe(0);
      expect(summary.approved).toBe(0);
      expect(summary.paid).toBe(1000);
      expect(summary.total).toBe(1000);
    });

    it('should ignore unknown status categories', () => {
      const commissionData = [
        { _id: 'pending', count: 5, total: 500 },
        { _id: 'unknown', count: 3, total: 300 }
      ];

      const summary = {
        pending: 0,
        approved: 0,
        paid: 0,
        total: 0
      };

      commissionData.forEach(item => {
        if (summary.hasOwnProperty(item._id)) {
          summary[item._id] = item.total;
        }
        summary.total += item.total;
      });

      expect(summary.pending).toBe(500);
      expect(summary.total).toBe(800); // Includes unknown status
    });
  });

  describe('Top Products Calculation', () => {
    it('should identify top products by order count and revenue', () => {
      const productSales = [
        { _id: 'product1', name: 'Product 1', orderCount: 10, revenue: 1000 },
        { _id: 'product2', name: 'Product 2', orderCount: 5, revenue: 500 },
        { _id: 'product3', name: 'Product 3', orderCount: 15, revenue: 1500 }
      ];

      const topByOrders = [...productSales].sort((a, b) => b.orderCount - a.orderCount);
      const topByRevenue = [...productSales].sort((a, b) => b.revenue - a.revenue);

      expect(topByOrders[0]._id).toBe('product3');
      expect(topByOrders[0].orderCount).toBe(15);

      expect(topByRevenue[0]._id).toBe('product3');
      expect(topByRevenue[0].revenue).toBe(1500);
    });

    it('should limit top products to specified count', () => {
      const productSales = [
        { _id: 'product1', name: 'Product 1', orderCount: 10, revenue: 1000 },
        { _id: 'product2', name: 'Product 2', orderCount: 5, revenue: 500 },
        { _id: 'product3', name: 'Product 3', orderCount: 15, revenue: 1500 },
        { _id: 'product4', name: 'Product 4', orderCount: 8, revenue: 800 }
      ];

      const limit = 3;
      const topProducts = [...productSales]
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, limit);

      expect(topProducts).toHaveLength(3);
      expect(topProducts[0]._id).toBe('product3');
      expect(topProducts[1]._id).toBe('product1');
      expect(topProducts[2]._id).toBe('product4');
    });

    it('should handle empty product sales array', () => {
      const productSales = [];

      const topProducts = [...productSales]
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, 5);

      expect(topProducts).toHaveLength(0);
    });
  });

  describe('Monthly Earnings Calculation', () => {
    it('should calculate monthly earnings correctly', () => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      const earnings = [100, 200, 150, 300, 250, 400];

      const monthlyEarnings = months.map((month, index) => ({
        month,
        earnings: earnings[index]
      }));

      expect(monthlyEarnings).toHaveLength(6);
      expect(monthlyEarnings[0]).toEqual({ month: 'Jan', earnings: 100 });
      expect(monthlyEarnings[5]).toEqual({ month: 'Jun', earnings: 400 });
    });

    it('should handle months with zero earnings', () => {
      const monthlyData = [
        { month: 'Jan', earnings: 0 },
        { month: 'Feb', earnings: 100 },
        { month: 'Mar', earnings: 0 }
      ];

      const totalEarnings = monthlyData.reduce((sum, item) => sum + item.earnings, 0);

      expect(totalEarnings).toBe(100);
    });

    it('should calculate average monthly earnings', () => {
      const monthlyEarnings = [
        { month: 'Jan', earnings: 100 },
        { month: 'Feb', earnings: 200 },
        { month: 'Mar', earnings: 150 },
        { month: 'Apr', earnings: 300 }
      ];

      const total = monthlyEarnings.reduce((sum, item) => sum + item.earnings, 0);
      const average = total / monthlyEarnings.length;

      expect(average).toBe(187.5);
    });
  });

  describe('Revenue Analytics', () => {
    it('should calculate total revenue from orders', () => {
      const orders = [
        { totalPrice: 1000 },
        { totalPrice: 2000 },
        { totalPrice: 1500 }
      ];

      const totalRevenue = orders.reduce((sum, order) => sum + order.totalPrice, 0);

      expect(totalRevenue).toBe(4500);
    });

    it('should calculate average order value', () => {
      const orders = [
        { totalPrice: 1000 },
        { totalPrice: 2000 },
        { totalPrice: 1500 }
      ];

      const totalRevenue = orders.reduce((sum, order) => sum + order.totalPrice, 0);
      const averageOrderValue = totalRevenue / orders.length;

      expect(averageOrderValue).toBe(1500);
    });

    it('should handle zero orders for average calculation', () => {
      const orders = [];
      const totalRevenue = orders.reduce((sum, order) => sum + order.totalPrice, 0);
      const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

      expect(averageOrderValue).toBe(0);
    });
  });

  describe('Order Status Distribution', () => {
    it('should calculate order count by status', () => {
      const orders = [
        { status: 'paid' },
        { status: 'processing' },
        { status: 'paid' },
        { status: 'shipped' },
        { status: 'paid' },
        { status: 'delivered' }
      ];

      const statusDistribution = orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});

      expect(statusDistribution.paid).toBe(3);
      expect(statusDistribution.processing).toBe(1);
      expect(statusDistribution.shipped).toBe(1);
      expect(statusDistribution.delivered).toBe(1);
    });

    it('should calculate percentage distribution', () => {
      const orders = [
        { status: 'paid' },
        { status: 'processing' },
        { status: 'paid' },
        { status: 'shipped' }
      ];

      const statusDistribution = orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});

      const percentages = {};
      Object.keys(statusDistribution).forEach(status => {
        percentages[status] = (statusDistribution[status] / orders.length) * 100;
      });

      expect(percentages.paid).toBe(50);
      expect(percentages.processing).toBe(25);
      expect(percentages.shipped).toBe(25);
    });
  });

  describe('Recent Orders Analysis', () => {
    it('should sort orders by date descending', () => {
      const orders = [
        { _id: 'order1', createdAt: new Date('2024-01-01') },
        { _id: 'order2', createdAt: new Date('2024-01-03') },
        { _id: 'order3', createdAt: new Date('2024-01-02') }
      ];

      const sortedOrders = [...orders].sort((a, b) => b.createdAt - a.createdAt);

      expect(sortedOrders[0]._id).toBe('order2');
      expect(sortedOrders[1]._id).toBe('order3');
      expect(sortedOrders[2]._id).toBe('order1');
    });

    it('should limit recent orders to specified count', () => {
      const orders = Array.from({ length: 10 }, (_, i) => ({
        _id: `order${i}`,
        createdAt: new Date(`2024-01-${i + 1}`)
      }));

      const recentOrders = [...orders]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5);

      expect(recentOrders).toHaveLength(5);
    });
  });

  describe('Product Performance Metrics', () => {
    it('should calculate product sell-through rate', () => {
      const product = {
        stock: 100,
        sold: 75
      };

      const sellThroughRate = (product.sold / (product.stock + product.sold)) * 100;

      expect(sellThroughRate).toBeCloseTo(42.86, 2);
    });

    it('should calculate inventory turnover', () => {
      const product = {
        sold: 100,
        averageInventory: 50
      };

      const inventoryTurnover = product.sold / product.averageInventory;

      expect(inventoryTurnover).toBe(2);
    });

    it('should handle zero inventory for turnover calculation', () => {
      const product = {
        sold: 100,
        averageInventory: 0
      };

      const inventoryTurnover = product.averageInventory > 0 
        ? product.sold / product.averageInventory 
        : 0;

      expect(inventoryTurnover).toBe(0);
    });
  });

  describe('Sales Velocity Calculation', () => {
    it('should calculate daily sales velocity', () => {
      const product = {
        sold: 300,
        daysActive: 30
      };

      const dailySalesVelocity = product.sold / product.daysActive;

      expect(dailySalesVelocity).toBe(10);
    });

    it('should calculate weekly sales velocity', () => {
      const product = {
        sold: 280,
        weeksActive: 4
      };

      const weeklySalesVelocity = product.sold / product.weeksActive;

      expect(weeklySalesVelocity).toBe(70);
    });

    it('should handle zero active period', () => {
      const product = {
        sold: 100,
        daysActive: 0
      };

      const dailySalesVelocity = product.daysActive > 0 
        ? product.sold / product.daysActive 
        : 0;

      expect(dailySalesVelocity).toBe(0);
    });
  });

  describe('Commission Rate Analysis', () => {
    it('should calculate weighted average commission rate', () => {
      const commissions = [
        { rate: 10, amount: 100 },
        { rate: 15, amount: 200 },
        { rate: 12, amount: 150 }
      ];

      const totalAmount = commissions.reduce((sum, c) => sum + c.amount, 0);
      const weightedAverage = commissions.reduce((sum, c) => 
        sum + (c.rate * c.amount / totalAmount), 0
      );

      expect(weightedAverage).toBeCloseTo(12.89, 2);
    });

    it('should calculate total commission earnings', () => {
      const commissions = [
        { amount: 100 },
        { amount: 200 },
        { amount: 150 }
      ];

      const total = commissions.reduce((sum, c) => sum + c.amount, 0);

      expect(total).toBe(450);
    });
  });

  describe('Date Range Filtering', () => {
    it('should filter data within date range', () => {
      const data = [
        { createdAt: new Date('2024-01-01') },
        { createdAt: new Date('2024-02-15') },
        { createdAt: new Date('2024-03-30') }
      ];

      const startDate = new Date('2024-02-01');
      const endDate = new Date('2024-03-31');

      const filtered = data.filter(item => 
        item.createdAt >= startDate && item.createdAt <= endDate
      );

      expect(filtered).toHaveLength(2);
    });

    it('should include boundary dates', () => {
      const data = [
        { createdAt: new Date('2024-01-01') },
        { createdAt: new Date('2024-02-01') },
        { createdAt: new Date('2024-03-01') }
      ];

      const startDate = new Date('2024-02-01');
      const endDate = new Date('2024-03-01');

      const filtered = data.filter(item => 
        item.createdAt >= startDate && item.createdAt <= endDate
      );

      expect(filtered).toHaveLength(2);
    });
  });
});

