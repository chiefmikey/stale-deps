import fs from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { analyzeDependencies } from '../../analyzer';
import { mockProjectRoot } from '../../setup';

describe('advanced Scenarios', () => {
  beforeEach(async () => {
    await fs.rm(mockProjectRoot, { recursive: true, force: true });
    await fs.mkdir(mockProjectRoot, { recursive: true });
  });

  it('should detect circular dependencies', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          'pkg-a': '1.0.0',
          'pkg-b': '1.0.0',
        },
      }),
    );

    // Create mock node_modules with circular deps
    await fs.mkdir(path.join(mockProjectRoot, 'node_modules/pkg-a'), {
      recursive: true,
    });
    await fs.mkdir(path.join(mockProjectRoot, 'node_modules/pkg-b'), {
      recursive: true,
    });

    await fs.writeFile(
      path.join(mockProjectRoot, 'node_modules/pkg-a/package.json'),
      JSON.stringify({ dependencies: { 'pkg-b': '1.0.0' } }),
    );

    await fs.writeFile(
      path.join(mockProjectRoot, 'node_modules/pkg-b/package.json'),
      JSON.stringify({ dependencies: { 'pkg-a': '1.0.0' } }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.warnings).toContainEqual(
      expect.objectContaining({ type: 'CircularDependency' }),
    );
  });

  it('should handle peer dependency conflicts', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          'pkg-with-peer': '1.0.0',
          'peer-dep': '2.0.0',
        },
      }),
    );

    await fs.mkdir(path.join(mockProjectRoot, 'node_modules/pkg-with-peer'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(mockProjectRoot, 'node_modules/pkg-with-peer/package.json'),
      JSON.stringify({
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.errors).toContainEqual(
      expect.objectContaining({ type: 'PeerDependencyConflict' }),
    );
  });

  it('should track memory usage during analysis', async () => {
    expect.hasAssertions();

    const initialMemory = process.memoryUsage().heapUsed;
    await analyzeDependencies(mockProjectRoot);
    const finalMemory = process.memoryUsage().heapUsed;

    // Allow for some memory overhead but flag if it's excessive
    expect(finalMemory - initialMemory).toBeLessThan(50 * 1024 * 1024); // 50MB
  });
});
