import fs from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { analyzeDependencies } from '../../analyzer';
import { mockProjectRoot } from '../../setup';

describe('package Manager Features', () => {
  beforeEach(async () => {
    await fs.rm(mockProjectRoot, { recursive: true, force: true });
    await fs.mkdir(mockProjectRoot, { recursive: true });
  });

  it('should handle pnpm workspace syntax', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'pnpm-workspace.yaml'),
      'packages:\n  - "packages/*"',
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.workspaceType).toBe('pnpm');
  });

  it('should parse yarn berry version resolutions', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        packageManager: 'yarn@3.0.0',
        resolutions: {
          'debug@^4.1.0': 'patch:debug@npm:4.1.0#./.yarn/patches/debug.patch',
        },
      }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.resolvedDependencies).toHaveProperty('debug');
  });

  it('should handle npm overrides', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        overrides: {
          'tough-cookie': '4.1.3',
        },
      }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.overriddenDependencies).toContain('tough-cookie');
  });
});

describe('version Resolution', () => {
  it('should handle semver ranges', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          'range-dep': '^1.0.0',
          'star-dep': '*',
          'tilde-dep': '~2.0.0',
        },
      }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.versionRanges).toStrictEqual(
      expect.objectContaining({
        'range-dep': '^1.0.0',
        'star-dep': '*',
      }),
    );
  });
});
