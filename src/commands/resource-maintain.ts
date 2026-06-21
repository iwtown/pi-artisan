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
import { getOverdueChecks } from "../catalog/observations.js";
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

      const overdue = getOverdueChecks();
      let report = formatMaintainReport(staleEntries, outdatedEntries, observations, upstreamEntries);
      if (overdue.length > 0) {
        report = report.replace(
          /\u2514.*\u2518/,
          `\u2502 \u23f0 ${overdue.length} \u4e2a\u8d44\u6e90\u9700\u8981\u56de\u8bbf\u68c0\u67e5\uff1a\n` +
            overdue.map((o) => `\u2502    ${o.slug} (\u4e0a\u6b21\u53d1\u5e03: ${o.publishedVersion}, \u5e94\u56de\u8bbf: ${o.nextCheckDate.slice(0, 10)})`).join("\n") +
            `\n\u2514${"\u2500".repeat(50)}\u2518`
        );
      }
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
