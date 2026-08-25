const mongoose = require('mongoose');
const {
  validateProductWeightClass,
  resolveWeightClassForImport,
  WEIGHT_CLASS_REQUIRED_MESSAGE,
  WEIGHT_CLASS_INACTIVE_MESSAGE,
  WEIGHT_CLASS_NAME_NOT_FOUND_MESSAGE,
  WEIGHT_CLASS_NAME_AMBIGUOUS_MESSAGE,
  WEIGHT_CLASS_ID_INVALID_MESSAGE,
} = require('../../utils/catalogShippingValidation');
const WeightClass = require('../../models/WeightClass');

describe('catalogShippingValidation (weightClass / Shipping Slab)', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await WeightClass.deleteMany({});
  });

  describe('validateProductWeightClass', () => {
    it('requires slab when required=true', async () => {
      const result = await validateProductWeightClass('', { required: true });
      expect(result.valid).toBe(false);
      expect(result.message).toBe(WEIGHT_CLASS_REQUIRED_MESSAGE);
    });

    it('allows empty when required=false', async () => {
      const result = await validateProductWeightClass('', { required: false });
      expect(result.valid).toBe(true);
      expect(result.value).toBeNull();
    });

    it('rejects inactive class', async () => {
      const wc = await WeightClass.create({
        name: 'Inactive Slab',
        minWeightG: 0,
        maxWeightG: 1000,
        active: false,
      });
      const result = await validateProductWeightClass(wc._id, { required: true });
      expect(result.valid).toBe(false);
      expect(result.message).toBe(WEIGHT_CLASS_INACTIVE_MESSAGE);
    });

    it('accepts active class', async () => {
      const wc = await WeightClass.create({
        name: 'Active Slab',
        minWeightG: 0,
        maxWeightG: 1000,
        active: true,
      });
      const result = await validateProductWeightClass(String(wc._id), { required: true });
      expect(result.valid).toBe(true);
      expect(String(result.value)).toBe(String(wc._id));
    });
  });

  describe('resolveWeightClassForImport', () => {
    it('resolves by unique name', async () => {
      const wc = await WeightClass.create({
        name: 'Standard Parcel',
        minWeightG: 0,
        maxWeightG: 5000,
        active: true,
      });
      const result = await resolveWeightClassForImport('standard parcel');
      expect(result.ok).toBe(true);
      expect(String(result.value)).toBe(String(wc._id));
    });

    it('rejects unknown name', async () => {
      const result = await resolveWeightClassForImport('Missing Slab');
      expect(result.ok).toBe(false);
      expect(result.message).toBe(WEIGHT_CLASS_NAME_NOT_FOUND_MESSAGE);
    });

    it('rejects ambiguous names', async () => {
      await WeightClass.create({
        name: 'Dup A',
        minWeightG: 0,
        maxWeightG: 100,
        active: true,
      });
      // Insert a second doc with same case-insensitive name via collection bypass
      // if schema uniqueness ever blocks; otherwise create with identical name.
      await WeightClass.collection.insertOne({
        name: 'dup a',
        minWeightG: 0,
        maxWeightG: 200,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await resolveWeightClassForImport('Dup A');
      expect(result.ok).toBe(false);
      expect(result.message).toBe(WEIGHT_CLASS_NAME_AMBIGUOUS_MESSAGE);
    });

    it('rejects invalid ObjectId', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const result = await resolveWeightClassForImport(fakeId);
      expect(result.ok).toBe(false);
      expect(result.message).toBe(WEIGHT_CLASS_ID_INVALID_MESSAGE);
    });
  });
});
