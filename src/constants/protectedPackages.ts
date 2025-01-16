/*
 * Essential packages that should never be removed automatically,
 * unless the `-a, --aggressive` flag is used.
 ******************************************************************/
export const PROTECTED_PACKAGES = new Set([
  'depsweep',
  'typescript',
  '@types/node',
  'tslib',
  'prettier',
  'eslint',
]);
