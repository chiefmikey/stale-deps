import fs from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { analyzeDependencies } from '../../analyzer';
import { mockProjectRoot } from '../setup/setup';

describe('security Checks', () => {
  beforeEach(async () => {
    await fs.rm(mockProjectRoot, { recursive: true, force: true });
    await fs.mkdir(mockProjectRoot, { recursive: true });
  });

  it('should detect known vulnerable dependencies', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          lodash: '4.17.20', // Known vulnerable version
        },
      }),
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.vulnerabilities).toContainEqual(
      expect.objectContaining({ package: 'lodash' }),
    );
  });

  it('should handle dependencies with malformed package.json', async () => {
    expect.hasAssertions();

    await fs.mkdir(path.join(mockProjectRoot, 'node_modules/malicious-pkg'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(mockProjectRoot, 'node_modules/malicious-pkg/package.json'),
      '{"name": "malicious-pkg", "scripts": {"preinstall": "rm -rf /"}}',
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.warnings).toContainEqual(
      expect.objectContaining({ type: 'SuspiciousScript' }),
    );
  });
});
