/**
 * Birth certificate runner — executes the checklist and produces results.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getChecklist, type ResourceType, type BirthItem } from "./checklist.js";
import { GLOBAL_DIRS } from "../utils/path.js";

export interface BirthCheckResult {
  item: BirthItem;
  pass: boolean;
  detail: string;
}

export interface BirthResult {
  resourceType: ResourceType;
  resourceName: string;
  resourcePath: string;
  version: string | null;
  checks: BirthCheckResult[];
  summary: {
    total: number;
    passed: number;
    auto: { passed: number; total: number };
    autoable: { passed: number; total: number };
    manual: { total: number };
    missing: { total: number };
  };
  ready: boolean;
}

/**
 * Resolve a resource name to a real path.
 * Supports three formats:
 *   slug        → "hv-analysis"          → matched from scanner
 *   full path   → "/home/.../hv-analysis" → used directly
 *   display name → "HV Analysis"         → fuzzy matched (basename)
 */
function resolveResource(type: ResourceType, name: string): { resourcePath: string; resourceName: string } | null {
  // Full path (absolute or relative)
  if (name.startsWith("/") || name.startsWith("~")) {
    const p = name.replace(/^~/, process.env.HOME || "/home/wtown");
    if (existsSync(p)) {
      return { resourcePath: p, resourceName: p.split("/").pop() || name };
    }
    return { resourcePath: p, resourceName: name };
  }

  // Relative path — try as-is
  if (existsSync(name)) {
    const parts = name.replace(/\/+$/, "").split("/");
    return { resourcePath: name, resourceName: parts[parts.length - 1] };
  }

  // Also try with cwd prefix for test paths
  const cwd = process.cwd();
  const cwdPath = join(cwd, name);
  if (existsSync(cwdPath)) {
    return { resourcePath: cwdPath, resourceName: name.split("/").pop() || name };
  }

  // Check GLOBAL_DIRS for slug/name match
  const dirMap: Record<ResourceType, string> = {
    skill: GLOBAL_DIRS.skills,
    extension: GLOBAL_DIRS.extensions,
    prompt: GLOBAL_DIRS.prompts,
    theme: GLOBAL_DIRS.themes,
    package: "",
  };

  const baseDir = dirMap[type];
  if (baseDir && existsSync(baseDir)) {
    // Direct match
    const directPath = type === "extension"
      ? join(baseDir, name.endsWith(".ts") ? name : `${name}.ts`)
      : type === "prompt"
        ? join(baseDir, name.endsWith(".md") ? name : `${name}.md`)
        : type === "theme"
          ? join(baseDir, name.endsWith(".json") ? name : `${name}.json`)
          : join(baseDir, name);

    if (existsSync(directPath) || (type === "skill" && existsSync(join(directPath, "SKILL.md")))) {
      const finalPath = type === "skill" ? join(baseDir, name) : directPath;
      return { resourcePath: finalPath, resourceName: name };
    }

    // Fuzzy match: check if any directory/file starts with name
    if (existsSync(baseDir)) {
      const entries = readdirSync(baseDir);
      const match = entries.find((e: string) => e.toLowerCase().includes(name.toLowerCase()));
      if (match) {
        const path = type === "skill" ? join(baseDir, match) : join(baseDir, match);
        return { resourcePath: path, resourceName: match };
      }
    }
  }

  return null;
}

/**
 * Run the birth certificate check for a resource.
 */
export function runBirthCert(type: ResourceType, name: string): BirthResult {
  const resolved = resolveResource(type, name);
  if (!resolved) {
    return {
      resourceType: type,
      resourceName: name,
      resourcePath: "",
      version: null,
      checks: [],
      summary: { total: 0, passed: 0, auto: { passed: 0, total: 0 }, autoable: { passed: 0, total: 0 }, manual: { total: 0 }, missing: { total: 0 } },
      ready: false,
    };
  }

  const items = getChecklist(type, resolved.resourcePath);
  const results: BirthCheckResult[] = items.map((item) => {
    const result = item.check(resolved.resourcePath);
    return { item, pass: result.pass, detail: result.detail };
  });

  // Compute summary
  const auto = results.filter((r) => r.item.level === "auto");
  const autoable = results.filter((r) => r.item.level === "autoable");
  const manual = results.filter((r) => r.item.level === "manual");
  const missing = results.filter((r) => r.item.level === "missing");

  const autoPassed = auto.filter((r) => r.pass).length;
  const autoablePassed = autoable.filter((r) => r.pass).length;

  // ready = all auto + autoable passed
  const ready = autoPassed === auto.length && autoablePassed === autoable.length;

  return {
    resourceType: type,
    resourceName: resolved.resourceName,
    resourcePath: resolved.resourcePath,
    version: null,
    checks: results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.pass).length,
      auto: { passed: autoPassed, total: auto.length },
      autoable: { passed: autoablePassed, total: autoable.length },
      manual: { total: manual.length },
      missing: { total: missing.length },
    },
    ready,
  };
}
