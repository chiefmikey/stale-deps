import { jest } from '@jest/globals';

// Set testEnvironment to node
process.env.NODE_ENV = 'test';

// Ensure cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});
