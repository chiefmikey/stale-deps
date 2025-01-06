# DepSweep 🧹

> Automated intelligent dependency cleanup

[![npm version](https://img.shields.io/npm/v/depsweep.svg)](https://www.npmjs.com/package/depsweep)
[![Downloads](https://img.shields.io/npm/dm/depsweep.svg)](https://www.npmjs.com/package/depsweep)
[![License](https://img.shields.io/npm/l/depsweep.svg)](https://github.com/chiefmikey/depsweep/blob/main/LICENSE)

## Features

- 🔍 **Smart Detection**: Analyzes your codebase to find unused dependencies.
- 🎯 **AST-Based Analysis**: Uses Abstract Syntax Tree parsing for precise
  detection.
- 🚀 **Modern JS/TS Support**: Supports the latest JavaScript and TypeScript
  features.
- 📦 **Package Manager Compatibility**: Works with npm, yarn, and pnpm.
- 🛡️ **Safe Mode**: Prevents accidental removal of specified packages.
- 🏗️ **Monorepo Support**: Seamlessly handles projects within monorepos.
- ⚡ **Efficient Processing**: Utilizes parallel processing for faster analysis.
- 🧩 **Config File Scanning**: Detects dependencies used in configuration files.
- 🔧 **Customizable Ignoring**: Allows specifying directory patterns to exclude
  from scanning.
- 🧠 **Memory Management**: Efficiently manages memory usage during analysis.
- 🏆 **Impact Reporting**: See the impact of removing unused dependencies.

**Supports**:

- ✅ ES Modules and CommonJS
- ✅ TypeScript and JSX
- ✅ Dynamic Imports
- ✅ Configuration Files
- ✅ Workspace Packages
- ✅ Binary File Detection
- ✅ Monorepos

## Usage

### Single Run

```bash
# Using npx
npx depsweep

# Using yarn
yarn dlx depsweep

# Using pnpm
pnpm dlx depsweep
```

### Install

```bash
# Using npm
npm install -g depsweep

# Using yarn
yarn global add depsweep

# Using pnpm
pnpm add -g depsweep
```

### Options

```txt
  -v, --verbose          Display detailed usage information
  -i, --ignore <paths>   Patterns to ignore during scanning
  -s, --safe <deps>      Enable safe mode to protect specified packages
  -a, --aggressive       Allow removal of protected packages
  -m, --measure          Measure unused dependency install time
  --dry-run              Show what would be removed without making changes
  --no-progress          Disable the progress bar
  -h, --help             Display help information
```

### Examples

```bash
# Run with verbose output
depsweep --verbose

# Specify packages to protect
depsweep --safe react react-dom

# Ignore specific directories or files
depsweep -i "test/**" "scripts/**"

# Preview changes without removing dependencies
depsweep --dry-run
```

## Protected Packages

A [list of protected packages](src/index.ts#L33) are ignored by default to
prevent accidental removal. Use the `-a, --aggressive` flag to override this
protection. Combine with the `-s, --safe` flag to enable removal for only some
protected packages.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an
issue.

## License

MIT © [chief mikey](https://github.com/chiefmikey)
