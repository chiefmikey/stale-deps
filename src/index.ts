#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import v8 from 'node:v8';

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import { findUp } from 'find-up';
import { globby } from 'globby';
import ora from 'ora';
import { isBinaryFileSync } from 'isbinaryfile';
import cliProgress from 'cli-progress';
import retry from 'async-retry';
import micromatch from 'micromatch';

// Update interface for package.json structure
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
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

// Add essential packages that should never be removed
const ESSENTIAL_PACKAGES = new Set([
  'typescript',
  '@types/node',
  'tslib',
  'prettier',
  'eslint'
]);

// Add supported config file types
const CONFIG_FILES = [
  // JavaScript/TypeScript configs
  'babel.config.js', 'babel.config.mjs', 'babel.config.ts',
  'jest.config.js', 'jest.config.mjs', 'jest.config.ts',
  'webpack.config.js', 'webpack.config.mjs', 'webpack.config.ts',
  'rollup.config.js', 'rollup.config.mjs', 'rollup.config.ts',
  '.eslintrc.js', '.eslintrc.cjs',
  // JSON configs
  'tsconfig.json', '.eslintrc.json', 'babel.config.json',
  // YAML configs
  '.eslintrc.yaml', '.eslintrc.yml',
  // Modern framework configs
  'vite.config.ts',
  'next.config.mjs',
  'astro.config.mjs',
  'remix.config.js',
  'svelte.config.js',
  'vue.config.js',
  'nuxt.config.ts',
];

// Add special package handlers
const SPECIAL_PACKAGES = new Map([
  ['webpack', (content: string) => content.includes('webpack.config')],
  ['babel', (content: string) => content.includes('babel.config') || content.includes('.babelrc')],
  ['eslint', (content: string) => content.includes('.eslintrc') || content.includes('eslint.config')],
  ['jest', (content: string) => content.includes('jest.config') || content.includes('jest.setup')],
  ['postcss', (content: string) => content.includes('postcss.config')],
  ['tailwindcss', (content: string) => content.includes('tailwind.config')],
  ['rollup', (content: string) => content.includes('rollup.config')],
  ['prettier', (content: string) => content.includes('.prettierrc') || content.includes('prettier.config')],
  ['tsconfig-paths', (content: string) => content.includes('tsconfig')],
  ['type-fest', () => true], // Always consider used if found (type-only package)
  ['@types/', () => true], // Always consider used if found (type definitions)
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
async function getWorkspaceInfo(packageJsonPath: string): Promise<WorkspaceInfo | null> {
  try {
    const content = await fs.readFile(packageJsonPath, 'utf8');
    const pkg = JSON.parse(content) as PackageJson;

    if (!pkg.workspaces) return null;

    const patterns = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : pkg.workspaces.packages || [];

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
    return null;
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
  let currentDir = path.dirname(packageJsonPath);
  while (true) {
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    const potentialRootPackageJson = path.join(parentDir, 'package.json');
    try {
      const rootPkgContent = await fs.readFile(potentialRootPackageJson, 'utf8');
      const rootPkg = JSON.parse(rootPkgContent) as PackageJson;
      if (rootPkg.workspaces) {
        console.log(chalk.yellow('\nMonorepo detected. Using root package.json.'));
        return potentialRootPackageJson;
      }
    } catch {
      // No package.json found at this level
    }
    const workspaceInfo = await getWorkspaceInfo(potentialRootPackageJson);

    if (workspaceInfo) {
      const relativePath = path.relative(path.dirname(workspaceInfo.root), packageJsonPath);
      const isWorkspacePackage = workspaceInfo.packages.some(p =>
        relativePath.startsWith(p) || p.startsWith(relativePath)
      );

      if (isWorkspacePackage) {
        console.log(chalk.yellow('\nMonorepo workspace package detected.'));
        console.log(chalk.yellow(`Root: ${workspaceInfo.root}`));
        return packageJsonPath; // Analyze the workspace package
      }
    }
    currentDir = parentDir;
  }

  return packageJsonPath;
}

// Function to read dependencies from package.json
async function getDependencies(packageJsonPath: string): Promise<string[]> {
  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonContent) as PackageJson;

  const dependencies = packageJson.dependencies ? Object.keys(packageJson.dependencies) : [];
  const devDependencies = packageJson.devDependencies ? Object.keys(packageJson.devDependencies) : [];
  const peerDependencies = packageJson.peerDependencies ? Object.keys(packageJson.peerDependencies) : [];
  const optionalDependencies = packageJson.optionalDependencies ? Object.keys(packageJson.optionalDependencies) : [];

  return [...dependencies, ...devDependencies, ...peerDependencies, ...optionalDependencies];
}

// Function to collect all source files
async function getSourceFiles(projectDirectory: string, ignorePatterns: string[] = []): Promise<string[]> {
  return await globby(['**/*.{js,jsx,ts,tsx}'], {
    cwd: projectDirectory,
    gitignore: true,
    ignore: ['node_modules', 'dist', 'coverage', ...ignorePatterns],
    absolute: true,
  });
}

// Enhanced package context retrieval
async function getPackageContext(packageJsonPath: string): Promise<DependencyContext> {
  const content = await fs.readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(content) as PackageJson;
  const context: DependencyContext = { scripts: pkg.scripts };
  const configs: Record<string, any> = {};

  for (const file of CONFIG_FILES) {
    const configPath = path.join(path.dirname(packageJsonPath), file);
    try {
      if (await fs.access(configPath).then(() => true).catch(() => false)) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(configPath, 'utf8');
          configs[file] = JSON.parse(content);
        } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const yaml = await import('yaml').catch(() => null);
          if (yaml) {
            const content = await fs.readFile(configPath, 'utf8');
            configs[file] = yaml.parse(content);
          }
        } else {
          const config = await import(configPath).catch(() => ({}));
          configs[file] = config.default || config;
        }
      }
    } catch {
      // Ignore config load errors
    }
  }
  context.configs = configs;
  return context;
}

// Add function to safely retry file operations
async function safeFileOp<T>(operation: () => Promise<T>, filepath: string): Promise<T> {
  return retry(
    async (bail) => {
      try {
        return await operation();
      } catch (error) {
        if ((error as Error).message.includes('ENOENT')) {
          bail(error as Error);
          return undefined as T;
        }
        throw error;
      }
    },
    { retries: 3 }
  );
}

// Enhanced dependency detection
async function isDependencyUsedInFile(
  dependency: string,
  filePath: string,
  context: DependencyContext
): Promise<boolean> {
  // Check essential packages first
  if (ESSENTIAL_PACKAGES.has(dependency)) {
    return true;
  }

  // Check special packages first
  for (const [pkg, checker] of SPECIAL_PACKAGES.entries()) {
    if (dependency.startsWith(pkg)) {
      // For type packages, check if the related package is used
      if (dependency.startsWith('@types/')) {
        const basePackage = dependency.slice(7);
        if (basePackage === 'node') return true; // Always keep @types/node
        // Check if the base package is in dependencies
        const allDeps = Object.keys(context.configs?.['package.json'] || {});
        if (allDeps.includes(basePackage)) return true;
      }
      return checker(await fs.readFile(filePath, 'utf8').catch(() => ''));
    }
  }

  // Check scripts first
  if (context.scripts) {
    for (const script of Object.values(context.scripts)) {
      if (script.includes(dependency)) {
        return true;
      }
    }
  }

  // Check configs
  if (context.configs) {
    for (const config of Object.values(context.configs)) {
      if (
        JSON.stringify(config).includes(dependency) ||
        (typeof config === 'object' &&
         config.dependencies?.includes?.(dependency))
      ) {
        return true;
      }
    }
  }

  // Skip binary files
  if (isBinaryFileSync(filePath)) {
    return false;
  }

  // Continue with existing file content check
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    console.error(chalk.red(`Error reading ${filePath}: ${(error as Error).message}`));
    return false;
  }

  let isUsed = false;

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

    traverse(ast, {
      enter(path) {
        // Check import/export statements
        if (
          (path.isImportDeclaration() || path.isExportDeclaration()) &&
          'source' in path.node &&
          path.node.source?.value &&
          (path.node.source.value === dependency ||
            path.node.source.value.startsWith(`${dependency}/`))
        ) {
          isUsed = true;
          path.stop();
        }
        // Check require calls
        else if (
          path.isCallExpression() &&
          (
            path.node.callee.type === 'Import' ||
            (path.node.callee.type === 'Identifier' && path.node.callee.name === 'require')
          ) &&
          path.node.arguments[0] &&
          path.node.arguments[0].type === 'StringLiteral' &&
          path.node.arguments[0].value &&
          (path.node.arguments[0].value === dependency ||
            path.node.arguments[0].value.startsWith(`${dependency}/`))
        ) {
          isUsed = true;
          path.stop();
        }
        // Check dynamic imports
        else if (
          path.isImport() &&
          path.parentPath.isCallExpression() &&
          path.parentPath.node.arguments[0].type === 'StringLiteral' &&
          path.parentPath.node.arguments[0].value &&
          (path.parentPath.node.arguments[0].value === dependency ||
            path.parentPath.node.arguments[0].value.startsWith(`${dependency}/`))
        ) {
          isUsed = true;
          path.stop();
        }
      },
    });
  } catch (error) {
    console.error(chalk.red(`Error parsing ${filePath}: ${(error as Error).message}`));
  }

  // Add raw content pattern matching
  for (const [base, patterns] of RAW_CONTENT_PATTERNS.entries()) {
    if (dependency.startsWith(base)) {
      if (patterns.some(pattern => micromatch.isMatch(dependency, pattern))) {
        // Check content for any variation of the package name
        const searchPattern = base.replace(/[@/-]/g, '.');
        if (new RegExp(searchPattern, 'i').test(content)) {
          return true;
        }
      }
    }
  }

  return isUsed;
}

// Add memory check function
function getMemoryUsage(): { used: number; total: number } {
  const heapStats = v8.getHeapStatistics();
  return {
    used: heapStats.used_heap_size,
    total: heapStats.heap_size_limit,
  };
}

// Enhanced parallel processing with memory management
async function processFilesInParallel(
  files: string[],
  dependency: string,
  context: DependencyContext,
  onProgress?: (processed: number, total: number) => void
): Promise<string[]> {
  const { total: maxMemory } = getMemoryUsage();
  const BATCH_SIZE = Math.min(
    100,
    Math.max(10, Math.floor(maxMemory / (1024 * 1024 * 50))) // 50MB per batch
  );

  const results: string[] = [];
  let errors = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        try {
          const used = await isDependencyUsedInFile(dependency, file, context);
          return used ? file : null;
        } catch (error) {
          errors++;
          console.error(chalk.red(`Error processing ${file}: ${(error as Error).message}`));
          return null;
        }
      })
    );

    results.push(
      ...batchResults
        .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((r): r is string => r !== null)
    );

    onProgress?.(Math.min(i + BATCH_SIZE, files.length), files.length);
  }

  if (errors > 0) {
    console.warn(chalk.yellow(`\nWarning: ${errors} files had processing errors`));
  }

  return results;
}

// Add function to detect the package manager
async function detectPackageManager(projectDirectory: string): Promise<string> {
  if (await fs.access(path.join(projectDirectory, 'yarn.lock')).then(() => true).catch(() => false)) {
    return 'yarn';
  } else if (await fs.access(path.join(projectDirectory, 'pnpm-lock.yaml')).then(() => true).catch(() => false)) {
    return 'pnpm';
  } else {
    return 'npm';
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    const program = new Command();

    program
      .version('1.0.0')
      .description('CLI tool that identifies and removes unused npm dependencies')
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

    process.on('uncaughtException', (error) => {
      spinner.fail('Analysis failed');
      console.error(chalk.red('\nFatal error:'), error);
      process.exit(1);
    });

    process.on('unhandledRejection', (error) => {
      spinner.fail('Analysis failed');
      console.error(chalk.red('\nFatal error:'), error);
      process.exit(1);
    });

    const dependencies = await getDependencies(packageJsonPath);
    const sourceFiles = await getSourceFiles(projectDirectory, options.ignore || []);

    const unusedDependencies: string[] = [];
    const dependencyUsage: Record<string, string[]> = {};

    let processedFiles = 0;
    const totalFiles = dependencies.length * sourceFiles.length;

    const progressBar = new cliProgress.SingleBar({
      format: 'Analyzing dependencies |{bar}| {percentage}% || {value}/{total} Files',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    });

    if (!program.opts().noProgress) {
      progressBar.start(totalFiles, 0);
    }

    for (const dep of dependencies) {
      const usageFiles = await processFilesInParallel(
        sourceFiles,
        dep,
        context,
        (processed) => {
          progressBar.update(processedFiles + processed);
        }
      );
      if (usageFiles.length === 0) {
        unusedDependencies.push(dep);
      }
      dependencyUsage[dep] = usageFiles;
    }

    progressBar.stop();
    spinner.succeed('Analysis complete!');

    // Filter out essential packages if in safe mode
    if (program.opts().safe) {
      unusedDependencies = unusedDependencies.filter(dep => !ESSENTIAL_PACKAGES.has(dep));
    }

    if (options.verbose) {
      const table = new Table({
        head: ['Dependency', 'Usage'],
        wordWrap: true,
        colWidths: [30, 70],
      });

      for (const dep of dependencies) {
        const usage = dependencyUsage[dep];
        table.push([
          dep,
          usage.length > 0
            ? usage.map((u) => path.relative(projectDirectory, u)).join('\n')
            : chalk.yellow('Not used'),
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

      const answer = await rl.question(chalk.blue('\nDo you want to remove these dependencies? (y/N) '));
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
          // no default
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

main();
