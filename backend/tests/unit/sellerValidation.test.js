const Seller = require('../../models/Seller');
const mongoose = require('mongoose');

describe('Seller Bank Account Validation Tests', () => {
    test('Should accept valid bank details', async () => {
        const seller = new Seller({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '1234567890',
            shopName: 'Johns Shop',
            shopUrl: 'john-shop',
            username: 'johndoe',
            password: 'password123',
            bankAccount: {
                accountNumber: '123456789012',
                accountNumberConfirm: '123456789012',
                ifscCode: 'SBIN0001234',
                upiId: 'john@okaxis'
            }
        });

        const validation = seller.validateSync();
        expect(validation).toBeUndefined();
    });

    test('Should reject mismatched account numbers', async () => {
        const seller = new Seller({
            bankAccount: {
                accountNumber: '123456789012',
                accountNumberConfirm: '123456789013' // Mismatch
            }
        });

        const validation = seller.validateSync();
        expect(validation.errors['bankAccount.accountNumberConfirm']).toBeDefined();
        expect(validation.errors['bankAccount.accountNumberConfirm'].message).toBe('Account numbers do not match');
    });

    test('Should reject invalid IFSC format', async () => {
        const seller = new Seller({
            bankAccount: {
                ifscCode: 'ABCD012345' // Too short, missing zero at 5th char
            }
        });

        const validation = seller.validateSync();
        expect(validation.errors['bankAccount.ifscCode']).toBeDefined();
    });

    test('Should reject invalid UPI format', async () => {
        const seller = new Seller({
            bankAccount: {
                upiId: 'invalid-upi' // Missing @
            }
        });

        const validation = seller.validateSync();
        expect(validation.errors['bankAccount.upiId']).toBeDefined();
    });
});
