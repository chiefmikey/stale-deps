export default {
  projects: ['<rootDir>/jest.config.unit.ts', '<rootDir>/jest.config.e2e.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', 'setup.ts$'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  preset: 'ts-jest/presets/default-esm',
  transformIgnorePatterns: [
    'node_modules/(?!chalk|find-up|p-locate|locate-path|path-exists|globby|@nodelib|p-limit|p-try|yaml)/',
  ],
};
