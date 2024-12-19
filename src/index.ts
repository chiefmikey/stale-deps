#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
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

// Add type imports at the top

// Update interface for package.json structure
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  scripts?: Record<string, string>;
}

// Define an extended interface
interface ExtendedPackageJson extends PackageJson {
  prettier?: unknown;
  eslintConfig?: unknown;
  stylelint?: unknown;
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

// Add essential packages that should never be removed
const ESSENTIAL_PACKAGES = new Set([
  'typescript',
  '@types/node',
  'tslib',
  'prettier',
  'eslint',
]);

// Add supported config file types
const CONFIG_FILES = [
  // JavaScript/TypeScript configs
  'babel.config.js',
  'babel.config.mjs',
  'babel.config.ts',
  'jest.config.js',
  'jest.config.mjs',
  'jest.config.ts',
  'webpack.config.js',
  'webpack.config.mjs',
  'webpack.config.ts',
  'rollup.config.js',
  'rollup.config.mjs',
  'rollup.config.ts',
  '.eslintrc.js',
  '.eslintrc.cjs',
  // JSON configs
  'tsconfig.json',
  '.eslintrc.json',
  'babel.config.json',
  // YAML configs
  '.eslintrc.yaml',
  '.eslintrc.yml',
  // Modern framework configs
  'vite.config.ts',
  'next.config.mjs',
  'astro.config.mjs',
  'remix.config.js',
  'svelte.config.js',
  'vue.config.js',
  'nuxt.config.ts',
];

// Convert CONFIG_FILES to include glob patterns
const CONFIG_FILE_GLOBS = CONFIG_FILES.flatMap((file) => [
  file,
  `**/${file}`, // Match files in any subdirectory
]);

// Add special package handlers
const SPECIAL_PACKAGES = new Map<string, (content: string) => boolean>([
  ['webpack', (content: string): boolean => content.includes('webpack.config')],
  [
    'babel',
    (content: string): boolean =>
      content.includes('babel.config') || content.includes('.babelrc'),
  ],
  [
    'eslint',
    (content: string): boolean =>
      content.includes('.eslintrc') ||
      content.includes('eslintConfig') ||
      content.includes('eslint.config'),
  ],
  [
    'jest',
    (content: string): boolean =>
      content.includes('jest.config') || content.includes('jest.setup'),
  ],
  ['postcss', (content: string): boolean => content.includes('postcss.config')],
  [
    'tailwindcss',
    (content: string): boolean => content.includes('tailwind.config'),
  ],
  ['rollup', (content: string): boolean => content.includes('rollup.config')],
  [
    'prettier',
    (content: string): boolean =>
      content.includes('.prettierrc') || content.includes('prettier.config'),
  ],
  [
    'tsconfig-paths',
    (content: string): boolean => content.includes('tsconfig'),
  ],
  ['type-fest', (): boolean => true],
  ['@types/', (): boolean => true],
]);

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
    const buffer = await fs.readFile(packageJsonPath);
    const package_ = JSON.parse(buffer.toString()) as PackageJson;

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
  const packageJsonPath = await findUp('package.json', { cwd: startDirectory });
  if (!packageJsonPath) {
    console.error(chalk.red('No package.json found.'));
    process.exit(1);
  }

  // Check if this is part of a monorepo
  let currentDirectory = path.dirname(packageJsonPath);
  while (true) {
    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    const potentialRootPackageJson = path.join(parentDirectory, 'package.json');
    try {
      const rootPackageBuffer = await fs.readFile(potentialRootPackageJson);
      const rootPackage = JSON.parse(
        rootPackageBuffer.toString(),
      ) as PackageJson;
      if (rootPackage.workspaces) {
        console.log(
          chalk.yellow('\nMonorepo detected. Using root package.json.'),
        );
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
  const packageJsonBuffer = await fs.readFile(packageJsonPath);
  const packageJson = JSON.parse(packageJsonBuffer.toString()) as PackageJson;

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

// Function to collect all source files
async function getSourceFiles(
  projectDirectory: string,
  ignorePatterns: string[] = [],
): Promise<string[]> {
  const files = await globby(
    ['**/*.{js,jsx,ts,tsx}', 'package.json', ...CONFIG_FILE_GLOBS],
    {
      cwd: projectDirectory,
      gitignore: true,
      ignore: ['node_modules', 'dist', 'coverage', ...ignorePatterns],
      absolute: true,
    },
  );
  return files;
}

// Add a helper function to check if a type package corresponds to an installed package
async function isTypePackageUsed(
  dependency: string,
  installedPackages: string[],
  unusedDependencies: string[],
  context: DependencyContext,
  sourceFiles: string[],
): Promise<{ isUsed: boolean; supportedPackage?: string }> {
  if (!dependency.startsWith('@types/')) {
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
      const packageJsonBuffer = await fs.readFile(packageJsonPath);
      const packageJson = JSON.parse(
        packageJsonBuffer.toString(),
      ) as PackageJson;
      if (packageJson.peerDependencies?.[dependency]) {
        return { isUsed: true, supportedPackage: package_ };
      }
    } catch {
      // Ignore errors
    }
  }

  return { isUsed: false };
}

// Enhanced package context retrieval
async function getPackageContext(
  packageJsonPath: string,
): Promise<DependencyContext> {
  const buffer = await fs.readFile(packageJsonPath);
  const package_ = JSON.parse(buffer.toString()) as PackageJson & {
    eslintConfig?: { extends?: string | string[] };
    prettier?: string;
    stylelint?: { extends?: string | string[] };
  };

  // Store package.json directly in configs
  const configs: Record<string, any> = { 'package.json': package_ };

  // Load external config files
  for (const file of CONFIG_FILE_GLOBS) {
    const configPath = path.join(path.dirname(packageJsonPath), file);
    try {
      if (
        await fs
          .access(configPath)
          .then(() => true)
          .catch(() => false)
      ) {
        if (file.endsWith('.json')) {
          const contentBuffer = await fs.readFile(configPath);
          configs[file] = JSON.parse(contentBuffer.toString());
        } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const yaml = await import('yaml').catch(() => null);
          if (yaml) {
            const content = await fs.readFile(configPath, 'utf8');
            configs[file] = yaml.parse(content);
          }
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
          const content = await fs.readFile(configPath, 'utf8');
          configs[file] = content;
        } else {
          const config = await import(configPath).catch(() => ({}));
          configs[file] = config.default || config;
        }
      }
    } catch {
      // Ignore config load errors
    }
  }

  return {
    scripts: package_.scripts,
    configs,
  };
}

// Add helper function to recursively scan objects for dependency usage
function scanForDependency(object: unknown, dependency: string): boolean {
  if (typeof object === 'string') {
    return (
      object === dependency ||
      object === `@${dependency}` ||
      object.startsWith(`${dependency}/`) ||
      object.startsWith(`@${dependency}/`) ||
      // Handle common config patterns
      object === `${dependency}/config` ||
      object === `@${dependency}/config` ||
      object === `${dependency}-config` ||
      object === `@${dependency}/eslint-config` ||
      object === `@${dependency}/prettier-config` ||
      object === `@${dependency}/stylelint-config`
    );
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
  // Check essential packages first
  if (ESSENTIAL_PACKAGES.has(dependency)) {
    return true;
  }

  // For package.json, do a deep scan of all configurations
  if (
    path.basename(filePath) === 'package.json' &&
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
      `import\\s*\\(\\s*['"]${dependency.replaceAll(/[/@-]/g, '[/@-]')}['"]\\s*\\)`,
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
        ImportDeclaration(path: NodePath<ImportDeclaration>) {
          const importSource = path.node.source.value;
          if (matchesDependency(importSource, dependency)) {
            isUsed = true;
            path.stop();
          }
        },
        CallExpression(path: NodePath<CallExpression>) {
          if (
            path.node.callee.type === 'Identifier' &&
            path.node.callee.name === 'require' &&
            path.node.arguments[0]?.type === 'StringLiteral' &&
            matchesDependency(path.node.arguments[0].value, dependency)
          ) {
            isUsed = true;
            path.stop();
          }
        },
        // Add handlers for TypeScript type-only imports
        TSImportType(path: NodePath<TSImportType>) {
          const importSource = path.node.argument.value;
          if (matchesDependency(importSource, dependency)) {
            isUsed = true;
            path.stop();
          }
        },
        TSExternalModuleReference(path: NodePath<TSExternalModuleReference>) {
          const importSource = path.node.expression.value;
          if (matchesDependency(importSource, dependency)) {
            isUsed = true;
            path.stop();
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
      .access(path.join(projectDirectory, 'yarn.lock'))
      .then(() => true)
      .catch(() => false)
  ) {
    return 'yarn';
  } else if (
    await fs
      .access(path.join(projectDirectory, 'pnpm-lock.yaml'))
      .then(() => true)
      .catch(() => false)
  ) {
    return 'pnpm';
  }
  return 'npm';
}

// Main execution
async function main(): Promise<void> {
  try {
    const program = new Command();

    program
      .version('1.0.0')
      .description(
        'CLI tool that identifies and removes unused npm dependencies',
      )
      .option('-v, --verbose', 'display detailed usage information')
      .option('-i, --ignore <patterns...>', 'patterns to ignore')
      .option('--safe', 'prevent removing essential packages')
      .option('--dry-run', 'show what would be removed without making changes')
      .option('--no-progress', 'disable progress bar')
      .parse(process.argv);

    const options = program.opts();
    const packageJsonPath = await findClosestPackageJson(process.cwd());

    const projectDirectory = path.dirname(packageJsonPath);
    const context = await getPackageContext(packageJsonPath);

    console.log(chalk.bold('\nStale Deps Analysis'));
    console.log(
      `Package.json found at: ${chalk.green(
        path.relative(process.cwd(), packageJsonPath),
      )}\n`,
    );

    const spinner = ora({
      text: 'Analyzing dependencies...',
      spinner: 'dots',
    }).start();

    process.on('uncaughtException', (error: Error): void => {
      spinner.fail('Analysis failed');
      console.error(chalk.red('\nFatal error:'), error);
      process.exit(1);
    });

    process.on('unhandledRejection', (error: Error): void => {
      spinner.fail('Analysis failed');
      console.error(chalk.red('\nFatal error:'), error);
      process.exit(1);
    });

    const dependencies = await getDependencies(packageJsonPath);
    const sourceFiles = await getSourceFiles(
      projectDirectory,
      options.ignore || [],
    );

    let unusedDependencies: string[] = [];
    const dependencyUsage: Record<string, string[]> = {};
    const typePackageSupport: Record<string, string> = {};

    const processedFiles = 0;
    const totalFiles = dependencies.length * sourceFiles.length;

    const progressBar = new cliProgress.SingleBar({
      format:
        'Analyzing dependencies |{bar}| {percentage}% || {value}/{total} Files',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    });

    if (!program.opts().noProgress) {
      progressBar.start(totalFiles, 0);
    }

    for (const dep of dependencies) {
      if (options.verbose) {
        console.log(`Checking dependency: ${dep}`);
      }
      const usageFiles = await processFilesInParallel(
        sourceFiles,
        dep,
        context,
        (processed) => {
          progressBar.update(processedFiles + processed);
        },
      );

      if (usageFiles.length === 0) {
        if (options.verbose) {
          console.log(`No usage found for: ${dep}`);
        }
        unusedDependencies.push(dep);
      } else if (options.verbose) {
        console.log(`Found ${usageFiles.length} uses of ${dep}`);
      }
      dependencyUsage[dep] = usageFiles;
    }

    progressBar.stop();
    spinner.succeed('Analysis complete!');

    // Filter out essential packages if in safe mode
    if (program.opts().safe) {
      unusedDependencies = unusedDependencies.filter(
        (dep) => !ESSENTIAL_PACKAGES.has(dep),
      );
    }

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
        table.push([
          dep,
          usage.length > 0
            ? usage.map((u) => path.relative(projectDirectory, u)).join('\n')
            : chalk.yellow(`Not used${supportInfo}`),
        ]);
      }

      console.log(table.toString());
    } else if (unusedDependencies.length > 0) {
      console.log(chalk.bold('Unused dependencies found:\n'));
      for (const dep of unusedDependencies) {
        console.log(chalk.yellow(`- ${dep}`));
      }

      if (program.opts().dryRun) {
        console.log(chalk.blue('\nDry run - no changes made'));
        return;
      }

      // Prompt to remove dependencies
      const rl = readline.createInterface({ input, output });

      // Detect package manager once
      const packageManager = await detectPackageManager(projectDirectory);

      const answer = await rl.question(
        chalk.blue('\nDo you want to remove these dependencies? (y/N) '),
      );
      if (answer.toLowerCase() === 'y') {
        // Build uninstall command
        let uninstallCommand = '';
        switch (packageManager) {
          case 'npm': {
            uninstallCommand = `npm uninstall ${unusedDependencies.join(' ')}`;
            break;
          }
          case 'yarn': {
            uninstallCommand = `yarn remove ${unusedDependencies.join(' ')}`;
            break;
          }
          case 'pnpm': {
            uninstallCommand = `pnpm remove ${unusedDependencies.join(' ')}`;
            break;
          }
          default: {
            break;
          }
        }

        execSync(uninstallCommand, {
          stdio: 'inherit',
          cwd: projectDirectory,
        });
      } else {
        console.log(chalk.blue('\nNo changes made.'));
      }
      rl.close();
    } else {
      console.log(chalk.green('No unused dependencies found.'));
    }
  } catch (error) {
    console.error(chalk.red('\nFatal error:'), error);
    process.exit(1);
  }
}

await main();
