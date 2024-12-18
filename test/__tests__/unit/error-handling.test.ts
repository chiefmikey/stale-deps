import fs from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { analyzeDependencies } from '../../analyzer';
import { mockProjectRoot } from '../../setup';

describe('error Handling', () => {
  beforeEach(async () => {
    // Clean up mock project between tests
    await fs.rm(mockProjectRoot, { recursive: true, force: true });
    await fs.mkdir(mockProjectRoot, { recursive: true });
  });

  it('should handle invalid package version formats', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          'invalid-version': 'not.a.version',
        },
      }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.errors).toContainEqual(
      expect.objectContaining({ type: 'InvalidVersion' }),
    );
  });

  it('should handle broken symlinks', async () => {
    expect.hasAssertions();

    await fs.symlink(
      path.join(mockProjectRoot, 'non-existent'),
      path.join(mockProjectRoot, 'broken-link'),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.warnings).toContainEqual(
      expect.objectContaining({ type: 'BrokenSymlink' }),
    );
  });

  it('should handle file system quota exceeded', async () => {
    expect.hasAssertions();

    const largeContent = Buffer.alloc(1024 * 1024 * 500).fill('a'); // 500MB

    await fs
      .writeFile(path.join(mockProjectRoot, 'large-file.ts'), largeContent)
      .catch((error) => {
        expect(error.code).toMatch(/(ENOSPC|EDQUOT)/);
      });
  });

  it('should handle corrupted package-lock.json', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package-lock.json'),
      'corrupted{content',
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.errors).toContainEqual(
      expect.objectContaining({ type: 'InvalidLockfile' }),
    );
  });

  it('should handle network timeouts', async () => {
    expect.hasAssertions();

    process.env.NPM_CONFIG_REGISTRY = 'http://localhost:9999';
    process.env.NPM_CONFIG_TIMEOUT = '100';

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.errors).toContainEqual(
      expect.objectContaining({ type: 'NetworkTimeout' }),
    );

    delete process.env.NPM_CONFIG_REGISTRY;
    delete process.env.NPM_CONFIG_TIMEOUT;
  });

  it('should handle permission denied errors', async () => {
    expect.hasAssertions();

    await fs.chmod(mockProjectRoot, 0o000);

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.errors).toContainEqual(
      expect.objectContaining({ type: 'PermissionDenied' }),
    );

    await fs.chmod(mockProjectRoot, 0o755);
  });

  it('should handle malformed tsconfig.json', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'tsconfig.json'),
      '{ "compilerOptions": invalid }',
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.errors).toContainEqual(
      expect.objectContaining({ type: 'InvalidTSConfig' }),
    );
  });

  it('should handle path resolution conflicts', async () => {
    expect.hasAssertions();

    await fs.mkdir(path.join(mockProjectRoot, 'node_modules/@types'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(mockProjectRoot, 'node_modules/@types/package.json'),
      '{"name": "@types/conflicting"}',
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.warnings).toContainEqual(
      expect.objectContaining({ type: 'PathConflict' }),
    );
  });
});
