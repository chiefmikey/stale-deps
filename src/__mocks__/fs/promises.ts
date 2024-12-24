const mockFiles = new Map([
  [
    '/fake/path/package.json',
    JSON.stringify({
      name: 'test-package',
      dependencies: {
        'test-dep': '1.0.0',
      },
      devDependencies: {
        'test-dev-dep': '1.0.0',
      },
    }),
  ],
]);

export const readFile = jest.fn(async (path: string) => {
  if (mockFiles.has(path)) {
    return mockFiles.get(path);
  }
  // Instead of throwing, return empty content for any file
  return '{}';
});

export const access = jest.fn().mockResolvedValue(null);

export default { readFile, access };
