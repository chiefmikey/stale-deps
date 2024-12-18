export type CacheStatus =
  | 'hit'
  | 'miss'
  | 'invalidated'
  | 'rebuilt'
  | 'version_mismatch';

export interface AnalysisWarning {
  type:
    | 'CacheSizeExceeded'
    | 'BrokenSymlink'
    | 'PathConflict'
    | 'CircularDependency'
    | 'SuspiciousScript'
    | 'PackageReadError'
    | 'NodeModulesError'
    | 'PerformanceWarning';
  message: string;
}

export interface AnalysisError {
  type:
    | 'InvalidVersion'
    | 'InvalidLockfile'
    | 'NetworkTimeout'
    | 'PermissionDenied'
    | 'InvalidTSConfig'
    | 'PeerDependencyConflict';
  message: string;
}

export interface AnalysisOptions {
  cacheSize?: string;
  persistCache?: boolean;
  clearRuntimeCache?: boolean;
}

export interface AnalysisResult {
  cacheStatus: CacheStatus;
  warnings: AnalysisWarning[];
  errors: AnalysisError[];
  buildToolDependencies: string[];
  workspaceType?: 'pnpm' | 'yarn' | 'npm';
  resolvedDependencies: Record<string, string>;
  overriddenDependencies: string[];
  versionRanges: Record<string, string>;
  packages: string[];
  vulnerabilities: { package: string }[];
}
