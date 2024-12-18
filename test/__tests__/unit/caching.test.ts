import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { analyzeDependencies } from '../../analyzer';
import { mockProjectRoot } from '../setup/setup';

describe('caching Behavior', () => {
  beforeEach(async () => {
    await fs.rm(mockProjectRoot, { recursive: true, force: true });
    await fs.mkdir(mockProjectRoot, { recursive: true });
  });

  it('should cache package resolutions', async () => {
    expect.hasAssertions();

    // First run to populate cache
    const start1 = performance.now();
    await analyzeDependencies(mockProjectRoot);
    const duration1 = performance.now() - start1;

    // Second run should be faster due to caching
    const start2 = performance.now();
    await analyzeDependencies(mockProjectRoot);
    const duration2 = performance.now() - start2;

    expect(duration2).toBeLessThan(duration1 * 0.5);
  });

  it('should invalidate cache on package.json changes', async () => {
    expect.hasAssertions();

    // First analysis
    await analyzeDependencies(mockProjectRoot);

    // Modify package.json
    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: { 'new-dep': '1.0.0' },
      }),
    );

    // Second analysis should take similar time to first
    const start = performance.now();
    const results = await analyzeDependencies(mockProjectRoot);
    const duration = performance.now() - start;

    expect(results.cacheStatus).toBe('invalidated');
    expect(duration).toBeGreaterThan(100); // Assuming cache hit would be < 100ms
  });

  it('should handle concurrent cache access', async () => {
    expect.hasAssertions();

    const concurrentAnalyses = Promise.all(
      Array.from({ length: 5 }, async () =>
        analyzeDependencies(mockProjectRoot),
      ),
    );

    const results = await concurrentAnalyses;
    const cacheHits = results.filter((r) => r.cacheStatus === 'hit').length;

    expect(cacheHits).toBeGreaterThanOrEqual(3); // At least 3 should hit cache
  });

  it('should respect cache size limits', async () => {
    expect.hasAssertions();

    // Create many test files to exceed cache limit
    await Promise.all(
      Array.from({ length: 1000 }, async (_, index) =>
        fs.writeFile(
          path.join(mockProjectRoot, `test${index}.ts`),
          `import { something${index} } from 'dep${index}';`,
        ),
      ),
    );

    const results = await analyzeDependencies(mockProjectRoot, {
      cacheSize: '10mb',
    });

    expect(results.warnings).toContainEqual(
      expect.objectContaining({ type: 'CacheSizeExceeded' }),
    );
  });

  it('should persist cache between sessions', async () => {
    expect.hasAssertions();

    // First session
    await analyzeDependencies(mockProjectRoot, { persistCache: true });

    // Simulate new session by clearing runtime cache
    await analyzeDependencies(mockProjectRoot, { clearRuntimeCache: true });

    // Second session should still hit disk cache
    const start = performance.now();
    const results = await analyzeDependencies(mockProjectRoot);
    const duration = performance.now() - start;

    expect(results.cacheStatus).toBe('hit');
    expect(duration).toBeLessThan(100);
  });

  it('should handle cache corruption', async () => {
    expect.hasAssertions();

    // Create corrupted cache file
    await fs.writeFile(
      path.join(mockProjectRoot, '.deps-cache'),
      'corrupted{data',
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.cacheStatus).toBe('rebuilt');
    expect(results.warnings).toContainEqual(
      expect.objectContaining({ type: 'CacheCorrupted' }),
    );
  });

  it('should handle cache version mismatches', async () => {
    expect.hasAssertions();

    // Write cache with old version
    await fs.writeFile(
      path.join(mockProjectRoot, '.deps-cache'),
      JSON.stringify({ version: '0.0.1', data: {} }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.cacheStatus).toBe('version_mismatch');
    expect(results.warnings).toContainEqual(
      expect.objectContaining({ type: 'CacheVersionMismatch' }),
    );
  });
});
