/**
 * Quality report generator — formats resource quality as TUI-friendly text.
 */

import type { ResourceInfo, QualityScore } from "../types.js";

/**
 * Generate a formatted quality report for a resource.
 */
export function generateReport(resource: ResourceInfo, score: QualityScore): string {
  const lines: string[] = [];
  const name = resource.name;
  const ver = resource.version || "\u2014";

  lines.push(`\u250c\u2500 \U0001f4ca ${name} (${ver}) \u2500${"\u2500".repeat(Math.max(1, 40 - name.length - ver.length))}\u2510`);

  lines.push(`\u2502 \u7c7b\u578b: ${padRight(resource.type, 10)} \u6765\u6e90: ${resource.source || "\u2014"}`);
  lines.push(`\u2502 \u8def\u5f84: ${truncatePath(resource.path, 50)}`);

  // Upstream info
  if (resource.upstream?.source) {
    const us = resource.upstream;
    const syncLabel = us.sync ? `sync: ${us.sync}` : "sync: \u2014";
    const upVer = us.version ? `v${us.version}` : "\u2014";
    const lastMerge = us.lastMerge ? us.lastMerge.slice(0, 10) : "\u2014";
    lines.push(`\u2502 \u2191 upstream: ${us.source} (${upVer}, ${syncLabel}, last: ${lastMerge})`);
  }

  // Deprecated badge
  if (resource.deprecated) {
    const reason = resource.deprecatedReason ? `: ${resource.deprecatedReason}` : "";
    lines.push(`\u2502 \u26a0\ufe0f DEPRECATED${reason}`);
  }

  const dims = score.dimensions;
  const dimKeys = Object.keys(dims);
  if (dimKeys.length > 0) {
    lines.push(`\u251c${"\u2500".repeat(50)}\u2524`);
    for (const key of dimKeys) {
      const val = dims[key];
      const barLen = Math.round(val / 10);
      const bar = "\u2588".repeat(barLen) + "\u2591".repeat(Math.max(0, 10 - barLen));
      const label = padRight(key, 12);
      lines.push(`\u2502 ${label} ${bar} ${val}%`);
    }
  }

  const scoreColor = score.overall >= 80 ? "\u2705" : score.overall >= 50 ? "\u26a0\ufe0f" : "\u274c";
  lines.push(`\u251c${"\u2500".repeat(50)}\u2524`);
  lines.push(`\u2502 \u603b\u5206: ${score.overall}/100 ${scoreColor}`);

  const statusIcon = resource.status === "active" ? "\U0001f7e2" : resource.status === "stale" ? "\U0001f7e1" : "\U0001f534";
  lines.push(`\u2502 \u72b6\u6001: ${statusIcon} ${resource.status}`);
  lines.push(`\u2502 \u4e0a\u6b21\u66f4\u65b0: ${resource.lastModified.slice(0, 10)}`);

  lines.push(`\u2514${"\u2500".repeat(50)}\u2518`);

  return lines.join("\n");
}

/**
 * Format a resource list as a TUI table.
 */
export function formatResourceTable(resources: ResourceInfo[], title: string): string {
  if (resources.length === 0) return `\u2502 ${title}: (\u7a7a)`;

  const lines: string[] = [];
  const header = `${title} (${resources.length})`;
  lines.push(`\u250c\u2500 ${header} ${"\u2500".repeat(Math.max(1, 50 - header.length))}\u2510`);

  for (const r of resources) {
    const ver = r.version ? `v${r.version}` : "\u2014";
    const score = r.qualityScore !== null
      ? `${r.qualityScore >= 80 ? "\u2705" : r.qualityScore >= 50 ? "\u26a0\ufe0f" : "\u274c"} ${r.qualityScore}/100`
      : "\u2014";
    const src = r.author || r.source || "\u2014";
    const name = r.name.length > 20 ? r.name.slice(0, 17) + "\u2026" : r.name;
    const depBadge = r.deprecated ? "⚠️ " : "";
    lines.push(`\u2502 ${depBadge}${padRight(name, 20)} ${padRight(ver, 8)} ${padRight(score, 12)} ${src}`);
  }

  lines.push(`\u2514${"\u2500".repeat(50)}\u2518`);
  return lines.join("\n");
}

/**
 * Format a maintain report.
 */
export interface ObservationDisplay {
  name: string;
  publishedAt: string;
  publishedVersion: string;
  competitors: string[];
  nextCheckDate: string | null;
}

export function formatMaintainReport(
  agingEntries: { name: string; type: string; version: string; days: number; status: string }[],
  outdatedEntries: { name: string; type: string; local: string; remote: string }[],
  observations: ObservationDisplay[] = [],
  upstreamEntries: { name: string; type: string; local: string; upstream: string; source: string }[] = [],
): string {
  const lines: string[] = [];
  lines.push(`\u250c\u2500 \u7ef4\u62a4\u62a5\u544a ${"\u2500".repeat(42)}\u2510`);

  if (agingEntries.length > 0) {
    lines.push(`\u2502 \u23f0 \u8001\u5316\u7684\u8d44\u6e90 (90\u5929\u672a\u66f4\u65b0):`);
    for (const a of agingEntries) {
      lines.push(`\u2502   ${padRight(a.name, 20)} ${a.version || "\u2014"}  \u4e0a\u6b21\u66f4\u65b0 ${formatDays(a.days)}`);
    }
  } else {
    lines.push(`\u2502 \u2705 \u6ca1\u6709\u8001\u5316\u7684\u8d44\u6e90`);
  }

  lines.push(`\u2502${" ".repeat(50)}\u2502`);

  if (outdatedEntries.length > 0) {
    lines.push(`\u2502 \U0001f4e6 \u7248\u672c\u843d\u540e\u7684\u8d44\u6e90:`);
    for (const o of outdatedEntries) {
      lines.push(`\u2502   ${padRight(o.name, 20)} \u672c\u5730 ${o.local} \u2192 \u6700\u65b0 ${o.remote}`);
    }
  } else {
    lines.push(`\u2502 \u2705 \u6240\u6709\u8d44\u6e90\u90fd\u662f\u6700\u65b0\u7248`);
  }

  // ── Observations section ──
  if (observations.length > 0) {
    lines.push(`\u2502${" ".repeat(50)}\u2502`);
    lines.push(`\u2502 \U0001f4cb \u56de\u7089\u89c2\u5bdf\u6e05\u5355:`);
    for (const obs of observations) {
      lines.push(`\u2502   ${padRight(obs.name, 20)} \u4e0a\u6b21\u53d1\u5e03: v${obs.publishedVersion} (${obs.publishedAt.slice(0, 10)})`);
      if (obs.competitors.length > 0) {
        lines.push(`\u2502   \u5bf9\u6807\u7ade\u54c1: ${obs.competitors.join(", ")}`);
      } else {
        lines.push(`\u2502   \u5bf9\u6807\u7ade\u54c1: (\u672a\u8bb0\u5f55)`);
      }
      lines.push(`\u2502   \u4e0b\u6b21\u56de\u8bbf: ${obs.nextCheckDate || "(\u672a\u8bbe\u7f6e)"}`);
    }
  }

  // ── Upstream drift section ──
  if (upstreamEntries.length > 0) {
    lines.push(`\u2502${(" ").repeat(50)}\u2502`);
    lines.push(`\u2502 \U0001f31f upstream \u7248\u672c落\u540e\uff1a`);
    for (const u of upstreamEntries) {
      lines.push(`\u2502   ${padRight(u.name, 20)} \u5f53\u524d v${u.local} \u2192 upstream v${u.upstream} (${u.source})`);
    }
    lines.push(`\u2502   \u63d0\u793a\uff1a\u8fd0\u884c git merge upstream \u540e\u66f4\u65b0 upstream.version`);
  }

  if (agingEntries.length === 0 && outdatedEntries.length === 0 && observations.length === 0 && upstreamEntries.length === 0) {
    lines.push(`\u2502 \U0001f49a \u6240\u6709\u8d44\u6e90\u72b6\u6001\u826f\u597d\uff0c\u65e0\u9700\u7ef4\u62a4`);
  }

  lines.push(`\u2514${"\u2500".repeat(50)}\u2518`);
  return lines.join("\n");
}

// ── Helpers ──

function padRight(s: string, n: number): string {
  return (s + " ".repeat(n)).slice(0, n);
}

function truncatePath(p: string, max: number): string {
  if (p.length <= max) return p;
  return "\u2026" + p.slice(-(max - 1));
}

function formatDays(days: number): string {
  if (days < 30) return `${Math.round(days)} \u5929\u524d`;
  if (days < 365) return `${Math.round(days / 30)} \u6708\u524d`;
  return `${(days / 365).toFixed(1)} \u5e74\u524d`;
}
