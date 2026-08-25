const mongoose = require('mongoose');
const Offer = require('../../models/Offer');

describe('Offer Model Validation', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
    }
  });

  afterAll(async () => {
    // Clean up test database
    await Offer.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await Offer.deleteMany({});
  });

  describe('Text Field Validation', () => {
    it('should require text field', async () => {
      const offer = new Offer({});
      
      await expect(offer.save()).rejects.toThrow('Offer text is required');
    });

    it('should reject empty text', async () => {
      const offer = new Offer({ text: '' });
      
      await expect(offer.save()).rejects.toThrow('Offer text is required');
    });

    it('should reject text with only whitespace', async () => {
      const offer = new Offer({ 
        text: '   ',
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      await expect(offer.save()).rejects.toThrow('Offer text is required');
    });

    it('should reject text that is too short', async () => {
      const offer = new Offer({ text: 'ab' });
      
      await expect(offer.save()).rejects.toThrow('Offer text must be at least 3 characters long');
    });

    it('should reject text that is too long', async () => {
      const longText = 'a'.repeat(501);
      const offer = new Offer({ text: longText });
      
      await expect(offer.save()).rejects.toThrow('Offer text cannot exceed 500 characters');
    });

    it('should accept valid text', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      const savedOffer = await offer.save();
      expect(savedOffer.text).toBe('Valid offer text');
    });

    it('should trim whitespace from text', async () => {
      const offer = new Offer({ 
        text: '  Valid offer text  ',
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      const savedOffer = await offer.save();
      expect(savedOffer.text).toBe('Valid offer text');
    });
  });

  describe('Title Field Validation', () => {
    it('should accept valid title', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        title: 'Valid Title',
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      const savedOffer = await offer.save();
      expect(savedOffer.title).toBe('Valid Title');
    });

    it('should reject title that is too long', async () => {
      const longTitle = 'a'.repeat(101);
      const offer = new Offer({ 
        text: 'Valid offer text',
        title: longTitle,
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      await expect(offer.save()).rejects.toThrow('Offer title cannot exceed 100 characters');
    });

    it('should auto-generate title from text if not provided', async () => {
      const offer = new Offer({ 
        text: 'This is a valid offer text that is longer than 50 characters',
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      const savedOffer = await offer.save();
      expect(savedOffer.title).toBe('This is a valid offer text that is longer than ...');
    });
  });

  describe('Priority Field Validation', () => {
    it('should accept valid priority', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        priority: 50,
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      const savedOffer = await offer.save();
      expect(savedOffer.priority).toBe(50);
    });

    it('should reject negative priority', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        priority: -1,
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      await expect(offer.save()).rejects.toThrow('Priority cannot be negative');
    });

    it('should reject priority over 100', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        priority: 101,
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      await expect(offer.save()).rejects.toThrow('Priority cannot exceed 100');
    });
  });

  describe('Type Field Validation', () => {
    it('should accept valid offer types', async () => {
      const validTypes = ['discount', 'promotion', 'announcement', 'feature', 'other'];
      
      for (const type of validTypes) {
        const offer = new Offer({ 
          text: 'Valid offer text',
          type: type,
          metadata: { createdBy: new mongoose.Types.ObjectId() }
        });
        
        const savedOffer = await offer.save();
        expect(savedOffer.type).toBe(type);
        await Offer.deleteOne({ _id: savedOffer._id });
      }
    });

    it('should reject invalid offer type', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        type: 'invalid_type',
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      await expect(offer.save()).rejects.toThrow('Offer type must be one of: discount, promotion, announcement, feature, other');
    });
  });

  describe('Date Validation', () => {
    it('should accept valid date range', async () => {
      const validFrom = new Date();
      const validTo = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      
      const offer = new Offer({ 
        text: 'Valid offer text',
        validFrom: validFrom,
        validTo: validTo,
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      const savedOffer = await offer.save();
      expect(savedOffer.validFrom).toEqual(validFrom);
      expect(savedOffer.validTo).toEqual(validTo);
    });

    it('should reject validTo before validFrom', async () => {
      const validFrom = new Date();
      const validTo = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      
      const offer = new Offer({ 
        text: 'Valid offer text',
        validFrom: validFrom,
        validTo: validTo,
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      await expect(offer.save()).rejects.toThrow('Valid to date must be after valid from date');
    });
  });

  describe('Target Audience Validation', () => {
    it('should accept valid target audiences', async () => {
      const validAudiences = ['all', 'new_customers', 'existing_customers', 'vip_customers'];
      
      for (const audience of validAudiences) {
        const offer = new Offer({ 
          text: 'Valid offer text',
          targetAudience: audience,
          metadata: { createdBy: new mongoose.Types.ObjectId() }
        });
        
        const savedOffer = await offer.save();
        expect(savedOffer.targetAudience).toBe(audience);
        await Offer.deleteOne({ _id: savedOffer._id });
      }
    });

    it('should reject invalid target audience', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        targetAudience: 'invalid_audience',
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      await expect(offer.save()).rejects.toThrow('Target audience must be one of: all, new_customers, existing_customers, vip_customers');
    });
  });

  describe('Metadata Validation', () => {
    it('should require createdBy field', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        metadata: {}
      });
      
      await expect(offer.save()).rejects.toThrow('Path `metadata.createdBy` is required');
    });

    it('should accept valid metadata', async () => {
      const createdBy = new mongoose.Types.ObjectId();
      const offer = new Offer({ 
        text: 'Valid offer text',
        metadata: { 
          createdBy: createdBy,
          tags: ['tag1', 'tag2'],
          viewCount: 10,
          clickCount: 5
        }
      });
      
      const savedOffer = await offer.save();
      expect(savedOffer.metadata.createdBy).toEqual(createdBy);
      expect(savedOffer.metadata.tags).toEqual(['tag1', 'tag2']);
      expect(savedOffer.metadata.viewCount).toBe(10);
      expect(savedOffer.metadata.clickCount).toBe(5);
    });

    it('should reject negative view count', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        metadata: { 
          createdBy: new mongoose.Types.ObjectId(),
          viewCount: -1
        }
      });
      
      await expect(offer.save()).rejects.toThrow('View count cannot be negative');
    });

    it('should reject negative click count', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        metadata: { 
          createdBy: new mongoose.Types.ObjectId(),
          clickCount: -1
        }
      });
      
      await expect(offer.save()).rejects.toThrow('Click count cannot be negative');
    });
  });

  describe('Virtual Properties', () => {
    it('should correctly identify currently valid offers', async () => {
      const now = new Date();
      const validOffer = new Offer({ 
        text: 'Valid offer text',
        isActive: true,
        validFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Yesterday
        validTo: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Tomorrow
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      const savedOffer = await validOffer.save();
      expect(savedOffer.isCurrentlyValid).toBe(true);
    });

    it('should correctly identify currently invalid offers', async () => {
      const now = new Date();
      const invalidOffer = new Offer({ 
        text: 'Invalid offer text',
        isActive: false,
        validFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Yesterday
        validTo: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Tomorrow
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      const savedOffer = await invalidOffer.save();
      expect(savedOffer.isCurrentlyValid).toBe(false);
    });
  });

  describe('Instance Methods', () => {
    it('should check validity for specific date', async () => {
      const now = new Date();
      const offer = new Offer({ 
        text: 'Valid offer text',
        isActive: true,
        validFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Yesterday
        validTo: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Tomorrow
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      
      const savedOffer = await offer.save();
      
      // Should be valid for today
      expect(savedOffer.isValidForDate(now)).toBe(true);
      
      // Should be invalid for next week
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      expect(savedOffer.isValidForDate(nextWeek)).toBe(false);
    });

    it('should increment view count', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        metadata: { 
          createdBy: new mongoose.Types.ObjectId(),
          viewCount: 5
        }
      });
      
      const savedOffer = await offer.save();
      await savedOffer.incrementViewCount();
      
      const updatedOffer = await Offer.findById(savedOffer._id);
      expect(updatedOffer.metadata.viewCount).toBe(6);
    });

    it('should increment click count', async () => {
      const offer = new Offer({ 
        text: 'Valid offer text',
        metadata: { 
          createdBy: new mongoose.Types.ObjectId(),
          clickCount: 3
        }
      });
      
      const savedOffer = await offer.save();
      await savedOffer.incrementClickCount();
      
      const updatedOffer = await Offer.findById(savedOffer._id);
      expect(updatedOffer.metadata.clickCount).toBe(4);
    });
  });

  describe('Static Methods', () => {
    it('should get active offers', async () => {
      const now = new Date();
      
      // Create active offer
      const activeOffer = new Offer({ 
        text: 'Active offer text',
        isActive: true,
        validFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        validTo: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      await activeOffer.save();
      
      // Create inactive offer
      const inactiveOffer = new Offer({ 
        text: 'Inactive offer text',
        isActive: false,
        validFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        validTo: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        metadata: { createdBy: new mongoose.Types.ObjectId() }
      });
      await inactiveOffer.save();
      
      const activeOffers = await Offer.getActiveOffers();
      expect(activeOffers).toHaveLength(1);
      expect(activeOffers[0].text).toBe('Active offer text');
    });
  });
});
