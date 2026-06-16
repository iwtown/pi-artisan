/**
 * Version tracker — compares local resource versions against remote sources.
 *
 * Skills:   local version vs skillhub (via `skillhub search`)
 * Packages: local version vs npm registry (optional, degrades gracefully)
 * Others:   no remote source, reports local version only
 *
 * Upstream:   when a resource declares `upstream` in frontmatter,
 *             also checks if upstream version has advanced.
 */

import { execSync } from "node:child_process";
import { scanByType } from "./scanner.js";
import type { ResourceType, VersionInfo, UpstreamInfo } from "../types.js";
import { getObservation } from "./observations.js";

/**
 * Fetch the remote version for an upstream source.
 * Supports: skillhub/<slug>, npm:<pkg>, or raw semver string.
 */
async function fetchUpstreamVersion(upstream: UpstreamInfo): Promise<string | null> {
  if (!upstream.source) return upstream.version;

  // Parse source format
  if (upstream.source.startsWith("skillhub/")) {
    const slug = upstream.source.slice(9);
    return await fetchSkillhubVersion(slug);
  }
  if (upstream.source.startsWith("npm:")) {
    const pkg = upstream.source.slice(4);
    return await fetchNpmVersion(pkg);
  }

  // Fallback: just report the declared upstream version
  return upstream.version;
}

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
        results.push({ type: r.type, name: r.name, currentVersion: "—", latestVersion: null, isUpToDate: true, upstream: null });
        continue;
      }

      let latestVersion: string | null = null;
      if (type === "skill") {
        latestVersion = await fetchSkillhubVersion(r.name);
      } else if (type === "package") {
        latestVersion = await fetchNpmVersion(r.name);
      }

      // ── Upstream version check ──
      let upstreamOutdated: boolean | undefined;
      let upstreamLatest: string | null | undefined;
      if (r.upstream?.source) {
        upstreamLatest = await fetchUpstreamVersion(r.upstream);
        if (upstreamLatest && r.upstream.version && upstreamLatest !== r.upstream.version) {
          upstreamOutdated = true;
        } else {
          upstreamOutdated = false;
        }
      }

      const observation = type === "skill" ? getObservation(r.name) : undefined;

      results.push({
        type: r.type,
        name: r.name,
        currentVersion,
        latestVersion,
        isUpToDate: latestVersion ? currentVersion === latestVersion : true,
        upstream: r.upstream || null,
        upstreamOutdated,
        upstreamLatest: upstreamLatest ?? null,
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
