/* eslint-disable unicorn/prefer-json-parse-buffer */
import { readdirSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';
import { findUp } from 'find-up';
import { globby } from 'globby';
import { isBinaryFileSync } from 'isbinaryfile';

import { FILE_PATTERNS, MESSAGES } from './constants.js';
import {
  isConfigFile,
  parseConfigFile,
  getMemoryUsage,
  processResults,
  isDependencyUsedInFile,
} from './helpers.js';
import type {
  DependencyContext,
  PackageJson,
  WorkspaceInfo,
} from './interfaces.js';

import { customSort } from './index.js';

interface DependencyInfo {
  usedInFiles: string[];
  requiredByPackages: Set<string>;
  hasSubDependencyUsage: boolean;
}

const depInfoCache = new Map<string, DependencyInfo>();

function normalizeTypesPackage(typesPackage: string): string {
  // Remove @types/ prefix
  const basePackage = typesPackage.replace('@types/', '');
  // Convert double underscore to @
  // e.g., babel__traverse -> @babel/traverse
  if (basePackage.includes('__')) {
    return `@${basePackage.replace('__', '/')}`;
  }
  // Handle regular packages
  return basePackage.includes('/') ? `@${basePackage}` : basePackage;
}

interface ProgressOptions {
  onProgress?: (
    filePath: string,
    subdepIndex?: number,
    totalSubdeps?: number,
  ) => void;
  totalAnalysisSteps: number;
}

export async function getDependencyInfo(
  dependency: string,
  context: DependencyContext,
  sourceFiles: string[],
  topLevelDependencies: Set<string>, // Add this parameter
  progressOptions?: ProgressOptions,
): Promise<DependencyInfo> {
  // Check cache
  const cacheKey = `${context.projectRoot}:${dependency}`;
  if (depInfoCache.has(cacheKey)) {
    return depInfoCache.get(cacheKey)!;
  }

  const info: DependencyInfo = {
    usedInFiles: [],
    requiredByPackages: new Set(),
    hasSubDependencyUsage: false,
  };

  // Special handling for @types packages
  if (dependency.startsWith('@types/')) {
    const basePackage = normalizeTypesPackage(dependency);
    const tsConfig = await getTSConfig(context.projectRoot);

    // Check if this is a compiler-required types package
    if (basePackage === 'node' && hasTSFiles(sourceFiles)) {
      info.requiredByPackages.add('typescript');
      return info;
    }

    // Check if the base package is installed
    if (topLevelDependencies.has(basePackage)) {
      info.requiredByPackages.add(basePackage);
    }

    // Check if any TypeScript files use types from this package
    let subdepIndex = 0;
    for (const file of sourceFiles) {
      subdepIndex++;
      if (
        (file.endsWith('.ts') || file.endsWith('.tsx')) &&
        ((await isDependencyUsedInFile(dependency, file, context)) ||
          (await isDependencyUsedInFile(basePackage, file, context)))
      ) {
        info.usedInFiles.push(file);
      }
      progressOptions?.onProgress?.(file, subdepIndex);
      await new Promise((res) => setImmediate(res)); // Tiny pause
    }

    // If we have TypeScript files and tsconfig includes this in types/typeRoots, mark as used
    if (tsConfig && hasTSFiles(sourceFiles)) {
      const { types = [], typeRoots = [] } = tsConfig.compilerOptions || {};
      if (
        types.includes(basePackage) ||
        typeRoots.some((root: string) => root.includes(basePackage))
      ) {
        info.requiredByPackages.add('typescript');
      }
    }

    return info;
  }

  // Count subdependencies from the dependency graph
  const subdeps = context.dependencyGraph?.get(dependency) || new Set<string>();
  const subdepsArray = [...subdeps]; // Convert to array for indexed access
  const totalSubdeps = subdepsArray.length;

  // Check direct file usage
  for (const file of sourceFiles) {
    // Check subdependencies first
    if (subdepsArray.length > 0) {
      for (const [index, subdep] of subdepsArray.entries()) {
        if (await isDependencyUsedInFile(subdep, file, context)) {
          info.hasSubDependencyUsage = true;
        }
        // Report each subdep check
        progressOptions?.onProgress?.(file, index + 1, totalSubdeps);
      }
    } else {
      // If no subdeps, still call progress
      progressOptions?.onProgress?.(file);
    }

    if (await isDependencyUsedInFile(dependency, file, context)) {
      info.usedInFiles.push(file);
    }
  }

  // Check package dependencies
  const nodeModulesPath = path.join(context.projectRoot, 'node_modules');
  try {
    const packages = new Set<string>();
    const entries = readdirSync(nodeModulesPath, { withFileTypes: true });

    // Get list of package directories once
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('@')) {
        const scopedDir = path.join(nodeModulesPath, entry.name);
        const scopedEntries = readdirSync(scopedDir, { withFileTypes: true });
        for (const sub of scopedEntries) {
          if (sub.isDirectory()) {
            packages.add(path.join(entry.name, sub.name));
          }
        }
      } else {
        packages.add(entry.name);
      }
    }

    // Bulk read package.json files
    const packageJsonPromises = [...packages].map(async (package_) => {
      try {
        const data = await fs.readFile(
          path.join(nodeModulesPath, package_, 'package.json'),
          'utf8', // Add utf8 encoding to get string instead of Buffer
        );
        return { pkg: package_, data: JSON.parse(data) };
      } catch {
        return null;
      }
    });

    const packageJsonResults = await Promise.all(packageJsonPromises);

    // Build dependency graph to track chains
    const dependencyGraph = new Map<string, Set<string>>();

    // First pass: build direct dependency relationships
    for (const result of packageJsonResults) {
      if (!result) continue;
      const { pkg, data } = result;
      const allDeps = {
        ...data.dependencies,
        ...data.peerDependencies,
        ...data.optionalDependencies,
      };

      // Track what each package requires
      dependencyGraph.set(pkg, new Set(Object.keys(allDeps)));
    }

    // Find all packages that eventually require our dependency
    const findTopLevelDependents = (dep: string): Set<string> => {
      const dependents = new Set<string>();

      for (const [package_, deps] of dependencyGraph.entries()) {
        if (deps.has(dep)) {
          // If this is a top-level dependency, add it
          if (topLevelDependencies.has(package_)) {
            dependents.add(package_);
          } else {
            // Otherwise, find what requires this package
            const parentDeps = findTopLevelDependents(package_);
            for (const parentDep of parentDeps) {
              dependents.add(parentDep);
            }
          }
        }
      }

      return dependents;
    };

    // Get all packages that require this dependency (directly or indirectly)
    const allRequiringPackages = findTopLevelDependents(dependency);
    info.requiredByPackages = allRequiringPackages;
  } catch {
    // Ignore errors
  }

  // Cache the result
  depInfoCache.set(cacheKey, info);
  return info;
}

async function getTSConfig(projectRoot: string): Promise<any> {
  try {
    const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
    const content = await fs.readFile(tsConfigPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function hasTSFiles(files: string[]): boolean {
  return files.some((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
}

// Add workspace detection
export async function getWorkspaceInfo(
  packageJsonPath: string,
): Promise<WorkspaceInfo | undefined> {
  try {
    const content = await fs.readFile(packageJsonPath);
    const package_ = JSON.parse(content.toString('utf8')) as PackageJson;

    if (!package_.workspaces) return undefined;

    const patterns = Array.isArray(package_.workspaces)
      ? package_.workspaces
      : package_.workspaces.packages || [];

    const packagePaths = await globby(patterns, {
      cwd: path.dirname(packageJsonPath),
      onlyDirectories: true,
      expandDirectories: false,
      ignore: ['node_modules'],
    });

    return {
      root: packageJsonPath,
      packages: packagePaths,
    };
  } catch {
    return undefined;
  }
}

export async function findClosestPackageJson(
  startDirectory: string,
): Promise<string> {
  const packageJsonPath = await findUp(FILE_PATTERNS.PACKAGE_JSON, {
    cwd: startDirectory,
  });
  if (!packageJsonPath) {
    console.error(chalk.red(MESSAGES.noPackageJson));
    process.exit(1);
  }

  // Check if this is part of a monorepo
  let currentDirectory = path.dirname(packageJsonPath);
  while (true) {
    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    const potentialRootPackageJson = path.join(
      parentDirectory,
      FILE_PATTERNS.PACKAGE_JSON,
    );
    try {
      const rootPackageString = await fs.readFile(potentialRootPackageJson);
      const rootPackage = JSON.parse(rootPackageString.toString('utf8')) as {
        workspaces?: string[];
      };
      if (rootPackage.workspaces) {
        console.log(chalk.yellow(MESSAGES.monorepoDetected));
        return potentialRootPackageJson;
      }
    } catch {
      // No package.json found at this level
    }
    const workspaceInfo = await getWorkspaceInfo(potentialRootPackageJson);

    if (workspaceInfo) {
      const relativePath = path.relative(
        path.dirname(workspaceInfo.root),
        packageJsonPath,
      );
      const isWorkspacePackage = workspaceInfo.packages.some(
        (p: string) => relativePath.startsWith(p) || p.startsWith(relativePath),
      );

      if (isWorkspacePackage) {
        console.log(chalk.yellow('\nMonorepo workspace package detected.'));
        console.log(chalk.yellow(`Root: ${workspaceInfo.root}`));
        return packageJsonPath; // Analyze the workspace package
      }
    }
    currentDirectory = parentDirectory;
  }

  return packageJsonPath;
}

export async function getDependencies(
  packageJsonPath: string,
): Promise<string[]> {
  const packageJsonString =
    (await fs.readFile(packageJsonPath, 'utf8')) || '{}';
  const packageJson = JSON.parse(packageJsonString);

  const dependencies = packageJson.dependencies
    ? Object.keys(packageJson.dependencies)
    : [];
  const devDependencies = packageJson.devDependencies
    ? Object.keys(packageJson.devDependencies)
    : [];
  const peerDependencies = packageJson.peerDependencies
    ? Object.keys(packageJson.peerDependencies)
    : [];
  const optionalDependencies = packageJson.optionalDependencies
    ? Object.keys(packageJson.optionalDependencies)
    : [];

  const allDependencies = [
    ...dependencies,
    ...devDependencies,
    ...peerDependencies,
    ...optionalDependencies,
  ];

  // Sort all dependencies using custom sort function
  allDependencies.sort(customSort);

  return allDependencies;
}

export async function getPackageContext(
  packageJsonPath: string,
): Promise<DependencyContext> {
  const projectDirectory = path.dirname(packageJsonPath);
  const configs: Record<string, any> = {};
  const dependencyGraph = new Map<string, Set<string>>(); // Re-added dependencyGraph

  // Populate dependencyGraph as needed
  // Example: Populate with existing dependencies
  const dependencies = await getDependencies(packageJsonPath);
  for (const dep of dependencies) {
    // Example: Initialize with empty sets or actual subdependencies
    dependencyGraph.set(dep, new Set<string>());
  }

  // Read all files in the project
  const allFiles = await getSourceFiles(projectDirectory);

  // Process config files
  for (const file of allFiles) {
    if (isConfigFile(file)) {
      const relativePath = path.relative(projectDirectory, file);
      try {
        configs[relativePath] = await parseConfigFile(file);
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Get package.json content
  const packageJsonString =
    (await fs.readFile(packageJsonPath, 'utf8')) || '{}';
  const packageJson = JSON.parse(packageJsonString) as PackageJson & {
    eslintConfig?: { extends?: string | string[] };
    prettier?: unknown;
    stylelint?: { extends?: string | string[] };
  };

  return {
    scripts: packageJson.scripts,
    configs: {
      'package.json': packageJson,
      ...configs,
    },
    projectRoot: path.dirname(packageJsonPath),
    dependencyGraph, // Included dependencyGraph
  };
}

export async function getSourceFiles(
  projectDirectory: string,
  ignorePatterns: string[] = [],
): Promise<string[]> {
  const files = await globby(['**/*'], {
    cwd: projectDirectory,
    gitignore: true,
    ignore: [
      FILE_PATTERNS.NODE_MODULES,
      'dist',
      'coverage',
      'build',
      '.git',
      '*.log',
      '*.lock',
      ...ignorePatterns,
    ],
    absolute: true,
  });

  return files.filter((file) => !isBinaryFileSync(file));
}

export function scanForDependency(config: any, dependency: string): boolean {
  if (!config || typeof config !== 'object') {
    return false;
  }

  if (Array.isArray(config)) {
    return config.some((item) => scanForDependency(item, dependency));
  }

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && value.includes(dependency)) {
      return true;
    }
    if (typeof value === 'object' && scanForDependency(value, dependency)) {
      return true;
    }
  }

  return false;
}

// Enhanced parallel processing with memory management
export async function processFilesInParallel(
  files: string[],
  dependency: string,
  context: DependencyContext,
  onProgress?: (processed: number, total: number) => void,
): Promise<string[]> {
  const { total: maxMemory } = getMemoryUsage();
  const BATCH_SIZE = Math.min(
    100,
    Math.max(10, Math.floor(maxMemory / (1024 * 1024 * 50))),
  );

  const results: string[] = [];
  let totalErrors = 0;

  const processFile = async (
    file: string,
  ): Promise<{ result: string | null; hasError: boolean }> => {
    try {
      const used = await isDependencyUsedInFile(dependency, file, context);
      return { result: used ? file : null, hasError: false };
    } catch (error) {
      console.error(
        chalk.red(`Error processing ${file}: ${(error as Error).message}`),
      );
      return { result: null, hasError: true };
    }
  };

  for (let index = 0; index < files.length; index += BATCH_SIZE) {
    const batch = files.slice(index, index + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (file) => processFile(file)),
    );
    const { validResults, errors } = processResults(batchResults);

    results.push(...validResults);
    totalErrors += errors;

    const processed = Math.min(index + batch.length, files.length);
    onProgress?.(processed, files.length);
  }

  if (totalErrors > 0) {
    console.warn(
      chalk.yellow(`\nWarning: ${totalErrors} files had processing errors`),
    );
  }

  return results;
}

export function findSubDependencies(
  dependency: string,
  context: DependencyContext,
): string[] {
  // Retrieve sub-dependencies from the dependencyGraph
  return context.dependencyGraph?.get(dependency)
    ? [...context.dependencyGraph.get(dependency)!]
    : [];
}
