import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { mockProjectRoot } from '../../setup';

describe('edge Cases', () => {
  it('should handle unicode filenames', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, '测试.ts'),
      'import { something } from "test-dep";',
    );
    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Analysis complete');
  });

  it('should handle deep dependency trees', async () => {
    expect.hasAssertions();

    const createNestedDep = (depth: number): Record<string, any> => {
      const dependencies: Record<string, any> = {};
      for (let index = depth; index >= 0; index--) {
        dependencies[`dep-level-${index}`] = {};
      }
      dependencies['dep-level-0'] = '1.0.0';
      return dependencies;
    };

    const nestedDependencies = createNestedDep(100);

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({ dependencies: nestedDependencies }),
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Analysis complete');
  });

  it('should handle circular dependencies', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          'circular-a': 'file:packages/circular-a',
        },
      }),
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Circular dependency detected');
  });
});

async function simulateInterruptedOperation(): Promise<() => Promise<void>> {
  // Create a partial write to simulate interruption
  const lockFile = path.join(mockProjectRoot, '.stale-deps.lock');
  await fs.writeFile(lockFile, JSON.stringify({ state: 'analyzing' }));

  // Create some temporary files
  const temporaryDirectory = path.join(mockProjectRoot, '.stale-deps-temp');
  await fs.mkdir(temporaryDirectory, { recursive: true });
  await fs.writeFile(
    path.join(temporaryDirectory, 'partial-analysis.json'),
    '{"incomplete": true}',
  );

  // Return cleanup function
  return async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    await fs.unlink(lockFile);
  };
}

describe('filesystem Scenarios', () => {
  it('should handle read-only directories', async () => {
    expect.hasAssertions();

    const readOnlyDirectory = path.join(mockProjectRoot, 'readonly');
    await fs.mkdir(readOnlyDirectory, { mode: 0o444 });

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: readOnlyDirectory,
      encoding: 'utf8',
    });

    expect(output).toContain('Permission warning');
  });

  it('should recover from interrupted operations', async () => {
    expect.hasAssertions();

    const cleanup = await simulateInterruptedOperation();
    const output = execSync('node ../dist/index.js --recover', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Recovery complete');

    await cleanup();
  });
});

describe('package Resolution', () => {
  it('should handle peer dependencies', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          'main-pkg': '1.0.0',
        },
        peerDependencies: {
          'peer-dep': '>=2.0.0',
        },
      }),
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Peer dependency detected');
  });

  it('should handle TypeScript path aliases', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@app/*': ['src/*'],
            '@lib/*': ['lib/*'],
          },
        },
      }),
    );

    await fs.writeFile(
      path.join(mockProjectRoot, 'src/test.ts'),
      `import { something } from '@app/utils';`,
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Using path aliases');
  });
});
