/**
 * Version tracker — compares local resource versions against remote sources.
 *
 * **No source is assumed.** Version checking is routed based on explicit
 * source declarations only, in priority order:
 *
 *   1. upstream.source in SKILL.md frontmatter (declarative, most specific)
 *   2. .manifest.json `source` field (from package manager metadata)
 *   3. Unknown → silently skipped (no false "up to date" claims)
 *
 * Supported source types:
 *   - skillhub/<slug>  → `skillhub search`
 *   - npm:<pkg>        → `npm view <pkg> version`
 *   - github:<repo>    → GitHub tags via ghproxy (stub)
 *   - (anything else)  → silently skipped, no error
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scanByType } from "./scanner.js";
import { getObservation } from "./observations.js";
import type { ResourceType, VersionInfo, UpstreamInfo, VersionSource } from "../types.js";

const HOME = process.env.HOME || "/home/wtown";
const MANIFEST_PATH = join(HOME, ".pi", "agent", "skills", ".manifest.json");

// ─────────────────────────────────────────────────────────
//  Source detection (priority chain)
// ─────────────────────────────────────────────────────────

/**
 * Determine the version source for a resource.
 * Returns null when no source can be determined (version check skipped).
 */
export function determineVersionSource(
  upstream: UpstreamInfo | null | undefined,
  resourceName: string,
): VersionSource | null {
  // Priority 1: upstream.source in SKILL.md frontmatter
  if (upstream?.source) {
    const parsed = parseSourceString(upstream.source);
    if (parsed) return parsed;
  }

  // Priority 2: .manifest.json
  const manifestSource = readManifestSource(resourceName);
  if (manifestSource) return manifestSource;

  // Priority 3: no known source
  return null;
}

/**
 * Parse a source string into a VersionSource.
 * Accepts: "skillhub/<slug>", "npm:<pkg>", "github:<repo>", "git:<url>"
 */
export function parseSourceString(source: string): VersionSource | null {
  if (source.startsWith("skillhub/")) {
    return { type: "skillhub", identifier: source.slice(9) };
  }
  if (source.startsWith("npm:")) {
    return { type: "npm", identifier: source.slice(4) };
  }
  if (source.startsWith("github:")) {
    return { type: "github", identifier: source.slice(7) };
  }
  if (source.startsWith("https://github.com/")) {
    return { type: "github", identifier: source.replace(/^https:\/\/github\.com\//, "") };
  }
  if (source.startsWith("git:")) {
    return { type: "git", identifier: source.slice(4) };
  }
  return null;
}

/** Shape of the .manifest.json file installed by Pi */
interface ManifestFile {
  skills?: Record<string, {
    source: string;
    url: string;
    version: string;
    installed: string;
  }>;
}

function loadManifest(): ManifestFile | null {
  try {
    if (!existsSync(MANIFEST_PATH)) return null;
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Look up a skill's source from .manifest.json.
 * Falls back to null if not found.
 */
export function readManifestSource(name: string): VersionSource | null {
  const manifest = loadManifest();
  if (!manifest?.skills) return null;
  const entry = manifest.skills[name];
  if (!entry) return null;

  switch (entry.source) {
    case "skillhub":
      return { type: "skillhub", identifier: name };
    case "github":
      return { type: "github", identifier: extractRepoFromUrl(entry.url) };
    case "npm":
      return { type: "npm", identifier: extractPkgFromManifestUrl(entry.url) };
    default:
      return null;
  }
}

function extractRepoFromUrl(url: string): string {
  // "https://github.com/user/repo" or "github:user/repo" → "user/repo"
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : url;
}

function extractPkgFromManifestUrl(url: string): string {
  // "npm:@scope/pkg" or "npm:pkg"
  if (url.startsWith("npm:")) return url.slice(4);
  return url;
}

// ─────────────────────────────────────────────────────────
//  Remote version fetching (routed by source type)
// ─────────────────────────────────────────────────────────

/**
 * Fetch the latest version from a known source.
 * Returns null when the source type is unsupported or unreachable.
 */
async function fetchRemoteVersion(source: VersionSource): Promise<string | null> {
  switch (source.type) {
    case "skillhub":
      return fetchSkillhubVersion(source.identifier);
    case "npm":
      return fetchNpmVersion(source.identifier);
    case "github":
      try {
        const out = execSync(
          `git ls-remote --tags https://ghproxy.net/https://github.com/${source.identifier}.git 2>/dev/null | tail -1`,
          { timeout: 10000, encoding: "utf-8" },
        );
        const tag = out.trim().split(/\s+/).pop();
        return tag || null;
      } catch {
        return null;
      }
    case "git":
      // ponytail: git URLs are too varied to handle generically
      return null;
    default:
      return null;
  }
}

/**
 * Fetch version for an upstream source declaration.
 * Supports: "skillhub/<slug>", "npm:<pkg>", or raw semver string fallback.
 */
async function fetchUpstreamVersion(upstream: UpstreamInfo): Promise<string | null> {
  if (!upstream.source) return upstream.version;

  const source = parseSourceString(upstream.source);
  if (source) {
    const remote = await fetchRemoteVersion(source);
    if (remote) return remote;
  }

  // Fallback: just report the declared upstream version
  return upstream.version;
}

// ─────────────────────────────────────────────────────────
//  Main version check
// ─────────────────────────────────────────────────────────

/**
 * Check versions for all resources.
 *
 * Fixed: parallel network calls + 10s total timeout + skip unknown versions.
 */
export async function checkVersions(): Promise<VersionInfo[]> {
  const types: ResourceType[] = ["skill", "extension", "prompt", "theme", "package"];
  const results: VersionInfo[] = [];

  const tasks: Promise<void>[] = [];
  const lock = (fn: () => void) => { fn(); }; // sync push, no lock needed

  for (const type of types) {
    const resources = scanByType(type);
    for (const r of resources) {
      const currentVersion = r.version;

      // ponytail: skip unknown versions — can't meaningfully compare
      if (!currentVersion || currentVersion === "unknown") {
        results.push({
          type: r.type,
          name: r.name,
          currentVersion: currentVersion || "\u2014",
          latestVersion: null,
          isUpToDate: true,
          upstream: r.upstream || null,
          upstreamOutdated: undefined,
          upstreamLatest: null,
          observation: undefined,
        });
        continue;
      }

      const versionSource = r.upstream
        ? determineVersionSource(r.upstream, r.name)
        : determineVersionSource(null, r.name);

      tasks.push((async () => {
        let latestVersion: string | null = null;
        if (versionSource) {
          latestVersion = await fetchRemoteVersion(versionSource);
          // clean github tag refs
          if (latestVersion) latestVersion = cleanVersionString(latestVersion);
        }

        let upstreamOutdated: boolean | undefined;
        let upstreamLatest: string | null | undefined;
        if (r.upstream?.source) {
          upstreamLatest = await fetchUpstreamVersion(r.upstream);
          if (upstreamLatest) upstreamLatest = cleanVersionString(upstreamLatest);
          if (upstreamLatest && r.upstream.version && upstreamLatest !== r.upstream.version) {
            upstreamOutdated = true;
          } else {
            upstreamOutdated = false;
          }
        }

        const observation = type === "skill" ? getObservation(r.name) : undefined;
        const hasRemoteSource = versionSource !== null;
        const isUpToDate = !hasRemoteSource || (latestVersion ? currentVersion === latestVersion : true);

        lock(() => results.push({
          type: r.type,
          name: r.name,
          currentVersion: currentVersion || "\u2014",
          latestVersion,
          isUpToDate,
          upstream: r.upstream || null,
          upstreamOutdated,
          upstreamLatest: upstreamLatest ?? null,
          observation: observation || undefined,
        }));
      })());
    }
  }

  // Run all network calls in parallel with a 15s total timeout
  const timeout = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error("version check timeout")), 15000)
  );
  try {
    await Promise.race([Promise.allSettled(tasks), timeout]);
  } catch {
    // timeout reached — return partial results
  }

  return results;
}

/** Clean version strings: strip refs/tags/v prefix, keep semver */
function cleanVersionString(v: string): string {
  return v.replace(/^refs\/tags\//, "").replace(/^v(\d+\.)/, "$1");
}

// ─────────────────────────────────────────────────────────
//  Remote version fetchers
// ─────────────────────────────────────────────────────────

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
