import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { mockProjectRoot } from '../../setup';

describe('integration Tests', () => {
  it('should identify and list unused dependencies', async () => {
    expect.hasAssertions();

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('unused-dep');
    expect(output).not.toContain('used-dep');
  });

  it('should respect --ignore flag', async () => {
    expect.hasAssertions();

    const output = execSync(
      'node ../dist/index.js --ignore "**/*.js" --dry-run',
      {
        cwd: mockProjectRoot,
        encoding: 'utf8',
      },
    );

    expect(output).not.toContain('test-dep'); // test-dep is only used in .js files
  });

  it('should respect --safe flag', async () => {
    expect.hasAssertions();

    const output = execSync('node ../dist/index.js --safe --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).not.toContain('typescript'); // typescript is an essential package
  });

  it('should handle monorepo workspaces', async () => {
    expect.hasAssertions();

    // Setup mock monorepo
    await fs.mkdir(path.join(mockProjectRoot, 'packages/app'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        workspaces: ['packages/*'],
        dependencies: {},
      }),
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: path.join(mockProjectRoot, 'packages/app'),
      encoding: 'utf8',
    });

    expect(output).toContain('Monorepo detected');
  });

  it('should handle malformed package.json gracefully', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      'invalid json',
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Error parsing package.json');
  });

  it('should handle empty package.json', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({}),
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('No dependencies found');
  });

  it('should handle non-existent directories', () => {
    expect.hasAssertions();
    expect(() =>
      execSync('node ../dist/index.js --dry-run', {
        cwd: '/non/existent/path',
        encoding: 'utf8',
      }),
    ).toThrow('Expected error message');
  });

  it('should handle concurrent executions', async () => {
    expect.hasAssertions();

    const promises = Array.from({ length: 3 }, () =>
      execSync('node ../dist/index.js --dry-run', {
        cwd: mockProjectRoot,
        encoding: 'utf8',
      }),
    );

    const results = await Promise.all(promises);
    for (const output of results) {
      expect(output).toContain('Analysis complete');
    }
  });

  it('should handle symbolic links', async () => {
    expect.hasAssertions();

    await fs.symlink(
      path.join(mockProjectRoot, 'src'),
      path.join(mockProjectRoot, 'src-link'),
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Analysis complete');
  });

  it('should handle files with special characters', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'special@file.ts'),
      'import { something } from "test-dep";',
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Analysis complete');
  });

  it('should handle dependency type transitions', async () => {
    expect.hasAssertions();

    // Test moving dependencies between dev and regular dependencies
    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          'dev-only-dep': '^1.0.0',
        },
        devDependencies: {
          'prod-only-dep': '^1.0.0',
        },
      }),
    );

    const output = execSync('node ../dist/index.js --suggest-moves --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Suggested moves');
  });

  it('should recover from parsing errors', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'broken.ts'),
      'const broken = {', // Intentionally malformed
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Parsing error in');
    expect(output).toContain('Analysis complete');
  });

  it('should handle git ignored files correctly', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, '.gitignore'),
      'ignored-folder/\n*.ignored',
    );
    await fs.mkdir(path.join(mockProjectRoot, 'ignored-folder'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(mockProjectRoot, 'ignored-folder/test.ts'),
      'import { something } from "ignored-dep";',
    );

    const output = execSync(
      'node ../dist/index.js --respect-git-ignore --dry-run',
      {
        cwd: mockProjectRoot,
        encoding: 'utf8',
      },
    );

    expect(output).not.toContain('ignored-dep');
  });
});

describe('package Manager Specific Tests', () => {
  it('should handle yarn berry (yarn 2+) workspaces', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, '.yarnrc.yml'),
      'nodeLinker: node-modules',
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Yarn Berry detected');
  });

  it('should handle pnpm workspace protocol imports', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'pnpm-workspace.yaml'),
      'packages: ["packages/*"]',
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('PNPM workspace detected');
  });
});

describe('race Conditions', () => {
  it('should handle concurrent package.json modifications', async () => {
    expect.hasAssertions();

    const modifyPromise = fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({ dependencies: { 'new-dep': '1.0.0' } }),
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    await modifyPromise;

    expect(output).toContain('File changed during analysis');
  });
});

describe('network Scenarios', () => {
  it('should handle network failures gracefully', async () => {
    expect.hasAssertions();

    // Simulate network failure by using invalid registry
    process.env.NPM_CONFIG_REGISTRY = 'http://invalid-registry';

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Network error');

    delete process.env.NPM_CONFIG_REGISTRY;
  });

  it('should handle package version conflicts', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          'conflict-dep': '1.0.0',
        },
        devDependencies: {
          'wrapper-pkg': '1.0.0', // depends on conflict-dep@2.0.0
        },
      }),
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Version conflict detected');
  });
});
