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

// Mock modules
jest.mock('chalk');
jest.mock('globby');
jest.mock('isbinaryfile');
jest.mock('ora');
jest.mock('fs/promises');
jest.mock('find-up');

// Mock findUp to return our fake package.json path
jest.mocked(findUp).mockResolvedValue('/fake/path/package.json');

import { getSourceFiles } from '../index';

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
    expect(files).toEqual([
      '/fake/path/src/index.ts',
      '/fake/path/src/utils.ts',
    ]);
  });
});
