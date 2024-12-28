# depsweep 🧹

> Automated intelligent dependency cleanup for JavaScript/TypeScript projects

[![npm version](https://img.shields.io/npm/v/depsweep.svg)](https://www.npmjs.com/package/depsweep)
[![Downloads](https://img.shields.io/npm/dm/depsweep.svg)](https://www.npmjs.com/package/depsweep)
[![License](https://img.shields.io/npm/l/depsweep.svg)](https://github.com/chiefmikey/depsweep/blob/main/LICENSE)

Automatically detect and remove unused dependencies in your JavaScript and
TypeScript projects with confidence.

## Features

- 🔍 **Smart Detection**: Analyzes your codebase to find unused dependencies.
- 🎯 **AST-Based Analysis**: Uses Abstract Syntax Tree parsing for precise
  detection.
- 🚀 **Modern JS/TS Support**: Supports the latest JavaScript and TypeScript
  features.
- 📦 **Package Manager Compatibility**: Works with npm, yarn, and pnpm.
- 🛡️ **Safe Mode**: Prevents accidental removal of essential packages.
- 🏗️ **Monorepo Support**: Seamlessly handles projects within monorepos.
- ⚡ **Efficient Processing**: Utilizes parallel processing for faster analysis.
- 🧩 **Config File Scanning**: Detects dependencies used in configuration files.
- 🔧 **Customizable Ignoring**: Allows specifying patterns to exclude from
  scanning.
- 🧠 **Memory Management**: Efficiently manages memory usage during analysis.

## Installation

### Global Installation

```bash
# Using npm
npm install -g depsweep

# Using yarn
yarn global add depsweep

# Using pnpm
pnpm add -g depsweep
```

### One-off Usage

```bash
# Using npx
npx depsweep

# Using yarn
yarn dlx depsweep

# Using pnpm
pnpm dlx depsweep
```

## Usage

Run in your project directory:

```bash
depsweep
```

### Options

```
Options:
  -v, --verbose          Display detailed usage information
  -i, --ignore <paths>   Patterns to ignore during scanning
  --safe                 Enable safe mode to protect essential packages
  --dry-run              Show what would be removed without making changes
  --no-progress          Disable the progress bar
  -h, --help             Display help information
```

### Examples

```bash
# Run with verbose output
depsweep --verbose

# Run in safe mode
depsweep --safe

# Ignore specific directories or files
depsweep -i "test/**" "scripts/**"

# Preview changes without removing dependencies
depsweep --dry-run
```

## How It Works

`depsweep` performs a comprehensive analysis of your project to identify and remove
unused dependencies:

1. **Deep Dependency Analysis**: Scans your codebase using AST parsing for
   accurate detection. This ensures that all import and require statements are
   correctly identified, even in complex scenarios.
2. **Smart Import Detection**: Handles various import patterns, including
   dynamic imports. This allows `depsweep` to detect dependencies that are
   conditionally loaded or imported using non-standard methods.
3. **Configuration File Parsing**: Analyzes configuration files to find
   additional dependencies. This includes parsing JSON, YAML, and JavaScript
   configuration files to ensure all dependencies are accounted for.
4. **Monorepo Awareness**: Detects monorepo structures and adjusts analysis
   accordingly. This ensures that dependencies used across multiple packages in
   a monorepo are correctly identified and not mistakenly marked as unused.
5. **Essential Package Protection**: Prevents removal of critical packages when
   in safe mode. This feature ensures that essential development tools and
   libraries are not accidentally removed.
6. **Efficient Processing**: Leverages parallel processing for faster execution.
   By processing files in parallel, `depsweep` can analyze large codebases more
   quickly and efficiently.
7. **Memory Management**: Monitors and manages memory usage during analysis to
   prevent crashes. This ensures that the tool can handle large projects without
   running out of memory.

## Supported Features

- ✅ ES Modules and CommonJS
- ✅ TypeScript and JSX
- ✅ Dynamic Imports
- ✅ Configuration Files
- ✅ Workspace Packages
- ✅ Binary File Detection
- ✅ Essential Package Protection
- ✅ Monorepo Support

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an
issue.

## License

MIT © [chiefmikey](https://github.com/chiefmikey)
