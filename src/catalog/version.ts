/**
 * Version tracker — compares local resource versions against remote sources.
 *
 * Skills:   local version vs skillhub (via `skillhub search`)
 * Packages: local version vs npm registry (optional, degrades gracefully)
 * Others:   no remote source, reports local version only
 */

import { execSync } from "node:child_process";
import { scanByType } from "./scanner.js";
import type { ResourceType, VersionInfo } from "../types.js";
import { getObservation } from "./observations.js";


/**
 * Check versions for all resources.
 */
export async function checkVersions(): Promise<VersionInfo[]> {
  const types: ResourceType[] = ["skill", "extension", "prompt", "theme", "package"];
  const results: VersionInfo[] = [];

  for (const type of types) {
    const resources = scanByType(type);
    for (const r of resources) {
      const currentVersion = r.version;
      if (!currentVersion) {
        results.push({ type: r.type, name: r.name, currentVersion: "—", latestVersion: null, isUpToDate: true });
        continue;
      }

      let latestVersion: string | null = null;
      if (type === "skill") {
        latestVersion = await fetchSkillhubVersion(r.name);
      } else if (type === "package") {
        latestVersion = await fetchNpmVersion(r.name);
      }

      const observation = type === "skill" ? getObservation(r.name) : undefined;

      results.push({
        type: r.type,
        name: r.name,
        currentVersion,
        latestVersion,
        isUpToDate: latestVersion ? currentVersion === latestVersion : true,
        observation: observation || undefined,
      });
    }
  }

  return results;
}

// ── Remote version fetch ──

async function fetchSkillhubVersion(slug: string): Promise<string | null> {
  try {
    const out = execSync(`skillhub search "${slug}" --json --search-limit 1 2>/dev/null`, {
      timeout: 5000,
      encoding: "utf-8",
    });
    const data = JSON.parse(out);
    if (data.results && data.results.length > 0) {
      return data.results[0].version || null;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchNpmVersion(pkgName: string): Promise<string | null> {
  try {
    const out = execSync(`npm view "${pkgName}" version 2>/dev/null`, {
      timeout: 5000,
      encoding: "utf-8",
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}
