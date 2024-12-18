import fs from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from '@jest/globals';
import rewire from 'rewire';

import { mockProjectRoot } from '../../setup';

import { analyzeDependencies } from 'test/analyzer';

const myModule = rewire('../../../src/index.ts');

const getWorkspaceInfo = myModule.__get__('getWorkspaceInfo');
const findClosestPackageJson = myModule.__get__('findClosestPackageJson');

describe('workspace Detection', () => {
  describe('getWorkspaceInfo', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(mockProjectRoot, 'packages'), {
        recursive: true,
      });
    });

    it('should detect yarn workspaces array format', async () => {
      expect.hasAssertions();

      await fs.writeFile(
        path.join(mockProjectRoot, 'package.json'),
        JSON.stringify({
          workspaces: ['packages/*'],
          dependencies: {},
        }),
      );

      const workspaceInfo = await getWorkspaceInfo(
        path.join(mockProjectRoot, 'package.json'),
      );

      expect(workspaceInfo).toBeDefined();
      expect(workspaceInfo?.packages).toContain('packages');
    });

    it('should detect npm workspaces object format', async () => {
      expect.hasAssertions();

      await fs.writeFile(
        path.join(mockProjectRoot, 'package.json'),
        JSON.stringify({
          workspaces: { packages: ['packages/*'] },
          dependencies: {},
        }),
      );

      const workspaceInfo = await getWorkspaceInfo(
        path.join(mockProjectRoot, 'package.json'),
      );

      expect(workspaceInfo).toBeDefined();
      expect(workspaceInfo?.packages).toContain('packages');
    });

    it('should handle multiple workspace patterns', async () => {
      expect.hasAssertions();

      await fs.mkdir(path.join(mockProjectRoot, 'apps'), { recursive: true });
      await fs.writeFile(
        path.join(mockProjectRoot, 'package.json'),
        JSON.stringify({
          workspaces: ['packages/*', 'apps/*'],
          dependencies: {},
        }),
      );

      const workspaceInfo = await getWorkspaceInfo(
        path.join(mockProjectRoot, 'package.json'),
      );

      expect(workspaceInfo).toBeDefined();
      expect(workspaceInfo?.packages).toContain('packages');
      expect(workspaceInfo?.packages).toContain('apps');
    });
  });

  describe('findClosestPackageJson', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(mockProjectRoot, 'packages/app'), {
        recursive: true,
      });
    });

    it('should find workspace root package.json', async () => {
      expect.hasAssertions();

      await fs.writeFile(
        path.join(mockProjectRoot, 'package.json'),
        JSON.stringify({
          workspaces: ['packages/*'],
          dependencies: {},
        }),
      );

      await fs.writeFile(
        path.join(mockProjectRoot, 'packages/app/package.json'),
        JSON.stringify({
          name: 'app',
          dependencies: {},
        }),
      );

      const packagePath = await findClosestPackageJson(
        path.join(mockProjectRoot, 'packages/app'),
      );

      expect(packagePath).toBe(path.join(mockProjectRoot, 'package.json'));
    });

    it('should handle nested workspaces', async () => {
      expect.hasAssertions();

      await fs.mkdir(path.join(mockProjectRoot, 'packages/app/nested'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(mockProjectRoot, 'packages/app/package.json'),
        JSON.stringify({
          workspaces: ['nested/*'],
          dependencies: {},
        }),
      );

      const packagePath = await findClosestPackageJson(
        path.join(mockProjectRoot, 'packages/app/nested'),
      );

      expect(packagePath).toBe(
        path.join(mockProjectRoot, 'packages/app/package.json'),
      );
    });
  });

  describe('workspace Edge Cases', () => {
    it('should handle workspace protocol dependencies', async () => {
      expect.hasAssertions();

      await fs.writeFile(
        path.join(mockProjectRoot, 'packages/app/package.json'),
        JSON.stringify({
          name: 'app',
          dependencies: {
            lib: 'workspace:*',
            '@scope/lib': 'workspace:^1.0.0',
          },
        }),
      );

      const workspaceInfo = await getWorkspaceInfo(
        path.join(mockProjectRoot, 'package.json'),
      );

      expect(workspaceInfo?.workspaceDependencies).toContain('lib');
      expect(workspaceInfo?.workspaceDependencies).toContain('@scope/lib');
    });

    it('should handle workspace inheritance fields', async () => {
      expect.hasAssertions();

      await fs.writeFile(
        path.join(mockProjectRoot, 'package.json'),
        JSON.stringify({
          name: 'root',
          dependencies: {
            'shared-dep': '1.0.0',
          },
        }),
      );

      await fs.writeFile(
        path.join(mockProjectRoot, 'packages/app/package.json'),
        JSON.stringify({
          name: 'app',
          dependencies: {
            'local-dep': '1.0.0',
          },
        }),
      );

      const results = await analyzeDependencies(
        path.join(mockProjectRoot, 'packages/app'),
      );

      expect(results.inheritedDependencies).toContain('shared-dep');
      expect(results.localDependencies).toContain('local-dep');
    });
  });
});
