import { execSync } from 'node:child_process';

import { describe, expect, it } from '@jest/globals';

describe('e2E Test', () => {
  it('should pass', () => {
    expect.hasAssertions();
    expect(true).toBe(true);
  });

  it('should show help output when run with --help', () => {
    expect.hasAssertions();

    const output = execSync('node dist/index.js --help').toString();

    expect(output).toContain('Usage:');
  });
});
