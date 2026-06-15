/**
 * Result formatting utilities for TUI notifications and tool responses.
 */

import { basename } from "node:path";
import type { ToolContext, ValidationIssue } from "../types.js";

const TYPE_LABELS: Record<string, string> = {
  "SKILL.md": "Skill",
  extension: "扩展",
  "prompt template": "提示词模板",
  theme: "主题",
  package: "包",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] || type;
}

/**
 * Format a validation result as a human-readable string.
 */
export function formatResult(type: string, filePath: string, issues: ValidationIssue[]): string {
  const fileName = basename(filePath);
  const label = typeLabel(type);
  if (issues.length === 0) return `✅ ${label} 校验通过: ${fileName}`;
  const item = issues.length === 1 ? "项" : "项";
  return `⚠️ ${label} 校验: ${issues.length} ${item}问题 — ${fileName}\n${
    issues.map((i) => `  - ${i.message}`).join("\n")
  }`;
}

/**
 * Notify results via TUI and widget.
 */
export function notifyResults(
  type: string,
  filePath: string,
  issues: ValidationIssue[],
  hint: string,
  ctx: ToolContext,
): void {
  const fileName = basename(filePath);
  const label = typeLabel(type);
  if (issues.length === 0) {
    let msg = `✅ ${label} 校验通过: ${fileName}`;
    if (hint) msg += `\n${hint}`;
    ctx.ui?.notify(msg, "info");
    ctx.ui?.setWidget("meta-validator", [`✅ ${label}: ${fileName} — 全部通过`]);
    return;
  }

  ctx.ui?.notify(`⚠️ ${label}: ${issues.length} 项问题`, "warning");
  const report = [`⚠️ ${label} (${issues.length} 项):`, ...issues.map((i) => `  - ${i.message}`)];
  if (hint) report.push(`\n${hint}`);
  ctx.ui?.setWidget("meta-validator", report);
}

/**
 * Convert string[] of issue messages to ValidationIssue[].
 */
export function toIssues(messages: string[]): ValidationIssue[] {
  return messages.map((message) => ({ message }));
}
