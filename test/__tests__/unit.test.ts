import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { findUp } from 'find-up';
import ora from 'ora';

import {
  getSourceFiles,
  getDependencies,
  findClosestPackageJson,
} from '../../src/utils.js';

// Mock modules
jest.mock('chalk');
jest.mock('globby');
jest.mock('isbinaryfile');
jest.mock('ora');
jest.mock('node:fs/promises');
jest.mock('find-up');

// Mock findUp to return our fake package.json path
jest.mocked(findUp).mockResolvedValue('/fake/path/package.json');

const oraMock = jest.mocked(ora);

describe('getSourceFiles', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  afterEach(async () => {
    await jest.clearAllMocks();
  });

  afterAll(async () => {
    await jest.restoreAllMocks();
  });

  it('should return an array of file paths', async () => {
    expect.hasAssertions();

    const files = await getSourceFiles(process.cwd());

    // Wait for all promises to resolve
    await new Promise(process.nextTick);

    expect(Array.isArray(files)).toBe(true);
    expect(files).toHaveLength(2);
    expect(files).toStrictEqual([
      '/fake/path/src/index.ts',
      '/fake/path/src/utils.ts',
    ]);
  });

  it('should not check for spinner in getDependencies', () => {
    getDependencies('/fake/path/package.json');
  });
});

describe('depsweep', () => {
  it('exports required functions', () => {
    expect(findClosestPackageJson).toBeDefined();
    expect(getDependencies).toBeDefined();
    expect(getSourceFiles).toBeDefined();
  });
});
