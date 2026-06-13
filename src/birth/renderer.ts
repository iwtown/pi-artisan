/**
 * Birth certificate renderer — formats results for TUI and tool output.
 */

import type { BirthResult } from "./runner.js";

const LEVEL_ICON: Record<string, string> = {
  auto: "🟢",
  autoable: "🔵",
  manual: "🟡",
  missing: "⚪",
};

const LEVEL_LABEL: Record<string, string> = {
  auto: "自动",
  autoable: "可自动化",
  manual: "待验证",
  missing: "待补充",
};

/**
 * Render birth certificate result for TUI display.
 * Folded layout: 🔵🔵 visible, 🟡⚪ collapsed by default.
 *  
 * Returns array of strings (one per line).
 */
export function renderBirthResult(result: BirthResult): string[] {
  if (result.checks.length === 0) {
    return [
      "┌─ 出生证 ──────────────────────────────────────┐",
      `│ ❌ 找不到资源: ${result.resourceType}/${result.resourceName}     │`,
      "└────────────────────────────────────────────────┘",
    ];
  }

  const lines: string[] = [];
  const s = result.summary;

  // Header
  const typeLabel = result.resourceType.charAt(0).toUpperCase() + result.resourceType.slice(1);
  const ver = result.version ? `  v${result.version}` : "";
  lines.push("┌─ 出生证 ────────────────────────────────────────────┐");
  lines.push(`│ ${typeLabel}: ${result.resourceName}${ver}${" ".repeat(Math.max(0, 46 - result.resourceName.length - ver.length - typeLabel.length))}│`);

  // Separator
  lines.push("├──────────────────────────────────────────────────────┤");

  // Summary bar
  const readyIcon = result.ready ? "✅" : "⚠️";
  const readyText = result.ready
    ? "可发布（auto 项全过）"
    : "不建议发布（auto 项未全过）";
  lines.push(`│ ${readyIcon} ${s.passed}/${s.total} 通过  |  🟢${s.auto.passed}/${s.auto.total}  🔵${s.autoable.passed}/${s.autoable.total}  🟡${s.manual.total}  ⚪${s.missing.total}${" ".repeat(Math.max(0, 30))}│`);
  lines.push(`│ 结论: ${readyText}${" ".repeat(Math.max(0, 46 - readyText.length))}│`);

  lines.push("├──────────────────────────────────────────────────────┤");

  // Group by level
  const levelOrder = ["auto", "autoable", "manual", "missing"];
  let hasContentAbove = true;
  let hiddenCount = 0;

  for (const level of levelOrder) {
    const items = result.checks.filter((c) => c.item.level === level);
    if (items.length === 0) continue;

    // For manual and missing, show count only, hide details
    if (level === "manual" || level === "missing") {
      hiddenCount += items.length;
      continue;
    }

    // Auto and autoable: show all
    if (!hasContentAbove) {
      lines.push("├──────────────────────────────────────────────────────┤");
    }
    hasContentAbove = true;

    for (const check of items) {
      const icon = check.pass ? "✅" : "❌";
      const label = check.item.label.length > 33
        ? check.item.label.slice(0, 30) + "..."
        : check.item.label;
      lines.push(`│ ${icon} ${LEVEL_ICON[level]} ${label}${" ".repeat(Math.max(0, 36 - label.length))}│`);
      lines.push(`│   ${check.detail}${" ".repeat(Math.max(0, 50 - check.detail.length))}│`);
    }
  }

  // Show hidden items count
  if (hiddenCount > 0) {
    lines.push("├──────────────────────────────────────────────────────┤");
    lines.push(`│ 📋 ${hiddenCount} 项待验证/待补充（展开用 --all）${" ".repeat(Math.max(0, 40))}│`);
  }

  // Footer
  lines.push("├──────────────────────────────────────────────────────┤");
  if (result.ready) {
    lines.push(`│ 💡 /resource-publish ${result.resourceType} ${result.resourceName} --dry-run${" ".repeat(Math.max(0, 35))}│`);
  } else {
    lines.push("│ 💡 修复 auto 问题后再发布                          │");
  }
  lines.push("└──────────────────────────────────────────────────────┘");

  return lines;
}

/**
 * Render full birth certificate (all items, no folding).
 */
export function renderFullBirthResult(result: BirthResult): string[] {
  if (result.checks.length === 0) {
    return [
      "┌─ 出生证（完整）─────────────────────────────────┐",
      `│ ❌ 找不到资源: ${result.resourceType}/${result.resourceName}     │`,
      "└────────────────────────────────────────────────┘",
    ];
  }

  const lines: string[] = [];
  const s = result.summary;

  // Header
  const typeLabel = result.resourceType.charAt(0).toUpperCase() + result.resourceType.slice(1);
  const ver = result.version ? `  v${result.version}` : "";
  lines.push("┌─ 出生证（完整）───────────────────────────────────────┐");
  lines.push(`│ ${typeLabel}: ${result.resourceName}${ver}${" ".repeat(Math.max(0, 40 - result.resourceName.length - ver.length - typeLabel.length))}│`);
  lines.push(`│ ${s.passed}/${s.total} 通过  ready=${result.ready ? "✅" : "❌"}${" ".repeat(40)}│`);

  lines.push("├──────────────────────────────────────────────────────┤");

  const levelOrder: string[] = ["auto", "autoable", "manual", "missing"];

  for (const level of levelOrder) {
    const items = result.checks.filter((c) => c.item.level === level);
    if (items.length === 0) continue;

    lines.push(`│ ${LEVEL_ICON[level]} ${LEVEL_LABEL[level]} (${items.length})${" ".repeat(45)}│`);

    for (const check of items) {
      const icon = check.pass ? "✅" : "❌";
      const label = check.item.label.length > 30
        ? check.item.label.slice(0, 27) + "..."
        : check.item.label;
      lines.push(`│   ${icon} ${label}${" ".repeat(Math.max(0, 36 - label.length))}│`);
      lines.push(`│     ${check.detail}${" ".repeat(Math.max(0, 48 - check.detail.length))}│`);
    }

    lines.push("├──────────────────────────────────────────────────────┤");
  }

  lines.push("└──────────────────────────────────────────────────────┘");
  return lines;
}

/**
 * Render as JSON-compatible object for tool output.
 */
export function renderBirthResultJson(result: BirthResult): string {
  return JSON.stringify({
    resourceType: result.resourceType,
    resourceName: result.resourceName,
    version: result.version,
    ready: result.ready,
    summary: result.summary,
    checks: result.checks.map((c) => ({
      id: c.item.id,
      label: c.item.label,
      level: c.item.level,
      pass: c.pass,
      detail: c.detail,
    })),
  }, null, 2);
}
