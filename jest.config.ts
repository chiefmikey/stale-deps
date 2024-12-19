import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-node',
  extensionsToTreatAsEsm: ['.ts', '.mts', '.cts'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'test/tsconfig.test.json',
      },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(jest-snapshot-serializer-raw|@babel/runtime)/)',
  ],
  moduleDirectories: ['node_modules', 'src', 'test'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.mjs$': '$1',
    '\\.js$': '<rootDir>/src/$1',
  },
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  snapshotSerializers: ['jest-snapshot-serializer-raw'],
  globalSetup: '<rootDir>/test/setup.ts',
  globalTeardown: '<rootDir>/test/teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/test/testSetup.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.test.ts'],
  coverageDirectory: 'coverage',
  verbose: true,
};

export default config;
