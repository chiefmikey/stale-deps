import { beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import type { AnalysisResult } from './types';
import { createMockProject, setupTestProject } from './setup';
import teardown from './teardown';
import * as traverseModule from '@babel/traverse';

// Ensure traverse is available globally
global.traverse = traverseModule.default || traverseModule;

// Mock module imports that might cause issues in tests
jest.mock('@babel/traverse', () => {
  const actual = jest.requireActual('@babel/traverse');
  return {
    ...(typeof actual === 'object' ? actual : {}),
    __esModule: true,
    default: (actual as any).default || actual,
  };
});

// Mock console to keep test output clean
const mockConsole = () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
};

// Initialize test environment
beforeAll(async () => {
  mockConsole();
  await createMockProject();
});

// Reset test state before each test
beforeEach(async () => {
  jest.clearAllMocks();
  await setupTestProject();
});

// Clean up after all tests
afterAll(async () => {
  jest.restoreAllMocks();
  await teardown();
});

// Set test timeout
jest.setTimeout(30000);

// Add custom matchers
expect.extend({
  toBeValidDependency(received: string) {
    const validDependencyRegex =
      /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
    const pass = validDependencyRegex.test(received);
    return {
      pass,
      message: () =>
        `expected ${received} to be${pass ? ' not' : ''} a valid dependency name`,
    };
  },

  toBeValidPackageVersion(received: string) {
    const semverRegex =
      /^(\^|~|>=|<=|>|<|=)?\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
    const pass = semverRegex.test(received);
    return {
      pass,
      message: () =>
        `expected ${received} to be${pass ? ' not' : ''} a valid semver version`,
    };
  },

  toHaveAnalysisWarning(result: AnalysisResult, type: string) {
    const pass = result.warnings.some((warning) => warning.type === type);
    return {
      pass,
      message: () =>
        `expected analysis ${pass ? 'not ' : ''}to have warning of type "${type}"`,
    };
  },

  toHaveAnalysisError(result: AnalysisResult, type: string) {
    const pass = result.errors.some((error) => error.type === type);
    return {
      pass,
      message: () =>
        `expected analysis ${pass ? 'not ' : ''}to have error of type "${type}"`,
    };
  },
});

// Declare custom matcher types
declare global {
  // Add traverse to global scope
  var traverse: typeof traverseModule.default;

  namespace jest {
    interface Matchers<R> {
      toBeValidDependency(): R;
      toBeValidPackageVersion(): R;
      toHaveAnalysisWarning(type: string): R;
      toHaveAnalysisError(type: string): R;
    }
  }
}
