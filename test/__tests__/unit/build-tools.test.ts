import fs from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { analyzeDependencies } from '../../analyzer';
import { mockProjectRoot } from '../../setup';

describe('build Tool Dependencies', () => {
  beforeEach(async () => {
    await fs.rm(mockProjectRoot, { recursive: true, force: true });
    await fs.mkdir(mockProjectRoot, { recursive: true });
  });

  it('should detect webpack plugins', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'webpack.config.js'),
      `
        const HtmlWebpackPlugin = require('html-webpack-plugin');
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      `,
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.buildToolDependencies).toContain('html-webpack-plugin');
    expect(results.buildToolDependencies).toContain('webpack-bundle-analyzer');
  });

  it('should detect vite plugins', async () => {
    expect.hasAssertions();

    await fs.writeFile(
      path.join(mockProjectRoot, 'vite.config.ts'),
      `
        import react from '@vitejs/plugin-react'
        import { defineConfig } from 'vite'
      `,
    );

    const results = await analyzeDependencies(mockProjectRoot);

    expect(results.buildToolDependencies).toContain('@vitejs/plugin-react');
  });
});
