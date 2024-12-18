import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@?jest-snapshot-serializer-raw)/.*)',
  ],
  moduleDirectories: ['node_modules', 'src', 'test'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  snapshotSerializers: ['jest-snapshot-serializer-raw'],
};

export default config;
