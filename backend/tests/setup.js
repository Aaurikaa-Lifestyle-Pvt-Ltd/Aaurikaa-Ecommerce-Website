// Test setup file
const mongoose = require('mongoose');

// Mock mongoose connection
beforeAll(async () => {
  // Use in-memory database for tests
  const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-blog-db';
  
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (error) {
    console.log('Using mock database for tests');
  }
});

afterAll(async () => {
  // Clean up database connection
  try {
    await mongoose.connection.close();
  } catch (error) {
    console.log('Mock database cleanup');
  }
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
