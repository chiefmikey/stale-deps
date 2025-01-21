import { jest } from '@jest/globals';

// Set testEnvironment to node
process.env.NODE_ENV = 'test';

// Ensure cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Mock process.exit to prevent exiting during tests
const mockExit = jest
  .spyOn(process, 'exit')
  .mockImplementation((code?: string | number | null | undefined) => {
    return undefined as never; // Type assertion to satisfy 'never' return type
  });

// Suppress console errors during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

// Optionally, you can restore the original process.exit after all tests
afterAll(() => {
  mockExit.mockRestore();
});
