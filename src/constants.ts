export const MESSAGES = {
  title: 'DepSweep 🧹',
  noPackageJson: 'No package.json found',
  monorepoDetected: '\nMonorepo detected, using root package.json',
  monorepoWorkspaceDetected: '\nMonorepo workspace package detected',
  analyzingDependencies: 'Analyzing dependencies...',
  fatalError: '\nFatal error:',
  noUnusedDependencies: 'No unused dependencies found',
  unusedFound: 'Detected unused dependencies:',
  noChangesMade: 'No changes made',
  promptRemove: 'Do you want to remove these unused dependencies? (y/N) ',
  dependenciesRemoved: 'Dependencies:',
  diskSpace: 'Unpacked Disk Space:',
  carbonFootprint: 'Carbon Footprint:',
  measuringImpact: 'Impact Analysis',
  measureComplete: 'Measurement complete',
  installTime: 'Total Install Time:',
  signalCleanup: '\n{0} received, cleaning up...',
  unexpected: '\nUnexpected error:',
};

export const CLI_STRINGS = {
  PROGRESS_FORMAT:
    'Dependency Analysis |{bar}| [{currentDeps}/{totalDeps}] {dep}',
  BAR_COMPLETE: '\u2588',
  BAR_INCOMPLETE: '\u2591',
  CLI_NAME: 'depsweep',
  CLI_DESCRIPTION:
    'Automated intelligent dependency cleanup and impact analysis report',
  EXAMPLE_TEXT: '\nExample:\n  $ depsweep -v --measure-impact',
};

export const FRAMEWORK_PATTERNS = {
  ANGULAR: {
    CORE: '@angular/core',
    PATTERNS: ['@angular/*', '@angular-*', '@webcomponents/*'],
    DEV_DEPS: ['@angular-builders/*', '@angular-devkit/*', '@angular/cli'],
  },
  REACT: {
    CORE: 'react',
    PATTERNS: ['react-*', '@testing-library/react*', '@types/react*'],
    DEV_DEPS: ['react-scripts', 'react-app-rewired'],
  },
  VUE: {
    CORE: 'vue',
    PATTERNS: ['vue-*', '@vue/*', '@nuxt/*'],
    DEV_DEPS: ['@vue/cli-service', '@vue/cli-plugin-*'],
  },
};

export const RAW_CONTENT_PATTERNS = new Map([
  ['webpack', ['webpack.*', 'webpack-*']],
  ['babel', ['babel.*', '@babel/*']],
  ['eslint', ['eslint.*', '@eslint/*']],
  ['jest', ['jest.*', '@jest/*']],
  ['typescript', ['ts-*', '@typescript-*']],
  [
    'bundler',
    ['rollup.*', 'rollup-*', 'esbuild.*', '@esbuild/*', 'vite.*', '@vitejs/*'],
  ],
]);

export const DEPENDENCY_PATTERNS = {
  TYPES_PREFIX: '@types/',
  DYNAMIC_IMPORT_BASE: String.raw`import\s*\(\s*['"]`,
  DYNAMIC_IMPORT_END: String.raw`['"]\s*\)`,
};

export const FILE_PATTERNS = {
  PACKAGE_JSON: 'package.json',
  YARN_LOCK: 'yarn.lock',
  PNPM_LOCK: 'pnpm-lock.yaml',
  NODE_MODULES: 'node_modules',
  CONFIG_REGEX: /\.(config|rc)(\.|\b)/,
  PACKAGE_NAME_REGEX: /^[\w./@-]+$/,
};

export const PACKAGE_MANAGERS = {
  NPM: 'npm',
  YARN: 'yarn',
  PNPM: 'pnpm',
};

export const COMMANDS = {
  INSTALL: 'install',
  UNINSTALL: 'uninstall',
  REMOVE: 'remove',
};
