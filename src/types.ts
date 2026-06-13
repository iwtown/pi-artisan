/**
 * pi-artisan — Shared types for all validators and utilities.
 */

/** A single validation issue */
export interface ValidationIssue {
  message: string;
}

/** Standard tool execution context (from Pi ExtensionAPI) */
export interface ToolContext {
  hasUI?: boolean;
  ui?: {
    notify: (msg: string, level: "info" | "warning" | "error") => void;
    setWidget: (id: string, lines: string[]) => void;
  };
  cwd?: string;
  sessionManager?: { cwd?: string };
  [key: string]: any;
}

/**
 * Validator function signature.
 * Takes content and optional file path, returns array of issue messages.
 */
export type ValidatorFn = (content: string, filePath?: string) => ValidationIssue[];

/**
 * Path-based validator (reads file from disk).
 */
export type PathValidatorFn = (filePath: string) => ValidationIssue[];

// ═══════════════════════════════════════════════════════════
//  Resource Catalog Types
// ═══════════════════════════════════════════════════════════

export type ResourceType = "skill" | "extension" | "prompt" | "theme" | "package";

export interface ResourceInfo {
  type: ResourceType;
  name: string;
  path: string;
  version: string | null;
  author: string | null;
  source: string | null;
  lastModified: string;
  qualityScore: number | null;
  status: "active" | "stale" | "archived";
}

export interface QualityScore {
  overall: number;
  dimensions: Record<string, number>;
}

export interface AgingInfo {
  path: string;
  type: ResourceType;
  name: string;
  lastModified: Date;
  daysSinceUpdate: number;
  status: "active" | "stale" | "archived";
}

export interface SkillObservation {
  publishedAt: string;
  publishedVersion: string;
  competitors: string[];
  nextCheckDate: string | null;
}

export interface VersionInfo {
  type: ResourceType;
  name: string;
  currentVersion: string;
  latestVersion: string | null;
  isUpToDate: boolean;
  observation?: SkillObservation;
}

export interface MaintainReport {
  aging: AgingInfo[];
  versions: VersionInfo[];
  staleCount: number;
  outdatedCount: number;
}
