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
  if (source.startsWith("github:") || source.startsWith("https://github.com/")) {
    return { type: "github", identifier: source.replace(/^https?:\/\//, "").replace(/^github:/, "github:") };
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
    case "git":
      // ponytail: github/git version check is expensive behind ghproxy
      // add when ghproxy-based tag fetching is needed
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
 * Only resources with a known version source (upstream or manifest entry)
 * participate in remote version checking. Resources without a known source
 * are reported as "no remote source" without false "up to date" claims.
 */
export async function checkVersions(): Promise<VersionInfo[]> {
  const types: ResourceType[] = ["skill", "extension", "prompt", "theme", "package"];
  const results: VersionInfo[] = [];

  for (const type of types) {
    const resources = scanByType(type);
    for (const r of resources) {
      const currentVersion = r.version;

      // ── Determine how to check version for this resource ──
      const versionSource = r.upstream
        ? determineVersionSource(r.upstream, r.name)
        : determineVersionSource(null, r.name);

      let latestVersion: string | null = null;
      if (versionSource) {
        latestVersion = await fetchRemoteVersion(versionSource);
      }

      // ── Upstream version check (fork tracking) ──
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

      // isUpToDate: only meaningful when we have a remote source to compare against
      const hasRemoteSource = versionSource !== null;
      const isUpToDate = !hasRemoteSource || (latestVersion ? currentVersion === latestVersion : true);

      results.push({
        type: r.type,
        name: r.name,
        currentVersion: currentVersion || "\u2014",
        latestVersion,
        isUpToDate,
        upstream: r.upstream || null,
        upstreamOutdated,
        upstreamLatest: upstreamLatest ?? null,
        observation: observation || undefined,
      });
    }
  }

  return results;
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
