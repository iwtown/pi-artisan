/**
 * Resource scanner - discovers installed Pi resources of all 5 types.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
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
    if (!entry.isDirectory()) continue;
    const skillDir = join(dir, entry.name);
    const skillMd = join(skillDir, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    const st = statSync(skillMd);
    const manifestSource = getManifestSource(entry.name);
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
    });
  }
  return results;
}

interface SettingsJson {
  packages?: (string | { name?: string; source?: string })[];
}

function scanPackages(): ResourceInfo[] {
  if (!existsSync(SETTINGS_PATH)) return [];
  try {
    const settings: SettingsJson = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
    const pkgs = settings.packages || [];
    return pkgs.map((pkg) => {
      const name = typeof pkg === "string" ? pkg : pkg.name || "unknown";
      return {
        type: "package" as ResourceType,
        name,
        path: name,
        version: null,
        author: null,
        source: typeof pkg === "object" && pkg.source ? pkg.source : "npm",
        lastModified: new Date().toISOString(),
        qualityScore: null,
        status: "active" as const,
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


