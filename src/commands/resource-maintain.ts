/**
 * /resource-maintain — maintenance report (aging + version tracking).
 *
 * Usage:
 *   /resource-maintain             — full report
 *   /resource-maintain --check-only — same (default, no auto-fix)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkAging } from "../catalog/aging.js";
import { checkVersions, determineVersionSource } from "../catalog/version.js";
import { formatMaintainReport, type ObservationDisplay } from "../catalog/report.js";

export function registerResourceMaintain(pi: ExtensionAPI): void {
  pi.registerCommand("resource-maintain", {
    description: "Check resource health: aging detection + version tracking. Usage: /resource-maintain",
    handler: async (_args: string, ctx: any) => {
      ctx.ui?.notify("🔄 正在扫描资源老化状态…", "info");

      // Aging check
      const agingResults = checkAging();

      // Version check
      ctx.ui?.notify("🔄 正在检查版本更新…", "info");
      const versionResults = await checkVersions();

      const staleEntries = agingResults
        .filter((a) => a.status !== "active")
        .map((a) => ({
          name: a.name,
          type: a.type,
          version: "",
          days: a.daysSinceUpdate,
          status: a.status,
        }));

      const outdatedEntries = versionResults
        .filter((v) => !v.isUpToDate && v.latestVersion !== null)
        .map((v) => ({
          name: v.name,
          type: v.type,
          local: v.currentVersion,
          remote: v.latestVersion!,
        }));

      const observations: ObservationDisplay[] = versionResults
        .filter((v) => v.observation)
        .map((v) => ({
          name: v.name,
          publishedAt: v.observation!.publishedAt,
          publishedVersion: v.observation!.publishedVersion,
          competitors: v.observation!.competitors,
          nextCheckDate: v.observation!.nextCheckDate,
        }));

      const upstreamEntries = versionResults
        .filter((v) => v.upstreamOutdated && v.upstreamLatest)
        .map((v) => ({
          name: v.name,
          type: v.type,
          local: v.currentVersion,
          upstream: v.upstreamLatest!,
          source: v.upstream?.source || "?",
        }));

      const report = formatMaintainReport(staleEntries, outdatedEntries, observations, upstreamEntries);
      ctx.ui?.notify(report, "info");
      ctx.ui?.setWidget("resource-maintain", report.split("\n"));

      // Suggest upgrade commands (source-aware, no hardcoded skillhub)
      const tips: string[] = [];
      for (const v of versionResults) {
        if (v.isUpToDate || v.latestVersion === null) continue;
        const vs = determineVersionSource(v.upstream || null, v.name);
        if (vs?.type === "skillhub") {
          tips.push(`💡 skillhub upgrade ${vs.identifier}`);
        } else if (vs?.type === "npm") {
          tips.push(`💡 npm update -g ${vs.identifier}`);
        }
      }
      for (const u of upstreamEntries) {
        const vs = determineVersionSource({ source: u.source, version: null, lastMerge: null, sync: null }, u.name);
        let upgradeHint = "git pull upstream && bump upstream.version";
        if (vs?.type === "skillhub") upgradeHint = `skillhub upgrade ${vs.identifier}`;
        else if (vs?.type === "npm") upgradeHint = `npm update -g ${vs.identifier}`;
        tips.push(`🔄 ${upgradeHint} (${u.name})`);
      }
      if (tips.length > 0) {
        ctx.ui?.notify(tips.join("\n"), "info");
      }
    },
  });
}
