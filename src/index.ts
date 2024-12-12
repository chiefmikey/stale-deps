#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import { findUpSync } from 'find-up';
import { globby } from 'globby';
import ora from 'ora';

// Add interface for package.json structure
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

// Enhanced package.json finder with monorepo support
function findClosestPackageJson(startDirectory: string): string {
  const packageJsonPath = findUpSync('package.json', { cwd: startDirectory });
  if (!packageJsonPath) {
    console.error(chalk.red('No package.json found.'));
    process.exit(1);
  }

  // Check if this is part of a monorepo
  const rootPackageJson = findUpSync('package.json', {
    cwd: path.dirname(packageJsonPath),
    stopAt: path.parse(packageJsonPath).root,
  });

  if (rootPackageJson && rootPackageJson !== packageJsonPath) {
    const rootPkg = JSON.parse(fs.readFileSync(rootPackageJson, 'utf8')) as PackageJson;
    if (rootPkg.workspaces) {
      console.log(chalk.yellow('\nMonorepo detected. Using root package.json.'));
      return rootPackageJson;
    }
  }

  return packageJsonPath;
}

// Function to read dependencies from package.json
function getDependencies(packageJsonPath: string): string[] {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dependencies = packageJson.dependencies
    ? Object.keys(packageJson.dependencies)
    : [];
  const devDependencies = packageJson.devDependencies
    ? Object.keys(packageJson.devDependencies)
    : [];
  return [...dependencies, ...devDependencies];
}

// Function to collect all source files
async function getSourceFiles(projectDirectory: string): Promise<string[]> {
  return await globby(['**/*.{js,jsx,ts,tsx}'], {
    cwd: projectDirectory,
    gitignore: true,
    absolute: true,
  });
}

// Enhanced dependency detection
function isDependencyUsedInFile(dependency: string, filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf8');
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
          'value' in path.parentPath.node.arguments[0] &&
          (path.parentPath.node.arguments[0] as any).value &&
          (path.parentPath.node.arguments[0].value === dependency ||
            typeof path.parentPath.node.arguments[0].value === 'string' &&
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

// Add function to detect the package manager
function detectPackageManager(projectDirectory: string): string {
  if (fs.existsSync(path.join(projectDirectory, 'yarn.lock'))) {
    return 'yarn';
  } else if (fs.existsSync(path.join(projectDirectory, 'pnpm-lock.yaml'))) {
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
  const packageJsonPath = findClosestPackageJson(process.cwd());

  const projectDirectory = path.dirname(packageJsonPath);

  console.log(chalk.bold('\nStale Deps Analysis'));
  console.log(
    `Package.json found at: ${chalk.green(
      path.relative(process.cwd(), packageJsonPath),
    )}\n`,
  );

  const spinner = ora('Analyzing dependencies...').start();

  const dependencies = getDependencies(packageJsonPath);
  const sourceFiles = await getSourceFiles(projectDirectory);

  const unusedDependencies: string[] = [];
  const dependencyUsage: Record<string, string[]> = {};

  for (const dep of dependencies) {
    const usageFiles = sourceFiles.filter((file) =>
      isDependencyUsedInFile(dep, file),
    );
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
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Detect package manager once
    const packageManager = detectPackageManager(projectDirectory);

    rl.question(
      chalk.blue('\nDo you want to remove these dependencies? (y/N) '),
      (answer) => {
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
      },
    );
  } else {
    console.log(chalk.green('No unused dependencies found.'));
  }
}

main();
