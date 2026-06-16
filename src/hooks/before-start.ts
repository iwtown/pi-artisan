/**
 * pi-artisan — before_agent_start hook.
 *
 * Startup inspection: scans all 5 resource types for health issues
 * (staleness, version drift) and notifies the user.
 *
 * Design principles:
 *   - Lightweight: completes within seconds, never blocks startup
 *   - Silent on health: returns undefined when everything is fine
 *   - Graceful degradation: network failures are caught silently
 *   - Self-contained: all logic is in pure functions for testability
 *
 * @see ~/projects/pi-llm-wiki/src/hooks/before-start.ts — reference pattern
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { scanResources } from "../catalog/scanner.js";
import { checkAging } from "../catalog/aging.js";
import { checkVersions } from "../catalog/version.js";
import type { AgingInfo, VersionInfo } from "../types.js";
import { adaptAll } from "../adaptation/engine.js";

// ─────────────────────────────────────────────────────────
//  Pure functions (testable without mocks)
// ─────────────────────────────────────────────────────────

export interface HealthData {
  totalCount: number;
  skillCount: number;
  staleResources: { name: string; daysSinceUpdate: number }[];
  outdatedSkills: { name: string; current: string; latest: string }[];
  upstreamDrift: { name: string; current: string; upstream: string; source: string }[];
  adaptFailCount: number;
}

/**
 * Generate a health notice string. Returns null if everything is healthy (silent).
 */
export function generateHealthNotice(data: HealthData): string | null {
  const { totalCount, skillCount, staleResources, outdatedSkills, upstreamDrift } = data;

  if (staleResources.length === 0 && outdatedSkills.length === 0 && upstreamDrift.length === 0 && data.adaptFailCount === 0) {
    return null; // silent — everything healthy
  }

  const lines: string[] = [];
  lines.push(`🧰 pi-artisan 工坊巡检`);
  lines.push(`   共 ${totalCount} 个能力包（${skillCount} 个 skill）`);

  if (staleResources.length > 0) {
    lines.push(`   ⏰ ${staleResources.length} 个资源已老化（≥90 天未更新）`);
    for (const s of staleResources.slice(0, 3)) {
      lines.push(`     · ${s.name}（${s.daysSinceUpdate} 天）`);
    }
    if (staleResources.length > 3) {
      lines.push(`     · ...及其他 ${staleResources.length - 3} 个`);
    }
  }

  if (outdatedSkills.length > 0) {
    lines.push(`   📦 ${outdatedSkills.length} 个 skill 版本落后`);
    for (const o of outdatedSkills.slice(0, 3)) {
      lines.push(`     · ${o.name}: ${o.current} → ${o.latest}`);
    }
    if (outdatedSkills.length > 3) {
      lines.push(`     · ...及其他 ${outdatedSkills.length - 3} 个`);
    }
  }

  if (upstreamDrift.length > 0) {
    lines.push(`   🔄 ${upstreamDrift.length} 个 fork 落后 upstream`);
    for (const u of upstreamDrift.slice(0, 3)) {
      lines.push(`     · ${u.name}: v${u.current} → upstream v${u.upstream} (${u.source})`);
    }
  }

  if (data.adaptFailCount > 0) {
    lines.push(`   🔴 ${data.adaptFailCount} 个能力包未通过适配化改造`);
    lines.push(`   💡 运行 /adapt 查看详情`);
  }

  lines.push(`   💡 运行 /resource-maintain 查看详情`);

  return lines.join("\n");
}

/**
 * Extract stale resources from aging info (filters to stale/archived).
 */
export function extractStaleResources(aging: AgingInfo[]): { name: string; daysSinceUpdate: number }[] {
  return aging
    .filter((a) => a.status === "stale" || a.status === "archived")
    .map((a) => ({ name: a.name, daysSinceUpdate: a.daysSinceUpdate }));
}

/**
 * Extract outdated skills from version info.
 */
export function extractOutdatedSkills(versions: VersionInfo[]): { name: string; current: string; latest: string }[] {
  return versions
    .filter((v) => !v.isUpToDate && v.latestVersion !== null)
    .map((v) => ({ name: v.name, current: v.currentVersion, latest: v.latestVersion! }));
}

// ─────────────────────────────────────────────────────────
//  Hook registration
// ─────────────────────────────────────────────────────────

/**
 * Set up the before_agent_start hook for startup inspection.
 */
export function setupBeforeStartHook(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event: any, ctx: any) => {
    try {
      // ── 1. Scan resources ──
      const resources = scanResources();
      const totalCount = resources.length;
      const skillCount = resources.filter((r) => r.type === "skill").length;

      // ── 2. Aging check (local, fast) ──
      const aging = checkAging();
      const staleResources = extractStaleResources(aging);

      // ── 3. Version check (network, 5s timeout) ──
      let outdatedSkills: { name: string; current: string; latest: string }[] = [];
      let upstreamDrift: { name: string; current: string; upstream: string; source: string }[] = [];
      try {
        const versions = await checkVersions();
        outdatedSkills = extractOutdatedSkills(versions);
        upstreamDrift = versions
          .filter((v) => v.upstreamOutdated && v.upstreamLatest)
          .map((v) => ({
            name: v.name,
            current: v.currentVersion,
            upstream: v.upstreamLatest!,
            source: v.upstream?.source || "?",
          }));
      } catch {
        // Network unavailable — degrade silently
      }

      // ── 4. Adaptation check (local, fast) ──
      let adaptFailCount = 0;
      try {
        const adaptReports = adaptAll();
        adaptFailCount = adaptReports.filter((r) => !r.allPassed).length;
      } catch {
        // Adaptation check failure must not block startup
      }

      // ── 5. Generate notice ──
      const notice = generateHealthNotice({
        totalCount,
        skillCount,
        staleResources,
        outdatedSkills,
        upstreamDrift,
        adaptFailCount,
      });

      // ── 6. Everything healthy → silent ──
      if (notice === null) {
        return undefined;
      }

      // ── 7. Issues found → notify ──
      if (ctx.hasUI) {
        ctx.ui?.notify(notice, "info");
      }

      return {
        systemPrompt: event.systemPrompt + `\n\n---\n## 🧰 pi-artisan 工坊状态\n${notice}\n---\n`,
      };
    } catch (err) {
      // Inspection failure must never block agent startup
      console.error("[pi-artisan] 巡检异常:", err);
      return undefined;
    }
  });
}
