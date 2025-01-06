#!/usr/bin/env node
/* eslint-disable unicorn/prefer-json-parse-buffer */

import { execSync, spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import v8 from 'node:v8';

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type {
  ImportDeclaration,
  CallExpression,
  TSImportType,
  TSExternalModuleReference,
} from '@babel/types';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import CliTable from 'cli-table3';
import { Command } from 'commander';
import { findUp } from 'find-up';
import { globby } from 'globby';
import { isBinaryFileSync } from 'isbinaryfile';
import micromatch from 'micromatch';
import ora from 'ora';
import type { Ora } from 'ora';
import shellEscape from 'shell-escape';

// Add protected packages that should never be removed
const PROTECTED_PACKAGES = new Set([
  'typescript',
  '@types/node',
  'tslib',
  'prettier',
  'eslint',
]);

// Common string literals
const CLI_STRINGS = {
  PROGRESS_FORMAT:
    'Analyzing dependencies |{bar}| {percentage}% | {value}/{total} Files',
  BAR_COMPLETE: '\u2588',
  BAR_INCOMPLETE: '\u2591',
  CLI_NAME: 'depsweep',
  CLI_VERSION: '1.0.0',
  CLI_DESCRIPTION:
    'CLI tool that identifies and removes unused npm dependencies',
  EXAMPLE_TEXT: '\nExample:\n  $ depsweep --verbose',
} as const;

const FILE_PATTERNS = {
  PACKAGE_JSON: 'package.json',
  YARN_LOCK: 'yarn.lock',
  PNPM_LOCK: 'pnpm-lock.yaml',
  NODE_MODULES: 'node_modules',
  CONFIG_REGEX: /\.(config|rc)(\.|\b)/,
  PACKAGE_NAME_REGEX: /^[\w./@-]+$/,
} as const;

const PACKAGE_MANAGERS = {
  NPM: 'npm',
  YARN: 'yarn',
  PNPM: 'pnpm',
  COMMANDS: {
    INSTALL: 'install',
    UNINSTALL: 'uninstall',
    REMOVE: 'remove',
  },
} as const;

const DEPENDENCY_PATTERNS = {
  TYPES_PREFIX: '@types/',
  DYNAMIC_IMPORT_BASE: String.raw`import\s*\(\s*['"]`,
  DYNAMIC_IMPORT_END: String.raw`['"]\s*\)`,
} as const;

// Replace existing MESSAGES constant
const MESSAGES = {
  title: 'DepSweep 🧹',
  noPackageJson: 'No package.json found.',
  monorepoDetected: '\nMonorepo detected. Using root package.json.',
  monorepoWorkspaceDetected: '\nMonorepo workspace package detected.',
  analyzingDependencies: 'Analyzing dependencies...',
  fatalError: '\nFatal error:',
  noUnusedDependencies: 'No unused dependencies found.',
  unusedFound: 'Unused dependencies found:',
  noChangesMade: '\nNo changes made',
  promptRemove: '\nDo you want to remove these dependencies? (y/N) ',
  dependenciesRemoved: 'Dependencies:',
  diskSpace: 'Disk Space:',
  carbonFootprint: 'Carbon Footprint:',
  measuringInstallTime: 'Measuring installation...',
  measureComplete: 'Measurement complete',
  installTime: 'Total Install Time:',
  analysisComplete: 'Analysis complete',
  signalCleanup: '\n{0} received. Cleaning up...',
  unexpected: '\nUnexpected error:',
} as const;

// Update interface for package.json structure
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  scripts?: Record<string, string>;
}

// Add interface for dependency context
interface DependencyContext {
  scripts?: Record<string, string>;
  configs?: Record<string, any>;
}

// Add interface for workspace info
interface WorkspaceInfo {
  root: string;
  packages: string[];
}
const traverseFunction = ((traverse as any).default || traverse) as (
  ast: any,
  options: any,
) => void;

// Add raw content patterns
const RAW_CONTENT_PATTERNS = new Map([
  ['webpack', ['webpack.*', 'webpack-*']],
  ['babel', ['babel.*', '@babel/*']],
  ['eslint', ['eslint.*', '@eslint/*']],
  ['jest', ['jest.*', '@jest/*']],
  ['typescript', ['ts-*', '@typescript-*']],
  ['rollup', ['rollup.*', 'rollup-*']],
  ['esbuild', ['esbuild.*', '@esbuild/*']],
  ['vite', ['vite.*', '@vitejs/*']],
  ['next', ['next.*', '@next/*']],
  ['vue', ['vue.*', '@vue/*', '@nuxt/*']],
  ['react', ['react.*', '@types/react*']],
  ['svelte', ['svelte.*', '@sveltejs/*']],
]);

// Add workspace detection
async function getWorkspaceInfo(
  packageJsonPath: string,
): Promise<WorkspaceInfo | undefined> {
  try {
    const content = await fs.readFile(packageJsonPath, 'utf8');
    const package_ = JSON.parse(content);

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

// Enhanced package.json finder with improved monorepo support
async function findClosestPackageJson(startDirectory: string): Promise<string> {
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
      const rootPackageString = await fs.readFile(
        potentialRootPackageJson,
        'utf8',
      );
      const rootPackage = JSON.parse(rootPackageString);
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
        (p) => relativePath.startsWith(p) || p.startsWith(relativePath),
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

// Function to read dependencies from package.json
async function getDependencies(packageJsonPath: string): Promise<string[]> {
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

  return [
    ...dependencies,
    ...devDependencies,
    ...peerDependencies,
    ...optionalDependencies,
  ];
}

// Add these helper functions
function isConfigFile(filePath: string): boolean {
  const filename = path.basename(filePath).toLowerCase();
  return (
    filename.includes('config') ||
    filename.startsWith('.') ||
    filename === FILE_PATTERNS.PACKAGE_JSON ||
    FILE_PATTERNS.CONFIG_REGEX.test(filename)
  );
}

async function parseConfigFile(filePath: string): Promise<unknown> {
  const extension = path.extname(filePath).toLowerCase();
  const content = await fs.readFile(filePath, 'utf8');

  try {
    switch (extension) {
      case '.json': {
        return JSON.parse(content);
      }
      case '.yaml':
      case '.yml': {
        const yaml = await import('yaml').catch(() => null);
        return yaml ? yaml.parse(content) : content;
      }
      case '.js':
      case '.cjs':
      case '.mjs': {
        // For JS files, return the raw content as we can't safely eval
        return content;
      }
      default: {
        // For unknown extensions, try JSON parse first, then return raw content
        try {
          return JSON.parse(content);
        } catch {
          return content;
        }
      }
    }
  } catch {
    // If parsing fails, return the raw content
    return content;
  }
}

// Update getSourceFiles function
async function getSourceFiles(
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

  // Filter out binary files and return
  return files.filter((file) => !isBinaryFileSync(file));
}

// Update getPackageContext function
async function getPackageContext(
  packageJsonPath: string,
): Promise<DependencyContext> {
  const projectDirectory = path.dirname(packageJsonPath);
  const configs: Record<string, any> = {};

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
  };
}

// Add a helper function to check if a type package corresponds to an installed package
async function isTypePackageUsed(
  dependency: string,
  installedPackages: string[],
  unusedDependencies: string[],
  context: DependencyContext,
  sourceFiles: string[],
): Promise<{ isUsed: boolean; supportedPackage?: string }> {
  if (!dependency.startsWith(DEPENDENCY_PATTERNS.TYPES_PREFIX)) {
    return { isUsed: false };
  }

  // Handle special case for @types/babel__* packages etc
  const correspondingPackage = dependency
    .replace(/^@types\//, '')
    .replaceAll('__', '/');

  // For scoped packages, add the @ prefix back
  const normalizedPackage = correspondingPackage.includes('/')
    ? `@${correspondingPackage}`
    : correspondingPackage;

  const supportedPackage = installedPackages.find(
    (package_) => package_ === normalizedPackage,
  );

  if (supportedPackage) {
    // Check if the corresponding package is used in the source files
    for (const file of sourceFiles) {
      if (await isDependencyUsedInFile(supportedPackage, file, context)) {
        return { isUsed: true, supportedPackage };
      }
    }
  }

  // Check if any installed package has this type package as a peer dependency
  for (const package_ of installedPackages) {
    try {
      const packageJsonPath = require.resolve(`${package_}/package.json`, {
        paths: [process.cwd()],
      });
      const packageJsonBuffer = await fs.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonBuffer);
      if (packageJson.peerDependencies?.[dependency]) {
        return { isUsed: true, supportedPackage: package_ };
      }
    } catch {
      // Ignore errors
    }
  }

  return { isUsed: false };
}

// Add helper function to recursively scan objects for dependency usage
// Add dependency pattern helpers
interface DependencyPattern {
  type: 'exact' | 'prefix' | 'suffix' | 'combined' | 'regex';
  match: string | RegExp;
  variations?: string[];
}

const COMMON_PATTERNS: DependencyPattern[] = [
  // Direct matches
  { type: 'exact', match: '' }, // Base name
  { type: 'prefix', match: '@' }, // Scoped packages

  // Common package organization patterns
  { type: 'prefix', match: '@types/' },
  { type: 'prefix', match: '@storybook/' },
  { type: 'prefix', match: '@testing-library/' },

  // Config patterns
  {
    type: 'suffix',
    match: 'config',
    variations: ['rc', 'settings', 'configuration', 'setup', 'options'],
  },

  // Plugin patterns
  {
    type: 'suffix',
    match: 'plugin',
    variations: ['plugins', 'extension', 'extensions', 'addon', 'addons'],
  },

  // Preset patterns
  {
    type: 'suffix',
    match: 'preset',
    variations: ['presets', 'recommended', 'standard', 'defaults'],
  },

  // Tool patterns
  {
    type: 'combined',
    match: '',
    variations: ['cli', 'core', 'utils', 'tools', 'helper', 'helpers'],
  },

  // Framework integration patterns
  {
    type: 'regex',
    match: /[/-](react|vue|svelte|angular|node)$/i,
  },

  // Common package naming patterns
  {
    type: 'regex',
    match: /[/-](loader|parser|transformer|formatter|linter|compiler)s?$/i,
  },
];

function generatePatternMatcher(dependency: string): RegExp[] {
  const patterns: RegExp[] = [];
  const escapedDep = dependency.replaceAll(
    /[$()*+.?[\\\]^{|}]/g,
    String.raw`\$&`,
  );

  for (const pattern of COMMON_PATTERNS) {
    switch (pattern.type) {
      case 'exact': {
        patterns.push(new RegExp(`^${escapedDep}$`));
        break;
      }
      case 'prefix': {
        patterns.push(new RegExp(`^${pattern.match}${escapedDep}(/.*)?$`));
        break;
      }
      case 'suffix': {
        const suffixes = [pattern.match, ...(pattern.variations || [])];
        for (const suffix of suffixes) {
          patterns.push(
            new RegExp(`^${escapedDep}[-./]${suffix}$`),
            new RegExp(`^${escapedDep}[-./]${suffix}s$`),
          );
        }
        break;
      }
      case 'combined': {
        const parts = [pattern.match, ...(pattern.variations || [])];
        for (const part of parts) {
          patterns.push(
            new RegExp(`^${escapedDep}[-./]${part}$`),
            new RegExp(`^${part}[-./]${escapedDep}$`),
          );
        }
        break;
      }
      case 'regex': {
        if (pattern.match instanceof RegExp) {
          patterns.push(
            new RegExp(
              `^${escapedDep}${pattern.match.source}`,
              pattern.match.flags,
            ),
          );
        }
        break;
      }
    }
  }

  return patterns;
}

// Replace the old scanForDependency function
function scanForDependency(object: unknown, dependency: string): boolean {
  if (typeof object === 'string') {
    const matchers = generatePatternMatcher(dependency);
    return matchers.some((pattern) => pattern.test(object));
  }

  if (Array.isArray(object)) {
    return object.some((item) => scanForDependency(item, dependency));
  }

  if (object && typeof object === 'object') {
    return Object.values(object).some((value) =>
      scanForDependency(value, dependency),
    );
  }

  return false;
}

async function isDependencyUsedInFile(
  dependency: string,
  filePath: string,
  context: DependencyContext,
): Promise<boolean> {
  // For package.json, do a deep scan of all configurations
  if (
    path.basename(filePath) === FILE_PATTERNS.PACKAGE_JSON &&
    context.configs?.['package.json'] && // Deep scan all of package.json content
    scanForDependency(context.configs['package.json'], dependency)
  ) {
    return true;
  }

  // Check if the file is a config file we've parsed
  const configKey = path.relative(path.dirname(filePath), filePath);
  const config = context.configs?.[configKey];
  if (config) {
    if (typeof config === 'string') {
      // If the config is a string, treat it as raw content
      if (config.includes(dependency)) {
        return true;
      }
    } else if (scanForDependency(config, dependency)) {
      return true;
    }
  }

  // Check scripts for exact matches
  if (context.scripts) {
    for (const script of Object.values(context.scripts)) {
      const scriptParts = script.split(' ');
      if (scriptParts.includes(dependency)) {
        return true;
      }
    }
  }

  // Check file imports
  try {
    if (isBinaryFileSync(filePath)) {
      return false;
    }

    const content = await fs.readFile(filePath, 'utf8');

    // Check for dynamic imports in raw content
    const dynamicImportRegex = new RegExp(
      `${DEPENDENCY_PATTERNS.DYNAMIC_IMPORT_BASE}${dependency.replaceAll(/[/@-]/g, '[/@-]')}${DEPENDENCY_PATTERNS.DYNAMIC_IMPORT_END}`,
      'i',
    );
    if (dynamicImportRegex.test(content)) {
      return true;
    }

    // AST parsing for imports/requires
    try {
      const ast = parse(content, {
        sourceType: 'unambiguous',
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'dynamicImport',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'importMeta',
        ],
      });

      let isUsed = false;
      traverseFunction(ast, {
        ImportDeclaration(importPath: NodePath<ImportDeclaration>) {
          const importSource = importPath.node.source.value;
          if (matchesDependency(importSource, dependency)) {
            isUsed = true;
            importPath.stop();
          }
        },
        CallExpression(importPath: NodePath<CallExpression>) {
          if (
            importPath.node.callee.type === 'Identifier' &&
            importPath.node.callee.name === 'require' &&
            importPath.node.arguments[0]?.type === 'StringLiteral' &&
            matchesDependency(importPath.node.arguments[0].value, dependency)
          ) {
            isUsed = true;
            importPath.stop();
          }
        },
        // Add handlers for TypeScript type-only imports
        TSImportType(importPath: NodePath<TSImportType>) {
          const importSource = importPath.node.argument.value;
          if (matchesDependency(importSource, dependency)) {
            isUsed = true;
            importPath.stop();
          }
        },
        TSExternalModuleReference(
          importPath: NodePath<TSExternalModuleReference>,
        ) {
          const importSource = importPath.node.expression.value;
          if (matchesDependency(importSource, dependency)) {
            isUsed = true;
            importPath.stop();
          }
        },
      });

      if (isUsed) return true;

      // Only check raw patterns if not found in imports
      for (const [base, patterns] of RAW_CONTENT_PATTERNS.entries()) {
        if (
          dependency.startsWith(base) &&
          patterns.some((pattern) => micromatch.isMatch(dependency, pattern))
        ) {
          const searchPattern = new RegExp(
            `\\b${dependency.replaceAll(/[/@-]/g, '[/@-]')}\\b`,
            'i',
          );
          if (searchPattern.test(content)) {
            return true;
          }
        }
      }
    } catch {
      // Ignore parse errors
    }

    // Only check raw patterns if not found in imports
    for (const [base, patterns] of RAW_CONTENT_PATTERNS.entries()) {
      if (
        dependency.startsWith(base) &&
        patterns.some((pattern) => micromatch.isMatch(dependency, pattern))
      ) {
        const searchPattern = new RegExp(
          `\\b${dependency.replaceAll(/[/@-]/g, '[/@-]')}\\b`,
          'i',
        );
        if (searchPattern.test(content)) {
          return true;
        }
      }
    }
  } catch {
    // Ignore file read errors
  }

  return false;
}

// Add a helper function to match dependencies
function matchesDependency(importSource: string, dependency: string): boolean {
  const depWithoutScope = dependency.startsWith('@')
    ? dependency.split('/')[1]
    : dependency;
  const sourceWithoutScope = importSource.startsWith('@')
    ? importSource.split('/')[1]
    : importSource;

  return (
    importSource === dependency ||
    importSource.startsWith(`${dependency}/`) ||
    sourceWithoutScope === depWithoutScope ||
    sourceWithoutScope.startsWith(`${depWithoutScope}/`) ||
    (dependency.startsWith('@types/') &&
      (importSource === dependency.replace(/^@types\//, '') ||
        importSource.startsWith(`${dependency.replace(/^@types\//, '')}/`)))
  );
}

// Add memory check function
function getMemoryUsage(): { used: number; total: number } {
  const heapStats = v8.getHeapStatistics();
  return {
    used: heapStats.used_heap_size,
    total: heapStats.heap_size_limit,
  };
}

function processResults(
  batchResults: PromiseSettledResult<{
    result: string | null;
    hasError: boolean;
  }>[],
): { validResults: string[]; errors: number } {
  const validResults: string[] = [];
  let errors = 0;

  for (const result of batchResults) {
    if (result.status === 'fulfilled') {
      if (result.value.hasError) {
        errors++;
      } else if (result.value.result) {
        validResults.push(result.value.result);
      }
    }
  }

  return { validResults, errors };
}

// Enhanced parallel processing with memory management
async function processFilesInParallel(
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
    onProgress?.(Math.min(index + BATCH_SIZE, files.length), files.length);
  }

  if (totalErrors > 0) {
    console.warn(
      chalk.yellow(`\nWarning: ${totalErrors} files had processing errors`),
    );
  }

  return results;
}

// Add function to detect the package manager
async function detectPackageManager(projectDirectory: string): Promise<string> {
  if (
    await fs
      .access(path.join(projectDirectory, FILE_PATTERNS.YARN_LOCK))
      .then(() => true)
      .catch(() => false)
  ) {
    return PACKAGE_MANAGERS.YARN;
  } else if (
    await fs
      .access(path.join(projectDirectory, FILE_PATTERNS.PNPM_LOCK))
      .then(() => true)
      .catch(() => false)
  ) {
    return PACKAGE_MANAGERS.PNPM;
  }
  return PACKAGE_MANAGERS.NPM;
}

// Add these variables before the main function
let activeSpinner: Ora | null = null;
let activeProgressBar: cliProgress.SingleBar | null = null;
let activeReadline: readline.Interface | null = null;

// Add this function before the main function
function cleanup(): void {
  if (activeSpinner) {
    activeSpinner.stop();
  }
  if (activeProgressBar) {
    activeProgressBar.stop();
  }
  if (activeReadline) {
    activeReadline.close();
  }
  // Only exit if not in test environment
  if (process.env.NODE_ENV !== 'test') {
    process.exit(0);
  }
}

// Add a helper function to fetch package size from npm
async function getPackageSizeFromNpm(
  packageName: string,
): Promise<number | null> {
  try {
    // Minimal approach: fetch from npm registry
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    // Some packages store metadata in "dist.unpackedSize" for the latest version
    const versions = (data as { versions: Record<string, any> }).versions || {};
    if (typeof data === 'object' && data !== null && 'dist-tags' in data) {
      const latest = (data as { 'dist-tags': { latest: string } })['dist-tags']
        ?.latest;
      if (latest && versions[latest]?.dist?.unpackedSize) {
        return versions[latest].dist.unpackedSize;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Measure install time by running a subprocess
async function measureInstallTime(package_: string): Promise<number> {
  if (!isValidPackageName(package_)) {
    throw new Error(`Invalid package name: ${package_}`);
  }

  const start = Date.now();
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npm', ['install', package_], {
      stdio: 'ignore',
      cwd: process.cwd(),
      timeout: 300_000,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Install process exited with code ${code}.`));
    });
  });
  return (Date.now() - start) / 1000;
}

// Add this validation function
function isValidPackageName(name: string): boolean {
  return FILE_PATTERNS.PACKAGE_NAME_REGEX.test(name);
}

// Recursively compute dir size for accurate disk usage stats
function getDirectorySize(dir: string): number {
  let total = 0;
  const files = readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const fullPath = path.join(dir, f.name);
    total += f.isDirectory()
      ? getDirectorySize(fullPath)
      : statSync(fullPath).size;
  }
  return total;
}

// Add a helper function to format bytes into human-readable strings
function formatSize(bytes: number): string {
  if (bytes >= 1e9) {
    return `${(bytes / 1e9).toFixed(2)} GB`;
  } else if (bytes >= 1e6) {
    return `${(bytes / 1e6).toFixed(2)} MB`;
  } else if (bytes >= 1e3) {
    return `${(bytes / 1e3).toFixed(2)} KB`;
  }
  return `${bytes} Bytes`;
}

// Add this validation at the top with other constants
const VALID_PACKAGE_MANAGERS = new Set(['npm', 'yarn', 'pnpm']);

// Add safe execution wrapper
function safeExecSync(
  command: string[],
  options: {
    cwd: string;
    stdio?: 'inherit' | 'ignore';
    timeout?: number;
  },
): void {
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error('Invalid command array');
  }

  const [packageManager, ...arguments_] = command;

  if (!VALID_PACKAGE_MANAGERS.has(packageManager)) {
    throw new Error(`Invalid package manager: ${packageManager}`);
  }

  // Validate all arguments
  if (
    !arguments_.every(
      (argument) => typeof argument === 'string' && argument.length > 0,
    )
  ) {
    throw new Error('Invalid command arguments');
  }

  try {
    execSync(shellEscape(command), {
      stdio: options.stdio || 'inherit',
      cwd: options.cwd,
      timeout: options.timeout || 300_000,
      encoding: 'utf8',
    });
  } catch (error) {
    throw new Error(`Command execution failed: ${(error as Error).message}`);
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    // Add signal handlers at the start of main
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    const program = new Command();

    // Configure program output and prevent exit
    program.configureOutput({
      writeOut: (string_) => process.stdout.write(string_),
      writeErr: (string_) => process.stdout.write(string_),
    });
    program.exitOverride();

    // Configure the CLI program
    program
      .name(CLI_STRINGS.CLI_NAME)
      .usage('[options]')
      .version(CLI_STRINGS.CLI_VERSION)
      .description(CLI_STRINGS.CLI_DESCRIPTION)
      .option('-v, --verbose', 'display detailed usage information')
      .option('-i, --ignore <patterns...>', 'patterns to ignore')
      .option(
        '-s, --safe <deps...>',
        'additional dependencies to protect from removal',
      )
      .option('-a, --aggressive', 'allow removal of protected packages')
      .option('-m, --measure', 'measure saved installation time')
      .option('--dry-run', 'show what would be removed without making changes')
      .option('--no-progress', 'disable progress bar')
      .addHelpText('after', CLI_STRINGS.EXAMPLE_TEXT);

    program.exitOverride(() => {
      // Don't throw or exit - just let the help display
    });

    // Show help immediately if --help flag is present
    if (process.argv.includes('--help')) {
      const helpText = program.helpInformation();
      process.stdout.write(`${helpText}\n`);
      process.exit(0); // Exit after displaying help
    }

    program.parse(process.argv);

    const options = program.opts();
    if (options.help) {
      program.outputHelp();
      return;
    }

    const packageJsonPath = await findClosestPackageJson(process.cwd());

    const projectDirectory = path.dirname(packageJsonPath);
    const context = await getPackageContext(packageJsonPath);

    console.log(chalk.cyan(MESSAGES.title));
    console.log(chalk.bold('Dependency Analysis\n'));
    console.log(
      `Package.json found at: ${chalk.green(
        path.relative(process.cwd(), packageJsonPath),
      )}`,
    );

    process.on('uncaughtException', (error: Error): void => {
      console.error(chalk.red(MESSAGES.fatalError), error);
      process.exit(1);
    });

    process.on('unhandledRejection', (error: Error): void => {
      console.error(chalk.red(MESSAGES.fatalError), error);
      process.exit(1);
    });

    const dependencies = await getDependencies(packageJsonPath);
    dependencies.sort((a, b) =>
      a
        .replace(/^@/, '')
        .localeCompare(b.replace(/^@/, ''), 'en', { sensitivity: 'base' }),
    );
    const sourceFiles = await getSourceFiles(
      projectDirectory,
      options.ignore || [],
    );

    let unusedDependencies: string[] = [];
    const dependencyUsage: Record<string, string[]> = {};
    const typePackageSupport: Record<string, string> = {};

    let processedDependencies = 0;
    const totalFiles = dependencies.length * sourceFiles.length;

    let progressBar: cliProgress.SingleBar | null = null;
    if (options.progress) {
      progressBar = new cliProgress.SingleBar({
        format: CLI_STRINGS.PROGRESS_FORMAT,
        barCompleteChar: CLI_STRINGS.BAR_COMPLETE,
        barIncompleteChar: CLI_STRINGS.BAR_INCOMPLETE,
      });
      activeProgressBar = progressBar;
      progressBar.start(totalFiles, 0);
    }

    for (const dep of dependencies) {
      const offset = processedDependencies * sourceFiles.length;
      const usageFiles = await processFilesInParallel(
        sourceFiles,
        dep,
        context,
        (processed) => {
          if (progressBar) {
            progressBar.update(offset + processed);
          }
        },
      );

      processedDependencies++;
      if (progressBar) {
        progressBar.update(processedDependencies * sourceFiles.length);
      }

      if (usageFiles.length === 0) {
        unusedDependencies.push(dep);
      }
      dependencyUsage[dep] = usageFiles;
    }

    if (progressBar) {
      progressBar.stop();
    }
    console.log(chalk.green('✔'), MESSAGES.analysisComplete, '\n');

    // Filter out type packages that correspond to installed packages
    const installedPackages = dependencies.filter(
      (dep) => !dep.startsWith('@types/'),
    );
    const typePackageUsagePromises = unusedDependencies.map(async (dep) => {
      const { isUsed, supportedPackage } = await isTypePackageUsed(
        dep,
        installedPackages,
        unusedDependencies,
        context,
        sourceFiles,
      );
      if (isUsed && supportedPackage) {
        typePackageSupport[dep] = supportedPackage;
      }
      return { dep, isUsed };
    });
    const typePackageUsageResults = await Promise.all(typePackageUsagePromises);
    unusedDependencies = typePackageUsageResults
      .filter((result) => !result.isUsed)
      .map((result) => result.dep);

    // By default, run in safe mode (filter out protected packages)
    // Only include protected packages if aggressive flag is set
    let safeUnused: string[] = [];

    // Create a combined set of protected packages
    const protectedPackages = new Set([
      ...PROTECTED_PACKAGES,
      ...(options.safe || []),
    ]);

    // In aggressive mode, only use user-specified safe deps
    const safeSet = options.aggressive
      ? new Set(options.safe || [])
      : protectedPackages;

    if (safeSet.size > 0) {
      safeUnused = unusedDependencies.filter((dep) => safeSet.has(dep));
      unusedDependencies = unusedDependencies.filter(
        (dep) => !safeSet.has(dep),
      );
    }

    if (unusedDependencies.length === 0 && safeUnused.length === 0) {
      console.log(chalk.green(MESSAGES.noUnusedDependencies));
    } else if (unusedDependencies.length === 0 && safeUnused.length > 0) {
      console.log(chalk.bold(MESSAGES.unusedFound));
      for (const dep of safeUnused) {
        const isSafeListed = options.safe?.includes(dep);
        console.log(
          chalk.blue(`- ${dep} [${isSafeListed ? 'safe' : 'protected'}]`),
        );
      }
      console.log(chalk.blue(MESSAGES.noChangesMade));
    } else {
      console.log(chalk.bold(MESSAGES.unusedFound));
      for (const dep of unusedDependencies) {
        console.log(chalk.yellow(`- ${dep}`));
      }
      for (const dep of safeUnused) {
        const isSafeListed = options.safe?.includes(dep);
        console.log(
          chalk.blue(`- ${dep} [${isSafeListed ? 'safe' : 'protected'}]`),
        );
      }

      let totalSize = 0;
      const sizePromises = unusedDependencies.map(async (dep) => {
        const size = await getPackageSizeFromNpm(dep);
        return size ?? 0;
      });
      const sizeResults = await Promise.all(sizePromises);
      totalSize = sizeResults.reduce(
        (accumulator, value) => accumulator + value,
        0,
      );

      // Additional Impact Reporting
      const removedCount = unusedDependencies.length;
      const diskSpaceSaved = formatSize(totalSize);
      const carbonReduction = (removedCount * 0.002).toFixed(3);

      console.log(chalk.bold('\nImpact:'));
      console.log(
        `${MESSAGES.dependenciesRemoved} ${chalk.bold(removedCount)}`,
      );
      console.log(`${MESSAGES.diskSpace} ${chalk.bold(diskSpaceSaved)}`);
      console.log(
        `${MESSAGES.carbonFootprint} ${chalk.bold(`~${carbonReduction}`, 'kg', 'CO2e')}`,
      );

      if (options.measure) {
        console.log('');
        const measureSpinner = ora({
          text: MESSAGES.measuringInstallTime,
          spinner: 'dots',
        }).start();
        activeSpinner = measureSpinner;

        let totalInstallTime = 0;
        const totalPackages = unusedDependencies.length;
        const installResults: { dep: string; time: number }[] = [];

        for (let index = 0; index < totalPackages; index++) {
          const dep = unusedDependencies[index];
          let time = 0;
          try {
            time = await measureInstallTime(dep);
            totalInstallTime += time;
            installResults.push({ dep, time });
            measureSpinner.text = `${MESSAGES.measuringInstallTime} ${chalk.blue(`[${index + 1}/${totalPackages}]`)}`;
          } catch {
            // Ignore errors and continue
          }
        }

        measureSpinner.succeed(
          `${MESSAGES.measureComplete} ${chalk.blue(`[${totalPackages}/${totalPackages}]`)}`,
        );
        for (const entry of installResults)
          console.log(`${entry.dep}: ${entry.time.toFixed(2)}s`);
        console.log(
          `${MESSAGES.installTime} ${chalk.bold(`~${totalInstallTime.toFixed(2)}s`)}`,
        );
      }

      if (options.verbose) {
        const table = new CliTable({
          head: ['Dependency', 'Usage'],
          wordWrap: true,
          colWidths: [30, 70],
        });

        for (const dep of dependencies) {
          const usage = dependencyUsage[dep];
          const supportInfo = typePackageSupport[dep]
            ? ` (supports "${typePackageSupport[dep]}")`
            : '';
          let label = '';
          if (safeSet.has(dep)) {
            label = options.safe?.includes(dep) ? '[safe]' : '[protected]';
          }
          table.push([
            `${dep} ${chalk.blue(label)}`,
            usage.length > 0
              ? usage.map((u) => path.relative(projectDirectory, u)).join('\n')
              : chalk.yellow(`Not used${supportInfo}`),
          ]);
        }

        console.log();
        console.log(table.toString());
      }

      if (options.dryRun) {
        console.log(chalk.blue(MESSAGES.noChangesMade));
        return;
      }

      // Prompt to remove dependencies
      const rl = readline.createInterface({ input, output });
      activeReadline = rl;

      // Detect package manager once
      const packageManager = await detectPackageManager(projectDirectory);

      const answer = await rl.question(chalk.blue(MESSAGES.promptRemove));
      if (answer.toLowerCase() === 'y') {
        // Build uninstall command
        let uninstallCommand = '';
        switch (packageManager) {
          case PACKAGE_MANAGERS.NPM: {
            uninstallCommand = `npm uninstall ${unusedDependencies.join(' ')}`;
            break;
          }
          case PACKAGE_MANAGERS.YARN: {
            uninstallCommand = `yarn remove ${unusedDependencies.join(' ')}`;
            break;
          }
          case PACKAGE_MANAGERS.PNPM: {
            uninstallCommand = `pnpm remove ${unusedDependencies.join(' ')}`;
            break;
          }
          default: {
            break;
          }
        }

        // Validate before using in execSync
        unusedDependencies = unusedDependencies.filter(isValidPackageName);

        if (unusedDependencies.length > 0) {
          try {
            safeExecSync([packageManager, 'uninstall', ...unusedDependencies], {
              stdio: 'inherit',
              cwd: projectDirectory,
              timeout: 300_000,
            });
          } catch (error) {
            console.error(chalk.red('Failed to uninstall packages:'), error);
            process.exit(1);
          }
        }
      } else {
        console.log(chalk.blue(MESSAGES.noChangesMade));
      }
      rl.close();
      activeReadline = null;
    }
  } catch (error) {
    cleanup();
    console.error(chalk.red(MESSAGES.fatalError), error);
    process.exit(1);
  }
}

// Replace the top-level await with an async init function
async function init(): Promise<void> {
  try {
    // Handle exit signals at the top level
    const exitHandler = (signal: string): void => {
      console.log(MESSAGES.signalCleanup.replace('{0}', signal));
      cleanup();
      // Exit without error since this is an intentional exit
      process.exit(0);
    };

    // Handle both SIGINT (Ctrl+C) and SIGTERM
    process.on('SIGINT', () => {
      exitHandler('SIGINT');
    });
    process.on('SIGTERM', () => {
      exitHandler('SIGTERM');
    });

    await main();
  } catch (error) {
    cleanup();
    console.error(chalk.red(MESSAGES.unexpected), error);
    process.exit(1);
  }
}

init().catch((error) => {
  console.error(chalk.red(MESSAGES.fatalError), error);
  process.exit(1);
});

export { getSourceFiles, findClosestPackageJson, getDependencies };
