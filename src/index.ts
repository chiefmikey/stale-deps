#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import { findUp } from 'find-up';
import { globby } from 'globby';
import ora from 'ora';

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

// Function to get package context
async function getPackageContext(packageJsonPath: string): Promise<DependencyContext> {
  const content = await fs.readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(content) as PackageJson;
  const context: DependencyContext = { scripts: pkg.scripts };

  // Check for common config files
  const configFiles = [
    'babel.config.js',
    'jest.config.js',
    'webpack.config.js',
    '.eslintrc.js',
    'rollup.config.js',
  ];

  const configs: Record<string, any> = {};
  for (const file of configFiles) {
    const configPath = path.join(path.dirname(packageJsonPath), file);
    try {
      if (await fs.access(configPath).then(() => true).catch(() => false)) {
        const config = await import(configPath).catch(() => ({}));
        configs[file] = config.default || config;
      }
    } catch {
      // Ignore config load errors
    }
  }
  context.configs = configs;

  return context;
}

// Enhanced dependency detection
async function isDependencyUsedInFile(
  dependency: string,
  filePath: string,
  context: DependencyContext
): Promise<boolean> {
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

  return isUsed;
}

// Parallel file processing
async function processFilesInParallel(
  files: string[],
  dependency: string,
  context: DependencyContext
): Promise<string[]> {
  const batchSize = Math.max(1, Math.min(cpus().length - 1, 4));
  const batches = Array.from({ length: Math.ceil(files.length / batchSize) }, (_, i) =>
    files.slice(i * batchSize, (i + 1) * batchSize)
  );

  const results = await Promise.all(
    batches.map(async (batch) =>
      Promise.all(
        batch.map(async (file) => ({
          file,
          used: await isDependencyUsedInFile(dependency, file, context),
        }))
      )
    )
  );

  return results.flat().filter((result) => result.used).map((result) => result.file);
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
  const program = new Command();

  program
    .version('1.0.0')
    .description('CLI tool that identifies and removes unused npm dependencies')
    .option('-v, --verbose', 'display detailed usage information')
    .option('-i, --ignore <patterns...>', 'patterns to ignore')
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

  const spinner = ora('Analyzing dependencies...').start();

  const dependencies = await getDependencies(packageJsonPath);
  const sourceFiles = await getSourceFiles(projectDirectory, options.ignore || []);

  const unusedDependencies: string[] = [];
  const dependencyUsage: Record<string, string[]> = {};

  for (const dep of dependencies) {
    const usageFiles = await processFilesInParallel(sourceFiles, dep, context);
    if (usageFiles.length === 0) {
      unusedDependencies.push(dep);
    }
    dependencyUsage[dep] = usageFiles;
  }

  spinner.succeed('Analysis complete!');

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
}

main();
