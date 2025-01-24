export default {
  preset: 'ts-jest/presets/default-esm',
  displayName: 'unit',
  testEnvironment: 'node',
  testMatch: ['**/test/__tests__/unit.test.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/test/__tests__/setup.ts',
  ],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^chalk$': '<rootDir>/test/__mocks__/chalk.ts',
    '^ora$': '<rootDir>/test/__mocks__/ora.ts',
    '^globby$': '<rootDir>/test/__mocks__/globby.ts',
    '^isbinaryfile$': '<rootDir>/test/__mocks__/isbinaryfile.ts',
    '^find-up$': '<rootDir>/test/__mocks__/find-up.ts', // Ensures find-up uses the mock
    '^fs/promises$': '<rootDir>/test/__mocks__/fs/promises.ts',
    '^node:fs/promises$': '<rootDir>/test/__mocks__/fs/promises.ts', // Ensures node:fs/promises uses the mock
    '#(.*)': '<rootDir>/node_modules/$1',
    // Add any additional module mappings here
  },
  setupFilesAfterEnv: ['<rootDir>/test/__tests__/setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'bundler',
        },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!chalk|find-up|p-locate|locate-path|path-exists|globby|@nodelib|p-limit|p-try|yaml)/',
  ],
};
