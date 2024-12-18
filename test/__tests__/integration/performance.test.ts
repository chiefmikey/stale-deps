import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { beforeEach, describe, expect, it } from '@jest/globals';
import rewire from 'rewire';

import { analyzeDependencies } from '../../analyzer';
import { mockProjectRoot } from '../../setup';

const myModule = rewire('../../../src/index.ts');

const processFilesInParallel = myModule.__get__('processFilesInParallel');
const getPackageContext = myModule.__get__('getPackageContext');

describe('performance Metrics', () => {
  beforeEach(async () => {
    await fs.rm(mockProjectRoot, { recursive: true, force: true });
    await fs.mkdir(mockProjectRoot, { recursive: true });
  });

  it('should handle large monorepos efficiently', async () => {
    expect.hasAssertions();

    // Create mock monorepo structure
    for (let index = 0; index < 50; index++) {
      await fs.mkdir(path.join(mockProjectRoot, `package-${index}`), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(mockProjectRoot, `package-${index}/package.json`),
        JSON.stringify({
          dependencies: { [`dep-${index}`]: '1.0.0' },
        }),
      );
    }

    const start = performance.now();
    const results = await analyzeDependencies(mockProjectRoot);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    expect(results.packages.length).toBeGreaterThan(45);
  });

  it('should maintain stable memory usage with incremental updates', async () => {
    expect.hasAssertions();

    const memorySnapshots: number[] = [];

    for (let index = 0; index < 10; index++) {
      await analyzeDependencies(mockProjectRoot);
      memorySnapshots.push(process.memoryUsage().heapUsed);

      // Add a new dependency after each analysis
      await fs.writeFile(
        path.join(mockProjectRoot, 'package.json'),
        JSON.stringify({
          dependencies: { [`dep-${index}`]: '1.0.0' },
        }),
      );
    }

    // Check if memory growth is reasonable
    const memoryGrowth = memorySnapshots[9] - memorySnapshots[0];

    expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // Less than 10MB growth
  });
});

describe('performance Tests', () => {
  it('should process large projects within acceptable time', async () => {
    expect.hasAssertions();

    // Create large test project
    const files = await Promise.all(
      Array.from({ length: 1000 }, async (_, index) =>
        fs.writeFile(
          path.join(mockProjectRoot, `test${index}.ts`),
          `import { something } from 'test-dep';`,
        ),
      ),
    );

    const start = performance.now();
    const results = await processFilesInParallel(
      files.map((_, index) => path.join(mockProjectRoot, `test${index}.ts`)),
      'test-dep',
      await getPackageContext(path.join(mockProjectRoot, 'package.json')),
      () => {},
    );
    const end = performance.now();

    expect(end - start).toBeLessThan(30_000); // Should complete within 30 seconds
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle memory efficiently', async () => {
    expect.hasAssertions();

    const initialMemory = process.memoryUsage().heapUsed;

    // Process large number of files
    await processFilesInParallel(
      Array.from({ length: 1000 }, (_, index) =>
        path.join(mockProjectRoot, `test${index}.ts`),
      ),
      'test-dep',
      await getPackageContext(path.join(mockProjectRoot, 'package.json')),
      () => {},
    );

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

    expect(memoryIncrease).toBeLessThan(100); // Should use less than 100MB additional memory
  });

  it('should scale linearly with project size', async () => {
    expect.hasAssertions();

    const sizes = [100, 500, 1000];
    const times: number[] = [];

    for (const size of sizes) {
      await Promise.all(
        Array.from({ length: size }, async (_, index) =>
          fs.writeFile(
            path.join(mockProjectRoot, `test${index}.ts`),
            `import { something } from 'test-dep';`,
          ),
        ),
      );

      const start = performance.now();
      await processFilesInParallel(
        Array.from({ length: size }, (_, index) =>
          path.join(mockProjectRoot, `test${index}.ts`),
        ),
        'test-dep',
        await getPackageContext(path.join(mockProjectRoot, 'package.json')),
        () => {},
      );
      times.push(performance.now() - start);
    }

    // Check if processing time increases roughly linearly
    const ratios: number[] = times
      .slice(1)
      .map((time: number, index: number): number => time / times[index]);
    for (const ratio of ratios) {
      expect(ratio).toBeLessThan(2.5); // Should not increase more than 2.5x per 5x files
    }
  });

  it('should maintain performance with mixed file types', async () => {
    expect.hasAssertions();

    const fileTypes = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];
    await Promise.all(
      fileTypes.flatMap((extension, index) =>
        Array.from({ length: 100 }, async (_, index_) =>
          fs.writeFile(
            path.join(mockProjectRoot, `test${index}_${index_}${extension}`),
            `import { something } from 'test-dep';`,
          ),
        ),
      ),
    );

    const start = performance.now();
    const results = await processFilesInParallel(
      fileTypes.flatMap((extension, index) =>
        Array.from({ length: 100 }, (_, index_) =>
          path.join(mockProjectRoot, `test${index}_${index_}${extension}`),
        ),
      ),
      'test-dep',
      await getPackageContext(path.join(mockProjectRoot, 'package.json')),
      () => {},
    );
    const end = performance.now();

    expect(end - start).toBeLessThan(60_000); // Should complete within 60 seconds
    expect(results).toHaveLength(600); // 100 files * 6 types
  });

  it('should handle concurrent file processing efficiently', async () => {
    expect.hasAssertions();

    const concurrencyLevels = [1, 4, 8, 16];
    const times: number[] = [];

    for (const level of concurrencyLevels) {
      const start = performance.now();
      await processFilesInParallel(
        Array.from({ length: 100 }, (_, innerIndex) =>
          path.join(mockProjectRoot, `test${innerIndex}.ts`),
        ),
        'test-dep',
        await getPackageContext(path.join(mockProjectRoot, 'package.json')),
        () => {},
        { concurrency: level },
      );
      times.push(performance.now() - start);
    }

    // Verify that increasing concurrency improves performance up to a point
    const improvements = times
      .slice(1)
      .map((time, index) => times[index] / time);

    expect(Math.max(...improvements)).toBeGreaterThan(1);
  });

  it('should clean up resources after processing', async () => {
    expect.hasAssertions();

    // Create a temporary file to monitor
    const testFile = path.join(mockProjectRoot, 'resource-test.ts');
    await fs.writeFile(testFile, 'import { something } from "test-dep";');

    // Process the file
    await processFilesInParallel(
      [testFile],
      'test-dep',
      await getPackageContext(path.join(mockProjectRoot, 'package.json')),
      () => {},
    );

    // Allow time for any file handles to be released
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify we can delete the file (which would fail if handles were still open)
    await expect(fs.unlink(testFile)).resolves.not.toThrow();
  });
});

describe('memory Leaks', () => {
  it('should not leak memory during long runs', async () => {
    expect.hasAssertions();

    const initialMemory = process.memoryUsage();
    const iterations = 10;

    for (let index = 0; index < iterations; index++) {
      await processFilesInParallel(
        Array.from({ length: 100 }, (_, innerIndex) =>
          path.join(mockProjectRoot, `test${innerIndex}.ts`),
        ),
        'test-dep',
        await getPackageContext(path.join(mockProjectRoot, 'package.json')),
        () => {},
      );
    }

    const finalMemory = process.memoryUsage();

    // Should not increase by more than 10% over iterations
    expect(finalMemory.heapUsed / initialMemory.heapUsed).toBeLessThan(1.1);
  });
});

describe('stress Tests', () => {
  const createNestedDeps = (depth: number): Record<string, any> => {
    const deps: Record<string, any> = {};
    for (let index = 0; index < 10; index++) {
      deps[`dep-${depth}-${index}`] =
        depth > 0 ? createNestedDeps(depth - 1) : '1.0.0';
    }
    return deps;
  };

  it('should handle extremely large dependency trees', async () => {
    expect.hasAssertions();

    // Create deep dependency tree
    const nestedDeps = createNestedDeps(5);

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({ dependencies: nestedDeps }),
    );

    const start = performance.now();
    await processFilesInParallel(
      [path.join(mockProjectRoot, 'package.json')],
      'test-dep',
      await getPackageContext(path.join(mockProjectRoot, 'package.json')),
      () => {},
    );
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(60_000); // Should complete within 60 seconds
  });
});
