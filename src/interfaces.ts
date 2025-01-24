export interface DependencyContext {
  scripts?: Record<string, string>;
  configs?: Record<string, any>;
  projectRoot: string;
  dependencyGraph?: Map<string, Set<string>>; // Added dependencyGraph
}

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  scripts?: Record<string, string>;
  repository?: { url: string };
  homepage?: string;
}

export interface WorkspaceInfo {
  root: string;
  packages: string[];
}

export interface ProgressOptions {
  onProgress?: (
    filePath: string,
    subdepIndex?: number,
    subdepCount?: number,
  ) => void;
  totalAnalysisSteps: number;
}

export interface DependencyInfo {
  usedInFiles: string[];
  requiredByPackages: Set<string>;
  hasSubDependencyUsage: boolean;
}
