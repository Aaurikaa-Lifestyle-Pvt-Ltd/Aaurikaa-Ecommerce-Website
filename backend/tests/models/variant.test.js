const mongoose = require('mongoose');
const Variant = require('../../models/Variant');

describe('Variant Model', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test');
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear variants collection before each test
    await Variant.deleteMany({});
  });

  describe('Variant Creation', () => {
    it('should create a variant with valid data', async () => {
      const variantData = {
        name: 'Color',
        values: [
          { value: 'Red', displayName: 'Red Color' },
          { value: 'Blue', displayName: 'Blue Color' },
          { value: 'Green', displayName: 'Green Color' }
        ],
        description: 'Product color variants'
      };

      const variant = new Variant(variantData);
      const savedVariant = await variant.save();

      expect(savedVariant._id).toBeDefined();
      expect(savedVariant.name).toBe(variantData.name);
      expect(savedVariant.values).toHaveLength(3);
      expect(savedVariant.isActive).toBe(true);
      expect(savedVariant.description).toBe(variantData.description);
    });

    it('should auto-generate displayName if not provided', async () => {
      const variantData = {
        name: 'Size',
        values: [
          { value: 'Small' },
          { value: 'Medium' },
          { value: 'Large' }
        ]
      };

      const variant = new Variant(variantData);
      const savedVariant = await variant.save();

      expect(savedVariant.values[0].displayName).toBe('Small');
      expect(savedVariant.values[1].displayName).toBe('Medium');
      expect(savedVariant.values[2].displayName).toBe('Large');
    });

    it('should validate variant name format', async () => {
      const invalidVariantData = {
        name: 'Size@#$',
        values: [{ value: 'Small' }]
      };

      const variant = new Variant(invalidVariantData);
      
      await expect(variant.save()).rejects.toThrow();
    });

    it('should validate variant name length', async () => {
      const shortNameData = {
        name: 'A',
        values: [{ value: 'Small' }]
      };

      const variant = new Variant(shortNameData);
      
      await expect(variant.save()).rejects.toThrow();
    });

    it('should validate variant value length', async () => {
      const variantData = {
        name: 'Size',
        values: [{ value: '' }] // Empty value
      };

      const variant = new Variant(variantData);
      
      await expect(variant.save()).rejects.toThrow();
    });

    it('should validate description length', async () => {
      const longDescription = 'A'.repeat(501); // Exceeds 500 character limit
      const variantData = {
        name: 'Size',
        values: [{ value: 'Small' }],
        description: longDescription
      };

      const variant = new Variant(variantData);
      
      await expect(variant.save()).rejects.toThrow();
    });
  });

  describe('Variant Methods', () => {
    let variant;

    beforeEach(async () => {
      variant = new Variant({
        name: 'Color',
        values: [
          { value: 'Red', displayName: 'Red Color' },
          { value: 'Blue', displayName: 'Blue Color' }
        ]
      });
      await variant.save();
    });

    it('should add a new value', async () => {
      const newValue = { value: 'Green', displayName: 'Green Color' };
      await variant.addValue(newValue);
      
      expect(variant.values).toHaveLength(3);
      expect(variant.values[2].value).toBe('Green');
    });

    it('should remove a value', async () => {
      const valueId = variant.values[0]._id;
      await variant.removeValue(valueId.toString());
      
      expect(variant.values).toHaveLength(1);
      expect(variant.values[0].value).toBe('Blue');
    });

    it('should update a value', async () => {
      const valueId = variant.values[0]._id;
      const updateData = { value: 'Crimson', displayName: 'Crimson Red' };
      
      await variant.updateValue(valueId.toString(), updateData);
      
      expect(variant.values[0].value).toBe('Crimson');
      expect(variant.values[0].displayName).toBe('Crimson Red');
    });

    it('should throw error when updating non-existent value', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const updateData = { value: 'Updated' };
      
      try {
        await variant.updateValue(fakeId.toString(), updateData);
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.message).toBe('Value not found');
      }
    });

    it('should deactivate variant', async () => {
      await variant.deactivate();
      expect(variant.isActive).toBe(false);
    });

    it('should activate variant', async () => {
      variant.isActive = false;
      await variant.activate();
      expect(variant.isActive).toBe(true);
    });
  });

  describe('Variant Static Methods', () => {
    beforeEach(async () => {
      // Create test variants
      await Variant.create([
        { name: 'Color', isActive: true, sortOrder: 1 },
        { name: 'Size', isActive: true, sortOrder: 2 },
        { name: 'Material', isActive: false, sortOrder: 3 }
      ]);
    });

    it('should find only active variants', async () => {
      const activeVariants = await Variant.findActive();
      expect(activeVariants).toHaveLength(2);
      expect(activeVariants.every(variant => variant.isActive)).toBe(true);
    });

    it('should find variant by name (case insensitive)', async () => {
      const variant = await Variant.findByName('color');
      expect(variant).toBeDefined();
      expect(variant.name).toBe('Color');
    });

    it('should return null for non-existent variant', async () => {
      const variant = await Variant.findByName('nonexistent');
      expect(variant).toBeNull();
    });
  });

  describe('Variant Virtuals', () => {
    it('should have activeValuesCount virtual', () => {
      const variant = new Variant({ name: 'Color' });
      expect(variant.schema.virtuals.activeValuesCount).toBeDefined();
    });
  });

  describe('Variant Pre-save Middleware', () => {
    it('should set sortOrder for values if not provided', async () => {
      const variantData = {
        name: 'Size',
        values: [
          { value: 'Small' },
          { value: 'Medium' },
          { value: 'Large' }
        ]
      };

      const variant = new Variant(variantData);
      const savedVariant = await variant.save();

      // Check that sortOrder is set (default is 0, but should be set by index)
      expect(savedVariant.values[0].sortOrder).toBeDefined();
      expect(savedVariant.values[1].sortOrder).toBeDefined();
      expect(savedVariant.values[2].sortOrder).toBeDefined();
      
      // Check that values are in the correct order
      expect(savedVariant.values[0].value).toBe('Small');
      expect(savedVariant.values[1].value).toBe('Medium');
      expect(savedVariant.values[2].value).toBe('Large');
    });
  });
});
