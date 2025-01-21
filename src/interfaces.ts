export interface DependencyContext {
  scripts?: Record<string, string>;
  configs?: Record<string, any>;
}

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  scripts?: Record<string, string>;
}

export interface WorkspaceInfo {
  root: string;
  packages: string[];
}
