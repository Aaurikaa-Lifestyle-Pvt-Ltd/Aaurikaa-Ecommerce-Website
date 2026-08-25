const express = require('express');
const request = require('supertest');
const {
  validateInput,
  VALIDATION_RULES,
} = require('../../middleware/validation');
const { sendErrorResponse, HTTP_STATUS, ERROR_CODES } = require('../../utils/errorHandler');

function createValidationApp(rule) {
  const app = express();
  app.use(express.json());
  app.post('/test', validateInput(rule), (req, res) => {
    res.json({ success: true, data: req.body });
  });
  app.use((err, req, res, next) => {
    if (err.name === 'ValidationError') {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: [err.message] }
      );
    }
    next(err);
  });
  return app;
}

describe('Taxonomy validation rules (Phase C)', () => {
  describe('category create', () => {
    const app = createValidationApp(VALIDATION_RULES.category);

    it('accepts optional title, description, and faq', async () => {
      const response = await request(app)
        .post('/test')
        .send({
          name: 'Electronics',
          title: 'Shop Electronics',
          description: 'A'.repeat(600),
          faq: JSON.stringify([{ question: 'Q?', answer: 'A.' }]),
        })
        .expect(200);

      expect(response.body.data.title).toBe('Shop Electronics');
      expect(response.body.data.faq).toContain('Q?');
    });

    it('rejects invalid faq payload', async () => {
      const response = await request(app)
        .post('/test')
        .send({
          name: 'Electronics',
          faq: 'not-json-array',
        })
        .expect(400);

      expect(response.body.details.errors).toContain('Invalid faq format');
    });
  });

  describe('categoryUpdate', () => {
    const app = createValidationApp(VALIDATION_RULES.categoryUpdate);

    it('accepts legacy-only update payloads without name', async () => {
      const response = await request(app)
        .post('/test')
        .send({ taxRate: 18, showInMegaMenu: true })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('rejects title that exceeds max length', async () => {
      const response = await request(app)
        .post('/test')
        .send({ title: 'A'.repeat(201) })
        .expect(400);

      expect(response.body.details.errors).toContain('Invalid title format');
    });
  });

  describe('subcategory create/update', () => {
    const createApp = createValidationApp(VALIDATION_RULES.subcategory);
    const updateApp = createValidationApp(VALIDATION_RULES.subcategoryUpdate);

    it('requires name on create', async () => {
      const response = await request(createApp)
        .post('/test')
        .send({ title: 'Phones' })
        .expect(400);

      expect(response.body.details.errors).toContain('Missing required fields: name');
    });

    it('accepts optional fields on create', async () => {
      const response = await request(createApp)
        .post('/test')
        .send({
          name: 'Phones',
          title: 'Mobile Phones',
          description: 'Long form text',
          faq: '[]',
        })
        .expect(200);

      expect(response.body.data.name).toBe('Phones');
    });

    it('accepts partial update without name', async () => {
      const response = await request(updateApp)
        .post('/test')
        .send({ description: 'Updated copy' })
        .expect(200);

      expect(response.body.data.description).toBe('Updated copy');
    });
  });

  describe('childCategory create/update', () => {
    const createApp = createValidationApp(VALIDATION_RULES.childCategory);
    const updateApp = createValidationApp(VALIDATION_RULES.childCategoryUpdate);

    it('accepts optional fields on create', async () => {
      const response = await request(createApp)
        .post('/test')
        .send({
          name: 'Android',
          title: 'Android Devices',
          faq: JSON.stringify([{ question: 'OS?', answer: 'Android' }]),
        })
        .expect(200);

      expect(response.body.data.title).toBe('Android Devices');
    });

    it('rejects invalid faq on update', async () => {
      const response = await request(updateApp)
        .post('/test')
        .send({ faq: '{bad-json' })
        .expect(400);

      expect(response.body.details.errors).toContain('Invalid faq format');
    });
  });
});
