export const FILE_PATTERNS = {
  PACKAGE_JSON: 'package.json',
  YARN_LOCK: 'yarn.lock',
  PNPM_LOCK: 'pnpm-lock.yaml',
  NODE_MODULES: 'node_modules',
  CONFIG_REGEX: /\.(config|rc)(\.|\b)/,
  PACKAGE_NAME_REGEX: /^[\w./@-]+$/,
} as const;
