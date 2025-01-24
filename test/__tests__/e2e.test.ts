import { execSync } from 'node:child_process';
import path from 'node:path';

import { beforeAll, describe, expect, it } from '@jest/globals';

describe('e2E Test', () => {
  const projectRoot = process.cwd();
  const cliPath = path.resolve(projectRoot, 'dist/index.js');

  beforeAll(async () => {
    // Clean and rebuild
    execSync('npm run build', { stdio: 'inherit' });
    // Give the filesystem a moment to finish writing
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  it('should show help output when run with --help', () => {
    expect.hasAssertions();

    const output = execSync(`node ${cliPath} --help`, {
      env: { ...process.env, NODE_ENV: 'test' },
      encoding: 'utf8',
    });

    expect(output).toContain('Usage: depsweep [options]');
    expect(output).toContain('Options:');
    expect(output).toContain('--help');
    expect(output).toContain('--version');
  });
});
