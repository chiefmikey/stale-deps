# stale-deps 🧹

> Intelligent dependency cleanup for JavaScript/TypeScript projects

[![npm version](https://img.shields.io/npm/v/stale-deps.svg)](https://www.npmjs.com/package/stale-deps)
[![Downloads](https://img.shields.io/npm/dm/stale-deps.svg)](https://www.npmjs.com/package/stale-deps)
[![License](https://img.shields.io/npm/l/stale-deps.svg)](https://github.com/chiefmikey/stale-deps/blob/main/LICENSE)

Automatically detect and remove unused dependencies in your JavaScript and TypeScript projects with confidence.

## Features

- 🔍 Smart detection of unused dependencies
- 🎯 Precise AST-based analysis
- 🚀 Support for modern JS/TS features
- 📦 Works with npm, yarn, and pnpm
- 🛡️ Safe mode to protect essential packages
- 🏗️ Monorepo support

## Installation

```bash
# Using npm
npm install -g stale-deps

# Using yarn
yarn global add stale-deps

# Using pnpm
pnpm add -g stale-deps
```

## Usage

Run in your project directory:

```bash
stale-deps
```

### Options

```
Options:
  -v, --verbose          Display detailed usage information
  -i, --ignore <paths>   Patterns to ignore
  --safe                 Prevent removing essential packages
  --dry-run              Show what would be removed without making changes
  --no-progress          Disable progress bar
  -h, --help             Display help information
```

### Examples

```bash
# Run with verbose output
stale-deps --verbose

# Run in safe mode
stale-deps --safe

# Ignore specific patterns
stale-deps -i "test/**" "scripts/**"

# Preview changes without removing
stale-deps --dry-run
```

## How It Works

stale-deps performs:

1. Deep dependency analysis using AST parsing
2. Smart detection of imports and requires
3. Configuration file scanning
4. Special package handling
5. Memory-efficient parallel processing

## Supported Features

- ✅ ES Modules and CommonJS
- ✅ TypeScript and JSX
- ✅ Dynamic imports
- ✅ Config file dependencies
- ✅ Workspace packages
- ✅ Binary file detection
- ✅ Essential package protection

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © [chiefmikey](https://github.com/chiefmikey)
