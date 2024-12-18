import fs from 'node:fs/promises';
import path from 'node:path';

export const mockProjectRoot = path.resolve('test/__fixtures__/test-project');

export const setupTestEnvironment = (): string => {
  return mockProjectRoot;
};

export const createMockProject = async (): Promise<void> => {
  await fs.mkdir(mockProjectRoot, { recursive: true });
  await fs.writeFile(
    path.join(mockProjectRoot, 'package.json'),
    JSON.stringify({
      dependencies: {
        'used-dep': '^1.0.0',
        'unused-dep': '^1.0.0',
      },
      devDependencies: {
        'test-dep': '^1.0.0',
      },
    }),
  );

  await fs.writeFile(
    path.join(mockProjectRoot, 'index.ts'),
    `import usedDep from 'used-dep';`,
  );
};

export const createTestFiles = async (): Promise<void> => {
  // Create source files
  await fs.mkdir(path.join(mockProjectRoot, 'src'), { recursive: true });

  // Regular import
  await fs.writeFile(
    path.join(mockProjectRoot, 'src/regular-import.ts'),
    'import { something } from "used-dep";',
  );

  // Dynamic import
  await fs.writeFile(
    path.join(mockProjectRoot, 'src/dynamic-import.ts'),
    'const mod = await import("used-dep");',
  );

  // Require
  await fs.writeFile(
    path.join(mockProjectRoot, 'src/require.js'),
    'const dep = require("used-dep");',
  );

  // Config files
  await fs.writeFile(
    path.join(mockProjectRoot, 'babel.config.js'),
    'module.exports = { presets: ["@babel/preset-env"] };',
  );
};

export const createErrorTestFiles = async (): Promise<void> => {
  // Create malformed files
  await fs.writeFile(
    path.join(mockProjectRoot, 'malformed.ts'),
    'const invalid syntax {',
  );

  // Create binary file
  const binaryData = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  await fs.writeFile(path.join(mockProjectRoot, 'binary.jpg'), binaryData);

  // Create deeply nested imports
  await fs.mkdir(path.join(mockProjectRoot, 'src/deep/nested'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(mockProjectRoot, 'src/deep/nested/deep-import.ts'),
    'import { deep } from "deep-dep";',
  );
};

export const createComplexWorkspace = async (): Promise<void> => {
  // Create a complex monorepo structure
  await fs.mkdir(path.join(mockProjectRoot, 'packages/app/src'), {
    recursive: true,
  });
  await fs.mkdir(path.join(mockProjectRoot, 'packages/lib/src'), {
    recursive: true,
  });
  await fs.mkdir(path.join(mockProjectRoot, 'apps/web/src'), {
    recursive: true,
  });

  // Create package.json files
  await fs.writeFile(
    path.join(mockProjectRoot, 'package.json'),
    JSON.stringify({
      workspaces: ['packages/*', 'apps/*'],
      private: true,
      dependencies: {
        'root-dep': '^1.0.0',
      },
    }),
  );

  // Create workspace package files
  await fs.writeFile(
    path.join(mockProjectRoot, 'packages/app/package.json'),
    JSON.stringify({
      name: '@test/app',
      dependencies: {
        '@test/lib': 'workspace:*',
        'app-dep': '^1.0.0',
      },
    }),
  );

  await fs.writeFile(
    path.join(mockProjectRoot, 'packages/lib/package.json'),
    JSON.stringify({
      name: '@test/lib',
      dependencies: {
        'lib-dep': '^1.0.0',
      },
    }),
  );
};

export const setupTestProject = async (): Promise<void> => {
  await createMockProject();
  await createTestFiles();
  await createErrorTestFiles();
  await createComplexWorkspace();
};

export const cleanupMockProject = async (): Promise<void> => {
  await fs.rm(mockProjectRoot, { recursive: true, force: true });
};

beforeAll(async () => {
  await createMockProject();
});

beforeEach(async () => {
  await setupTestProject();
});

afterAll(async () => {
  await cleanupMockProject();
});
