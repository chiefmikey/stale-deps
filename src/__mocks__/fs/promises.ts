const mockFiles = new Map([
  [
    '/fake/path/package.json',
    JSON.stringify({
      name: 'test-package',
      version: '1.0.0',
      dependencies: {
        'test-dep': '1.0.0',
      },
      devDependencies: {
        'test-dev-dep': '1.0.0',
      },
      peerDependencies: {
        'test-peer-dep': '1.0.0',
      },
      optionalDependencies: {
        'test-optional-dep': '1.0.0',
      },
      scripts: {
        test: 'jest',
      },
    }),
  ],
]);

export async function readFile(path: string): Promise<Buffer> {
  if (mockFiles.has(path)) {
    return Buffer.from(mockFiles.get(path)!, 'utf8');
  }
  return Buffer.from('{}', 'utf8');
}

export async function access(path: string): Promise<void> {
  if (!mockFiles.has(path)) {
    // Simulate file not found
    throw new Error(`ENOENT: no such file or directory, open '${path}'`);
  }
}
