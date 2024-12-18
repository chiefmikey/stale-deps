import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { analyzeDependencies } from '../../analyzer';
import { mockProjectRoot } from '../../setup';

describe('dependency Analysis', () => {
  it('should detect dynamic imports', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'dynamic.ts'),
      `
        const dep = await import('dynamic-dep');
        import('conditional-dep').then(module => module.default());
      `,
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.packages).toContain('dynamic-dep');
    expect(results.packages).toContain('conditional-dep');
  });

  it('should handle different import syntaxes', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'imports.ts'),
      `
        import defaultExport from 'default-dep';
        import * as namespace from 'namespace-dep';
        import { named } from 'named-dep';
        const cjs = require('commonjs-dep');
        export { something } from 'reexport-dep';
      `,
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.packages).toEqual(
      expect.arrayContaining([
        'default-dep',
        'namespace-dep',
        'named-dep',
        'commonjs-dep',
        'reexport-dep',
      ]),
    );
  });

  it('should parse package manager lockfiles', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package-lock.json'),
      JSON.stringify({
        dependencies: {
          'locked-dep': { version: '1.0.0' },
        },
      }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.resolvedDependencies['locked-dep']).toBe('1.0.0');
  });

  it('should handle dependency aliases', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          'alias-dep': 'npm:real-dep@1.0.0',
        },
      }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.resolvedDependencies['alias-dep']).toBe('real-dep@1.0.0');
  });
});

describe('complex Package Scenarios', () => {
  it('should handle scoped packages', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'scoped.ts'),
      `
        import pkg from '@org/package';
        import { something } from '@scope/other-pkg/subpath';
      `,
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.packages).toContain('@org/package');
    expect(results.packages).toContain('@scope/other-pkg');
  });

  it('should parse declaration files', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'types.d.ts'),
      `
        declare module 'typed-pkg';
        declare module '@types/*';
        /// <reference types="ref-pkg" />
      `,
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.packages).toContain('typed-pkg');
    expect(results.packages).toContain('ref-pkg');
  });
});

describe('package Scripts Analysis', () => {
  it('should detect dependencies used in scripts', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'esbuild src/index.ts',
          test: 'jest --config jest.config.js',
          lint: 'eslint . --ext .ts',
        },
        dependencies: {
          esbuild: '^0.14.0',
          jest: '^27.0.0',
          eslint: '^8.0.0',
        },
      }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.buildToolDependencies).toEqual(
      expect.arrayContaining(['esbuild', 'jest', 'eslint']),
    );
  });

  it('should handle complex script commands', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        scripts: {
          dev: 'nodemon -e ts,json --exec "ts-node src/index.ts"',
          'test:e2e': 'start-server-and-test dev 3000 cypress run',
        },
      }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.buildToolDependencies).toEqual(
      expect.arrayContaining([
        'nodemon',
        'ts-node',
        'start-server-and-test',
        'cypress',
      ]),
    );
  });
});
