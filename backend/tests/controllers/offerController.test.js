const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const Offer = require('../../models/Offer');

// Create test app with offer routes (bypassing authentication for testing)
const app = express();
app.use(express.json());

// Test-specific offer routes without authentication
app.get('/api/admin/offers', async (req, res) => {
  try {
    const offers = await Offer.find().sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    console.error("Offer GET error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post('/api/admin/offers', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Offer text required" });

    const newOffer = new Offer({ text });
    await newOffer.save();

    res.status(201).json({ message: "Offer added successfully" });
  } catch (err) {
    console.error("Offer POST error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete('/api/admin/offers/:id', async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.json({ message: "Offer deleted" });
  } catch (err) {
    console.error("Offer DELETE error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

describe('Offer Management', () => {
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

  describe('GET /api/admin/offers', () => {
    it('should get all offers', async () => {
      // Create test offers
      const testOffers = [
        { text: 'Test Offer 1' },
        { text: 'Test Offer 2' }
      ];
      await Offer.insertMany(testOffers);

      const response = await request(app)
        .get('/api/admin/offers')
        .expect(200);

      expect(response.body).toHaveLength(2);
      // Since offers are sorted by createdAt: -1 (newest first), the order is reversed
      expect(response.body[0].text).toBe('Test Offer 2');
      expect(response.body[1].text).toBe('Test Offer 1');
    });

    it('should return empty array when no offers exist', async () => {
      const response = await request(app)
        .get('/api/admin/offers')
        .expect(200);

      expect(response.body).toHaveLength(0);
    });
  });

  describe('POST /api/admin/offers', () => {
    it('should create a new offer', async () => {
      const offerData = { text: 'New Test Offer' };

      const response = await request(app)
        .post('/api/admin/offers')
        .send(offerData)
        .expect(201);

      expect(response.body.message).toBe('Offer added successfully');

      // Verify offer was created in database
      const offers = await Offer.find();
      expect(offers).toHaveLength(1);
      expect(offers[0].text).toBe('New Test Offer');
    });

    it('should reject offer without text', async () => {
      const response = await request(app)
        .post('/api/admin/offers')
        .send({})
        .expect(400);

      expect(response.body.message).toBe('Offer text required');
    });

    it('should reject empty text', async () => {
      const response = await request(app)
        .post('/api/admin/offers')
        .send({ text: '' })
        .expect(400);

      expect(response.body.message).toBe('Offer text required');
    });
  });

  describe('DELETE /api/admin/offers/:id', () => {
    it('should delete an offer by id', async () => {
      // Create test offer
      const testOffer = new Offer({ text: 'Test Offer to Delete' });
      await testOffer.save();

      const response = await request(app)
        .delete(`/api/admin/offers/${testOffer._id}`)
        .expect(200);

      expect(response.body.message).toBe('Offer deleted');

      // Verify offer was deleted from database
      const offers = await Offer.find();
      expect(offers).toHaveLength(0);
    });

    it('should handle deletion of non-existent offer', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/api/admin/offers/${nonExistentId}`)
        .expect(200);

      expect(response.body.message).toBe('Offer deleted');
    });

    it('should handle invalid id format', async () => {
      const response = await request(app)
        .delete('/api/admin/offers/invalid-id')
        .expect(500);

      expect(response.body.message).toBe('Server error');
    });
  });

  describe('Frontend Integration', () => {
    it('should handle complete offer workflow', async () => {
      // 1. Create offer
      const createResponse = await request(app)
        .post('/api/admin/offers')
        .send({ text: 'Complete Workflow Test' })
        .expect(201);

      expect(createResponse.body.message).toBe('Offer added successfully');

      // 2. Get all offers
      const getResponse = await request(app)
        .get('/api/admin/offers')
        .expect(200);

      expect(getResponse.body).toHaveLength(1);
      const createdOffer = getResponse.body[0];

      // 3. Delete offer
      const deleteResponse = await request(app)
        .delete(`/api/admin/offers/${createdOffer._id}`)
        .expect(200);

      expect(deleteResponse.body.message).toBe('Offer deleted');

      // 4. Verify deletion
      const finalGetResponse = await request(app)
        .get('/api/admin/offers')
        .expect(200);

      expect(finalGetResponse.body).toHaveLength(0);
    });
  });
});
