export default {
  preset: 'ts-jest/presets/default-esm',
  displayName: 'e2e',
  testEnvironment: 'node',
  testEnvironmentOptions: {
    env: {
      NODE_ENV: 'test',
    },
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '#(.*)': '<rootDir>/node_modules/$1',
    '^chalk$': '<rootDir>/src/__mocks__/chalk.ts',
    '^ora$': '<rootDir>/src/__mocks__/ora.ts',
    '^globby$': '<rootDir>/src/__mocks__/globby.ts',
    '^isbinaryfile$': '<rootDir>/src/__mocks__/isbinaryfile.ts',
    '^commander$': '<rootDir>/node_modules/commander',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  testMatch: ['**/src/__tests__/e2e.test.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/src/__tests__/setup.ts',
  ],
};
