/**
 * Resource scanner - discovers installed Pi resources of all 5 types.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { GLOBAL_DIRS } from "../utils/path.js";
import { parseFrontmatter, extractNestedMapping } from "../utils/yaml.js";
import type { ResourceInfo, ResourceType, UpstreamInfo } from "../types.js";

const HOME = process.env.HOME || "/home/wtown";
const SETTINGS_PATH = join(HOME, ".pi", "agent", "settings.json");
const MANIFEST_PATH = join(HOME, ".pi", "agent", "skills", ".manifest.json");
const STALE_DAYS = 90;
const ARCHIVE_DAYS = 180;

/** Load .manifest.json to determine real source of installed skills */
function getManifestSource(skillName: string): string | null {
  try {
    if (!existsSync(MANIFEST_PATH)) return null;
    const raw = readFileSync(MANIFEST_PATH, "utf-8");
    const manifest = JSON.parse(raw);
    const entry = manifest?.skills?.[skillName];
    return entry?.source || null;
  } catch {
    return null;
  }
}

/** Parse version from a SKILL.md file's frontmatter. */
function parseSkillVersion(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const fm = parseFrontmatter(content);
    if (!fm) return null;
    const match = fm.match(/^version:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/** Parse author from a SKILL.md file's frontmatter. */
function parseSkillAuthor(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const fm = parseFrontmatter(content);
    if (!fm) return null;
    const match = fm.match(/^author:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/** Parse upstream declaration from frontmatter. */
function parseUpstream(filePath: string): UpstreamInfo | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const fm = parseFrontmatter(content);
    if (!fm) return null;
    const nested = extractNestedMapping(fm, "upstream");
    if (!nested) return null;
    const syncVal = nested["sync"];
    const sync = syncVal === "manual" || syncVal === "auto-patch" || syncVal === "never"
      ? syncVal
      : null;
    return {
      source: nested["source"] || null,
      version: nested["version"] || null,
      lastMerge: nested["last-merge"] || null,
      sync,
    };
  } catch {
    return null;
  }
}

/** Parse deprecated fields from a SKILL.md file's frontmatter. */
function parseSkillDeprecated(filePath: string): { deprecated: boolean; reason: string | null; at: string | null } | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const fm = parseFrontmatter(content);
    if (!fm) return null;
    const match = fm.match(/^deprecated:\s*(.+)$/m);
    if (!match) return { deprecated: false, reason: null, at: null };
    const val = match[1].trim().toLowerCase();
    if (val !== "true" && val !== "yes") return { deprecated: false, reason: null, at: null };
    const reasonMatch = fm.match(/^deprecated_reason:\s*(.+)$/m);
    const atMatch = fm.match(/^deprecated_at:\s*(.+)$/m);
    return {
      deprecated: true,
      reason: reasonMatch ? reasonMatch[1].trim().replace(/^["']|["']$/g, "") : null,
      at: atMatch ? atMatch[1].trim() : new Date().toISOString().slice(0, 10),
    };
  } catch {
    return null;
  }
}

/** Read .deprecated marker file for non-skill types. */
function readDeprecatedMarker(resourcePath: string): { reason: string | null; at: string | null } | null {
  const markerPath = resourcePath + ".deprecated";
  try {
    if (!existsSync(markerPath)) return null;
    const raw = readFileSync(markerPath, "utf-8");
    const data = JSON.parse(raw);
    return {
      reason: data.reason || null,
      at: data.at || null,
    };
  } catch {
    return null;
  }
}

/** Compute status from mtime. */
function computeStatus(mtime: Date): "active" | "stale" | "archived" {
  const days = (Date.now() - mtime.getTime()) / 86400000;
  if (days > ARCHIVE_DAYS) return "archived";
  if (days > STALE_DAYS) return "stale";
  return "active";
}

// ── Per-type scanners ──

function scanSkills(): ResourceInfo[] {
  const dir = GLOBAL_DIRS.skills;
  if (!existsSync(dir)) return [];
  const results: ResourceInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Follow symlinks: statSync resolves targets, lstat on Dirent does not
    const isDir = entry.isDirectory() || entry.isSymbolicLink();
    if (!isDir) continue;
    const skillDir = join(dir, entry.name);
    const skillMd = join(skillDir, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    const st = statSync(skillMd);
    const manifestSource = getManifestSource(entry.name);
    const dep = parseSkillDeprecated(skillMd);
    results.push({
      type: "skill",
      name: entry.name,
      path: skillMd,
      version: parseSkillVersion(skillMd),
      author: parseSkillAuthor(skillMd),
      source: manifestSource || "local",
      lastModified: st.mtime.toISOString(),
      qualityScore: null,
      status: computeStatus(st.mtime),
      upstream: parseUpstream(skillMd),
      deprecated: dep?.deprecated || null,
      deprecatedReason: dep?.reason || null,
      deprecatedAt: dep?.at || null,
    });
  }
  return results;
}

function scanExtensions(): ResourceInfo[] {
  const dir = GLOBAL_DIRS.extensions;
  if (!existsSync(dir)) return [];
  const results: ResourceInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const filePath = join(dir, entry.name);
    const st = statSync(filePath);
    const dep = readDeprecatedMarker(filePath);
    results.push({
      type: "extension",
      name: basename(entry.name, ".ts"),
      path: filePath,
      version: null,
      author: null,
      source: "local",
      lastModified: st.mtime.toISOString(),
      qualityScore: null,
      status: computeStatus(st.mtime),
      deprecated: dep !== null ? true : null,
      deprecatedReason: dep?.reason || null,
      deprecatedAt: dep?.at || null,
    });
  }
  return results;
}

function scanPrompts(): ResourceInfo[] {
  const dir = GLOBAL_DIRS.prompts;
  if (!existsSync(dir)) return [];
  const results: ResourceInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = join(dir, entry.name);
    const st = statSync(filePath);
    const dep = readDeprecatedMarker(filePath);
    results.push({
      type: "prompt",
      name: basename(entry.name, ".md"),
      path: filePath,
      version: null,
      author: null,
      source: "local",
      lastModified: st.mtime.toISOString(),
      qualityScore: null,
      status: computeStatus(st.mtime),
      deprecated: dep !== null ? true : null,
      deprecatedReason: dep?.reason || null,
      deprecatedAt: dep?.at || null,
    });
  }
  return results;
}

function scanThemes(): ResourceInfo[] {
  const dir = GLOBAL_DIRS.themes;
  if (!existsSync(dir)) return [];
  const results: ResourceInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = join(dir, entry.name);
    const st = statSync(filePath);
    const dep = readDeprecatedMarker(filePath);
    results.push({
      type: "theme",
      name: basename(entry.name, ".json"),
      path: filePath,
      version: null,
      author: null,
      source: "local",
      lastModified: st.mtime.toISOString(),
      qualityScore: null,
      status: computeStatus(st.mtime),
      deprecated: dep !== null ? true : null,
      deprecatedReason: dep?.reason || null,
      deprecatedAt: dep?.at || null,
    });
  }
  return results;
}

interface SettingsJson {
  packages?: (string | { name?: string; source?: string })[];
}

/** Resolve a local path package entry to its package.json name, if available. */
function resolvePkgName(entry: string): string {
  // Only resolve local paths (relative or absolute)
  if (!entry.startsWith(".") && !entry.startsWith("/") && !entry.startsWith("~")) {
    return entry;
  }
  try {
    const resolved = entry.startsWith("~")
      ? join(HOME, entry.slice(1))
      : join(dirname(SETTINGS_PATH), entry);
    const pkgJson = join(resolved, "package.json");
    if (!existsSync(pkgJson)) return entry;
    const meta = JSON.parse(readFileSync(pkgJson, "utf-8"));
    return meta.name || entry;
  } catch {
    return entry;
  }
}

function resolvePkgDir(entry: string): string {
  // Local paths
  if (entry.startsWith(".") || entry.startsWith("/") || entry.startsWith("~")) {
    return entry.startsWith("~")
      ? join(HOME, entry.slice(1))
      : join(dirname(SETTINGS_PATH), entry);
  }
  // npm:<name> → local node_modules
  const npmMatch = entry.match(/^npm:(@?[^/]+(?:\/[^/]+)?)$/);
  if (npmMatch) {
    return join(HOME, ".pi/agent/npm/node_modules", npmMatch[1]);
  }
  // git:<host>/<user>/<repo>[.git] → local git clone
  const gitMatch = entry.match(/^git:([^/]+\/[^/]+\/[^/.]+(?:\.[^/]+)?)/);
  if (gitMatch) {
    return join(HOME, ".pi/agent/git", gitMatch[1].replace(/\.git$/, ""));
  }
  return entry;
}

function scanPackages(): ResourceInfo[] {
  if (!existsSync(SETTINGS_PATH)) return [];
  try {
    const settings: SettingsJson = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
    const pkgs = settings.packages || [];
    return pkgs.map((pkg) => {
      const rawName = typeof pkg === "string" ? pkg : (pkg.source || pkg.name || "unknown");
      // ponytail: local path packages resolve their real name from package.json
      const name = resolvePkgName(rawName);
      const resolvedDir = resolvePkgDir(rawName);
      // Determine source: git:// or git: prefix → git, npm: prefix → npm, object with source → that source, local path → local, default → unknown
      const source = typeof pkg === "object" && pkg.source
        ? pkg.source
        : /^git:/.test(rawName) ? "git"
        : /^npm:/.test(rawName) ? "npm"
        : rawName.startsWith(".") || rawName.startsWith("/") || rawName.startsWith("~") ? "local"
        : "unknown";
      return {
        type: "package" as ResourceType,
        name,
        path: resolvedDir,
        version: null,
        author: null,
        source,
        lastModified: new Date().toISOString(),
        qualityScore: null,
        status: "active" as const,
        deprecated: null,
        deprecatedReason: null,
        deprecatedAt: null,
      };
    });
  } catch {
    return [];
  }
}

// ── Public API ──

/**
 * Scan all 5 resource types.
 */
export function scanResources(): ResourceInfo[] {
  return [
    ...scanSkills(),
    ...scanExtensions(),
    ...scanPrompts(),
    ...scanThemes(),
    ...scanPackages(),
  ];
}

/**
 * Scan only a specific resource type.
 */
export function scanByType(type: ResourceType): ResourceInfo[] {
  const scanners: Record<ResourceType, () => ResourceInfo[]> = {
    skill: scanSkills,
    extension: scanExtensions,
    prompt: scanPrompts,
    theme: scanThemes,
    package: scanPackages,
  };
  return scanners[type]();
}

/**
 * Find a specific resource by type and name.
 */
export function findResource(type: ResourceType, name: string): ResourceInfo | undefined {
  return scanByType(type).find((r) => r.name === name);
}


