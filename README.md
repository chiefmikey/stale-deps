# stale 🧹

> Automated intelligent dependency cleanup for JavaScript/TypeScript projects

[![npm version](https://img.shields.io/npm/v/stale.svg)](https://www.npmjs.com/package/stale)
[![Downloads](https://img.shields.io/npm/dm/stale.svg)](https://www.npmjs.com/package/stale)
[![License](https://img.shields.io/npm/l/stale.svg)](https://github.com/chiefmikey/stale/blob/main/LICENSE)

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
npm install -g stale

# Using yarn
yarn global add stale

# Using pnpm
pnpm add -g stale
```

### One-off Usage

```bash
# Using npx
npx stale

# Using yarn
yarn dlx stale

# Using pnpm
pnpm dlx stale
```

## Usage

Run in your project directory:

```bash
stale
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
stale --verbose

# Run in safe mode
stale --safe

# Ignore specific directories or files
stale -i "test/**" "scripts/**"

# Preview changes without removing dependencies
stale --dry-run
```

## How It Works

`stale` performs a comprehensive analysis of your project to identify and remove
unused dependencies:

1. **Deep Dependency Analysis**: Scans your codebase using AST parsing for
   accurate detection. This ensures that all import and require statements are
   correctly identified, even in complex scenarios.
2. **Smart Import Detection**: Handles various import patterns, including
   dynamic imports. This allows `stale` to detect dependencies that are
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
   By processing files in parallel, `stale` can analyze large codebases more
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
