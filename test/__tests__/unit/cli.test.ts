import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';
import { stdin as mockStdin } from 'mock-stdin';

import { mockProjectRoot } from '../../setup';

describe('cLI Commands', () => {
  it('should display help information', () => {
    expect.hasAssertions();

    const output = execSync('node ../dist/index.js --help', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Usage:');
    expect(output).toContain('Options:');
  });

  it('should display version information', () => {
    expect.hasAssertions();

    const output = execSync('node ../dist/index.js --version', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it('should handle invalid flags gracefully', () => {
    expect.hasAssertions();

    expect(() =>
      execSync('node ../dist/index.js --invalid-flag', {
        cwd: mockProjectRoot,
        encoding: 'utf8',
      }),
    ).toThrow('Invalid flag');
  });

  it('should respect verbose output flag', () => {
    expect.hasAssertions();

    const output = execSync('node ../dist/index.js --verbose --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Dependency');
    expect(output).toContain('Usage');
  });
});

describe('cLI Interactive Mode', () => {
  it('should handle user confirmation correctly', async () => {
    expect.hasAssertions();

    // Start CLI process
    const cliProcess = execSync('node ../dist/index.js', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
      input: 'y\n', // Simulate user typing 'y'
    });

    expect(cliProcess).toContain('Dependencies removed');
  });

  it('should create snapshot of dependency analysis', () => {
    expect.hasAssertions();

    const output = execSync('node ../dist/index.js --verbose', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toMatchSnapshot();
  });

  it('should handle interrupt signals gracefully', async () => {
    expect.hasAssertions();

    mockStdin();

    setTimeout(() => {
      process.emit('SIGINT');
    }, 100);

    const output = execSync('node ../dist/index.js', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Operation cancelled');
  });

  it('should handle invalid user input gracefully', async () => {
    expect.hasAssertions();

    const output = execSync('node ../dist/index.js', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
      input: 'invalid\ny\n',
    });

    expect(output).toContain('Invalid input');
    expect(output).toContain('Dependencies removed');
  });
});

describe('platform Compatibility', () => {
  it('should handle Windows-style paths', () => {
    expect.hasAssertions();

    // Mock process.platform
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    });

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Analysis complete');

    // Restore platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });
});

describe('timeout Handling', () => {
  it('should respect custom timeout value', () => {
    expect.hasAssertions();

    expect(() =>
      execSync('node ../dist/index.js --timeout 1', {
        cwd: mockProjectRoot,
        encoding: 'utf8',
      }),
    ).toThrow(/Operation timed out/);
  });

  it('should handle long-running operations', async () => {
    expect.hasAssertions();

    const output = execSync('node ../dist/index.js --timeout 60000', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Analysis complete');
  });
});

describe('node Version Compatibility', () => {
  const nodeVersion = process.version;
  const match = /^v(\d+)\./.exec(nodeVersion);

  if (!match) {
    throw new Error('Node version match failed');
  }

  it('should check minimum Node.js version requirement', () => {
    expect.hasAssertions();

    expect(/^v(\d+)\./.exec(nodeVersion)?.[1]).toBeDefined();
    expect(Number(match[1])).toBeGreaterThanOrEqual(16);
  });

  it('should handle ESM and CommonJS interop', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'module.mjs'),
      'export const test = true;',
    );

    const output = execSync('node ../dist/index.js --dry-run', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Analysis complete');
  });
});

describe('error Handling', () => {
  it('should handle out of memory errors gracefully', () => {
    expect.hasAssertions();

    const output = execSync('node --max-old-space-size=10 ../dist/index.js', {
      cwd: mockProjectRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Memory limit exceeded');
  });

  it('should handle custom config files', () => {
    expect.hasAssertions();

    const output = execSync(
      'node ../dist/index.js --config custom-config.json',
      {
        cwd: mockProjectRoot,
        encoding: 'utf8',
      },
    );

    expect(output).toContain('Using custom configuration');
  });
});
