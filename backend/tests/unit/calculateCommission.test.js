const { calculateCommission } = require('../../utils/calculateCommission');
const Seller = require('../../models/Seller');
const Category = require('../../models/Category');

jest.mock('../../models/Seller');
jest.mock('../../models/Category');

describe('calculateCommission Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('Priority 1: Seller-specific category override (Flat)', async () => {
        const sellerId = 'seller_1';
        const categoryId = 'cat_1';
        const price = 2000;

        Seller.findById.mockResolvedValue({
            _id: sellerId,
            categoryCommission: [
                {
                    categoryId: categoryId,
                    commissionType: 'flat',
                    commissionAmount: 150
                }
            ]
        });

        const result = await calculateCommission(sellerId, categoryId, price);

        expect(result.appliedRule).toBe('seller_category_override');
        expect(result.commissionType).toBe('flat');
        expect(result.commissionAmount).toBe(150);
    });

    test('Priority 1: Seller-specific category override (Percentage)', async () => {
        const sellerId = 'seller_1';
        const categoryId = 'cat_1';
        const price = 1000;

        Seller.findById.mockResolvedValue({
            _id: sellerId,
            categoryCommission: [
                {
                    categoryId: categoryId,
                    commissionType: 'percentage',
                    commissionRate: 15
                }
            ]
        });

        const result = await calculateCommission(sellerId, categoryId, price);

        expect(result.appliedRule).toBe('seller_category_override');
        expect(result.commissionType).toBe('percentage');
        expect(result.commissionAmount).toBe(150);
    });

    test('Priority 2: Seller default (Percentage)', async () => {
        const sellerId = 'seller_1';
        const categoryId = 'cat_1';
        const price = 1000;

        Seller.findById.mockResolvedValue({
            _id: sellerId,
            commissionType: 'percentage',
            commission: 8,
            categoryCommission: []
        });
        Category.findById.mockResolvedValue({});

        const result = await calculateCommission(sellerId, categoryId, price);

        expect(result.appliedRule).toBe('seller_default');
        expect(result.commissionAmount).toBe(80);
    });

    test('Priority 3: Category default (Flat)', async () => {
        const sellerId = 'seller_1';
        const categoryId = 'cat_1';
        const price = 1000;

        Seller.findById.mockResolvedValue({
            _id: sellerId,
            commissionType: 'percentage',
            commission: 0,
            categoryCommission: []
        });
        Category.findById.mockResolvedValue({
            _id: categoryId,
            commissionType: 'flat',
            commissionAmount: 50
        });

        const result = await calculateCommission(sellerId, categoryId, price);

        expect(result.appliedRule).toBe('category_default');
        expect(result.commissionType).toBe('flat');
        expect(result.commissionAmount).toBe(50);
    });

    test('Priority 4: System default fallback (5%)', async () => {
        const sellerId = 'seller_1';
        const categoryId = 'cat_1';
        const price = 1000;

        Seller.findById.mockResolvedValue({
            _id: sellerId,
            commission: 0,
            categoryCommission: []
        });
        Category.findById.mockResolvedValue({});

        const result = await calculateCommission(sellerId, categoryId, price);

        expect(result.appliedRule).toBe('system_default');
        expect(result.commissionRate).toBe(5);
        expect(result.commissionAmount).toBe(50);
    });
});
