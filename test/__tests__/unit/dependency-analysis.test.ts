import fs from 'node:fs/promises';
import path from 'node:path';
import rewire from 'rewire';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { mockProjectRoot } from '../../setup';

const myModule = rewire('../../../src/index.ts');

const getDependencies = myModule.__get__('getDependencies');
const getPackageContext = myModule.__get__('getPackageContext');
const isDependencyUsedInFile = myModule.__get__('isDependencyUsedInFile');
const getSourceFiles = myModule.__get__('getSourceFiles');
const detectPackageManager = myModule.__get__('detectPackageManager');
const getMemoryUsage = myModule.__get__('getMemoryUsage');
const processFilesInParallel = myModule.__get__('processFilesInParallel');

describe('dependency Analysis', () => {
  describe('getDependencies', () => {
    it('should correctly parse dependencies from package.json', async () => {
      expect.hasAssertions();

      const packageJsonPath = path.join(mockProjectRoot, 'package.json');
      const dependencies = await getDependencies(packageJsonPath);

      expect(dependencies).toContain('used-dep');
      expect(dependencies).toContain('unused-dep');
      expect(dependencies).toContain('test-dep');
    });
  });

  describe('isDependencyUsedInFile', () => {
    it('should detect used dependencies', async () => {
      expect.hasAssertions();

      const filePath = path.join(mockProjectRoot, 'index.ts');
      const context = await getPackageContext(
        path.join(mockProjectRoot, 'package.json'),
      );

      const isUsed = await isDependencyUsedInFile(
        'used-dep',
        filePath,
        context,
      );

      expect(isUsed).toBe(true);
    });

    it('should identify unused dependencies', async () => {
      expect.hasAssertions();

      const filePath = path.join(mockProjectRoot, 'index.ts');
      const context = await getPackageContext(
        path.join(mockProjectRoot, 'package.json'),
      );

      const isUsed = await isDependencyUsedInFile(
        'unused-dep',
        filePath,
        context,
      );

      expect(isUsed).toBe(false);
    });

    it('should always mark essential packages as used', async () => {
      expect.hasAssertions();

      const filePath = path.join(mockProjectRoot, 'index.ts');
      const context = await getPackageContext(
        path.join(mockProjectRoot, 'package.json'),
      );

      const isTypescriptUsed = await isDependencyUsedInFile(
        'typescript',
        filePath,
        context,
      );

      expect(isTypescriptUsed).toBe(true);
    });
  });

  describe('getSourceFiles', () => {
    beforeEach(async () => {
      // Create test files
      await fs.writeFile(path.join(mockProjectRoot, 'src/test.ts'), '');
      await fs.writeFile(path.join(mockProjectRoot, 'src/test.js'), '');
      await fs.mkdir(path.join(mockProjectRoot, 'node_modules'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(mockProjectRoot, 'node_modules/test.js'),
        '',
      );
    });

    it('should find all source files excluding node_modules', async () => {
      expect.hasAssertions();

      const files = await getSourceFiles(mockProjectRoot);

      expect(files).toContain(expect.stringMatching(/src\/test\.ts$/));
      expect(files).toContain(expect.stringMatching(/src\/test\.js$/));
      expect(files).not.toContain(expect.stringMatching(/node_modules/));
    });

    it('should respect ignore patterns', async () => {
      expect.hasAssertions();

      const files = await getSourceFiles(mockProjectRoot, ['**/*.js']);

      expect(files).toContain(expect.stringMatching(/src\/test\.ts$/));
      expect(files).not.toContain(expect.stringMatching(/src\/test\.js$/));
    });
  });

  describe('detectPackageManager', () => {
    it('should detect npm as default', async () => {
      expect.hasAssertions();

      const packageManager = await detectPackageManager(mockProjectRoot);

      expect(packageManager).toBe('npm');
    });

    it('should detect yarn when yarn.lock exists', async () => {
      expect.hasAssertions();

      await fs.writeFile(path.join(mockProjectRoot, 'yarn.lock'), '');
      const packageManager = await detectPackageManager(mockProjectRoot);

      expect(packageManager).toBe('yarn');

      await fs.unlink(path.join(mockProjectRoot, 'yarn.lock'));
    });

    it('should detect pnpm when pnpm-lock.yaml exists', async () => {
      expect.hasAssertions();

      await fs.writeFile(path.join(mockProjectRoot, 'pnpm-lock.yaml'), '');
      const packageManager = await detectPackageManager(mockProjectRoot);

      expect(packageManager).toBe('pnpm');

      await fs.unlink(path.join(mockProjectRoot, 'pnpm-lock.yaml'));
    });
  });

  describe('package Context', () => {
    it('should detect dependencies in config files', async () => {
      expect.hasAssertions();

      await fs.writeFile(
        path.join(mockProjectRoot, 'babel.config.js'),
        'module.exports = { plugins: ["@babel/plugin-transform-runtime"] };',
      );

      const context = await getPackageContext(
        path.join(mockProjectRoot, 'package.json'),
      );

      expect(context.configs?.['babel.config.js']).toBeDefined();
    });

    it('should handle special package patterns', async () => {
      expect.hasAssertions();

      const filePath = path.join(mockProjectRoot, 'webpack.config.js');
      await fs.writeFile(filePath, 'const webpack = require("webpack");');

      const context = await getPackageContext(
        path.join(mockProjectRoot, 'package.json'),
      );
      const isUsed = await isDependencyUsedInFile('webpack', filePath, context);

      expect(isUsed).toBe(true);
    });
  });

  describe('memory Management', () => {
    it('should return memory usage stats', () => {
      expect.hasAssertions();

      const stats = getMemoryUsage();

      expect(stats.used).toBeDefined();
      expect(stats.total).toBeDefined();
      expect(stats.used).toBeLessThan(stats.total);
    });

    it('should process files in batches', async () => {
      expect.hasAssertions();

      const files = Array.from({ length: 100 }, (_, index) =>
        path.join(mockProjectRoot, `test${index}.ts`),
      );

      const results = await processFilesInParallel(
        files,
        'test-dep',
        await getPackageContext(path.join(mockProjectRoot, 'package.json')),
        () => {},
      );

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('error Handling', () => {
    it('should handle missing package.json gracefully', async () => {
      expect.hasAssertions();

      await expect(
        getDependencies('/nonexistent/package.json'),
      ).rejects.toThrow('Failed to parse package.json');
    });

    it('should handle malformed package.json', async () => {
      expect.hasAssertions();

      await fs.writeFile(
        path.join(mockProjectRoot, 'bad-package.json'),
        'invalid json',
      );

      await expect(
        getDependencies(path.join(mockProjectRoot, 'bad-package.json')),
      ).rejects.toThrow('Failed to parse package.json');
    });

    it('should handle file read errors', async () => {
      expect.hasAssertions();

      const filePath = path.join(mockProjectRoot, 'unreadable.ts');
      await fs.writeFile(filePath, '');
      await fs.chmod(filePath, 0o000);

      const context = await getPackageContext(
        path.join(mockProjectRoot, 'package.json'),
      );

      await expect(
        isDependencyUsedInFile('test-dep', filePath, context),
      ).resolves.toBe(false);
    });
  });

  describe('special Cases', () => {
    it('should handle scoped packages correctly', async () => {
      expect.hasAssertions();

      await fs.writeFile(
        path.join(mockProjectRoot, 'scoped.ts'),
        'import pkg from "@scope/package";',
      );
      const context = await getPackageContext(
        path.join(mockProjectRoot, 'package.json'),
      );
      const isUsed = await isDependencyUsedInFile(
        '@scope/package',
        'scoped.ts',
        context,
      );

      expect(isUsed).toBe(true);
    });

    it('should handle path aliases', async () => {
      expect.hasAssertions();

      // Setup tsconfig with path aliases
      await fs.writeFile(
        path.join(mockProjectRoot, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@/*': ['src/*'],
              '@utils/*': ['src/utils/*'],
            },
          },
        }),
      );

      // Create a file using path alias
      await fs.writeFile(
        path.join(mockProjectRoot, 'src/test.ts'),
        'import { something } from "@/utils/helpers";',
      );

      const context = await getPackageContext(
        path.join(mockProjectRoot, 'package.json'),
      );
      const isUsed = await isDependencyUsedInFile(
        '@/utils/helpers',
        path.join(mockProjectRoot, 'src/test.ts'),
        context,
      );

      expect(isUsed).toBe(true);
    });
  });
});
