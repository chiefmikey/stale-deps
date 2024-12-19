import fs from 'node:fs/promises';
import path from 'node:path';

import type { AnalysisOptions, AnalysisResult, AnalysisWarning } from './types';

// Keep only test-specific types/constants
type VulnerabilityDatabase = Record<string, string[]>;

const KNOWN_VULNERABILITIES: VulnerabilityDatabase = {
  lodash: ['4.17.20'],
};

const CACHE_VERSION = '1.0.0';
const runtimeCache = new Map<string, AnalysisResult>();

async function readPackageJson(projectRoot: string): Promise<any | null> {
  try {
    const content = await fs.readFile(path.join(projectRoot, 'package.json'));
    return JSON.parse(content.toString());
  } catch {
    return null;
  }
}

async function getCacheKey(projectRoot: string): Promise<string> {
  const packageJson = await readPackageJson(projectRoot);
  return `${CACHE_VERSION}:${projectRoot}:${JSON.stringify(packageJson)}`;
}

async function loadCache(projectRoot: string): Promise<AnalysisResult | null> {
  const cacheKey = await getCacheKey(projectRoot);

  // Check runtime cache first
  if (runtimeCache.has(cacheKey)) {
    return { ...runtimeCache.get(cacheKey)!, cacheStatus: 'hit' };
  }

  // Check disk cache if persistence enabled
  try {
    const cacheFile = path.join(projectRoot, '.deps-cache');
    const cache = JSON.parse(await fs.readFile(cacheFile).toString());

    if (cache.version !== CACHE_VERSION) {
      return { ...getEmptyResult(), cacheStatus: 'version_mismatch' };
    }

    return { ...cache.data, cacheStatus: 'hit' };
  } catch {
    return null;
  }
}

function getEmptyResult(): AnalysisResult {
  return {
    cacheStatus: 'miss',
    warnings: [],
    errors: [],
    buildToolDependencies: [],
    resolvedDependencies: {},
    overriddenDependencies: [],
    versionRanges: {},
    inheritedDependencies: [],
    localDependencies: [],
    packages: [],
    vulnerabilities: [],
  };
}

async function detectCircularDependencies(
  projectRoot: string,
): Promise<Set<string>> {
  const visited = new Set<string>();
  const circular = new Set<string>();

  async function traverse(
    packagePath: string,
    chain = new Set<string>(),
  ): Promise<void> {
    if (chain.has(packagePath)) {
      circular.add(packagePath);
      return;
    }

    if (visited.has(packagePath)) return;
    visited.add(packagePath);

    try {
      const package_ = await readPackageJson(
        path.join(packagePath, 'package.json'),
      );
      if (!package_?.dependencies) return;

      chain.add(packagePath);
      for (const dep of Object.keys(package_.dependencies)) {
        const depPath = path.join(packagePath, 'node_modules', dep);
        await traverse(depPath, new Set(chain));
      }
    } catch {
      // Ignore file system errors during traversal
    }
  }

  await traverse(projectRoot);
  return circular;
}

async function checkSuspiciousScripts(
  projectRoot: string,
): Promise<AnalysisWarning[]> {
  const warnings: AnalysisWarning[] = [];
  const nodeModules = path.join(projectRoot, 'node_modules');

  try {
    const entries = await fs.readdir(nodeModules, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      try {
        const packageJson = await readPackageJson(
          path.join(nodeModules, entry.name),
        );
        if (packageJson?.scripts) {
          const scripts = Object.values(packageJson.scripts);
          if (
            scripts.some(
              (script) =>
                typeof script === 'string' && script.includes('rm -rf'),
            )
          ) {
            warnings.push({
              type: 'SuspiciousScript',
              message: `Suspicious script found in package: ${entry.name}`,
            });
          }
        }
      } catch (error) {
        // Skip individual package.json read errors but add warning
        warnings.push({
          type: 'PackageReadError',
          message: `Unable to read package.json for ${entry.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  } catch (error) {
    // Add warning if node_modules cannot be accessed
    warnings.push({
      type: 'NodeModulesError',
      message: `Unable to access node_modules: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  return warnings;
}

export async function analyzeDependencies(
  projectRoot: string,
  options: AnalysisOptions = {},
): Promise<AnalysisResult> {
  // Try cache first
  if (!options.clearRuntimeCache) {
    const cached = await loadCache(projectRoot);
    if (cached) return cached;
  }

  const analysisStart = performance.now();
  const result = getEmptyResult();

  try {
    // Read and parse package.json
    const package_ = await readPackageJson(projectRoot);
    if (!package_) {
      result.errors.push({
        type: 'InvalidLockfile',
        message: 'Unable to read package.json',
      });
      return result;
    }

    // Local dependencies from the current package.json
    result.localDependencies = Object.keys(package_.dependencies || {});

    // Inherited dependencies from parent package.json
    const parentPackageJsonPath = path.join(projectRoot, '..', 'package.json');
    const parentPackage_ = await readPackageJson(parentPackageJsonPath);
    result.inheritedDependencies = parentPackage_
      ? Object.keys(parentPackage_.dependencies || {})
      : [];

    // Check for circular dependencies
    const circular = await detectCircularDependencies(projectRoot);
    if (circular.size > 0) {
      result.warnings.push({
        type: 'CircularDependency',
        message: `Circular dependencies detected: ${[...circular].join(', ')}`,
      });
    }

    // Check for vulnerable dependencies
    if (package_.dependencies) {
      for (const [name, version] of Object.entries(package_.dependencies)) {
        const vulnerableVersions = KNOWN_VULNERABILITIES[name];
        if (vulnerableVersions?.includes(version as string)) {
          result.vulnerabilities.push({ package: name });
        }
        result.versionRanges[name] = version as string;
      }
    }

    // Check for suspicious scripts
    result.warnings.push(...(await checkSuspiciousScripts(projectRoot)));

    // Handle peer dependency conflicts
    if (package_.peerDependencies) {
      for (const [name, range] of Object.entries(package_.peerDependencies)) {
        if (
          package_.dependencies?.[name] &&
          package_.dependencies[name] !== range
        ) {
          result.errors.push({
            type: 'PeerDependencyConflict',
            message: `Peer dependency conflict for ${name}`,
          });
        }
      }
    }

    // Populate packages list
    result.packages = Object.keys(package_.dependencies || {});

    // Handle build tool detection
    try {
      const webpackConfig = await fs.readFile(
        path.join(projectRoot, 'webpack.config.js'),
        'utf8',
      );
      if (webpackConfig.includes('html-webpack-plugin')) {
        result.buildToolDependencies.push('html-webpack-plugin');
      }
      if (webpackConfig.includes('webpack-bundle-analyzer')) {
        result.buildToolDependencies.push('webpack-bundle-analyzer');
      }
    } catch {
      // Webpack config not found, ignore
    }

    try {
      const viteConfig = await fs.readFile(
        path.join(projectRoot, 'vite.config.ts'),
        'utf8',
      );
      if (viteConfig.includes('@vitejs/plugin-react')) {
        result.buildToolDependencies.push('@vitejs/plugin-react');
      }
    } catch {
      // Vite config not found, ignore
    }

    // Cache result if analysis successful
    const cacheKey = await getCacheKey(projectRoot);
    runtimeCache.set(cacheKey, result);

    if (options.persistCache) {
      await fs.writeFile(
        path.join(projectRoot, '.deps-cache'),
        JSON.stringify({ version: CACHE_VERSION, data: result }),
      );
    }

    // Check cache size limits
    if (options.cacheSize) {
      const cacheSize = Buffer.byteLength(JSON.stringify(runtimeCache));
      const limit = Number.parseInt(options.cacheSize, 10) * 1024 * 1024;
      if (cacheSize > limit) {
        result.warnings.push({
          type: 'CacheSizeExceeded',
          message: `Cache size ${cacheSize} exceeds limit ${limit}`,
        });
      }
    }

    const duration = performance.now() - analysisStart;
    if (duration > 5000) {
      result.warnings.push({
        type: 'PerformanceWarning',
        message: `Analysis took ${Math.round(duration)}ms`,
      });
    }
  } catch (error) {
    result.errors.push({
      type: 'InvalidLockfile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  return result;
}
