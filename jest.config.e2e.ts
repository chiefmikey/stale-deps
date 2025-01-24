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
    '^chalk$': '<rootDir>/test/__mocks__/chalk.ts',
    '^ora$': '<rootDir>/test/__mocks__/ora.ts',
    '^globby$': '<rootDir>/test/__mocks__/globby.ts',
    '^isbinaryfile$': '<rootDir>/test/__mocks__/isbinaryfile.ts',
    '^commander$': '<rootDir>/node_modules/commander',
  },
  setupFilesAfterEnv: ['<rootDir>/test/__tests__/setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  testMatch: ['**/test/__tests__/e2e.test.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/test/__tests__/setup.ts',
  ],
};
