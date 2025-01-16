export const DEPENDENCY_PATTERNS = {
  TYPES_PREFIX: '@types/',
  DYNAMIC_IMPORT_BASE: String.raw`import\s*\(\s*['"]`,
  DYNAMIC_IMPORT_END: String.raw`['"]\s*\)`,
} as const;
