/**
 * Result formatting utilities for TUI notifications and tool responses.
 */

import { basename } from "node:path";
import type { ToolContext, ValidationIssue } from "../types.js";

/**
 * Format a validation result as a human-readable string.
 */
export function formatResult(type: string, filePath: string, issues: ValidationIssue[]): string {
  const fileName = basename(filePath);
  if (issues.length === 0) return `✅ ${type} validation passed: ${fileName}`;
  return `⚠️ ${type} validation: ${issues.length} issue${issues.length > 1 ? "s" : ""} in ${fileName}\n${
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
  if (issues.length === 0) {
    let msg = `✅ ${type} validation passed: ${fileName}`;
    if (hint) msg += `\n${hint}`;
    ctx.ui?.notify(msg, "info");
    ctx.ui?.setWidget("meta-validator", [`✅ ${type}: ${fileName} — all checks passed`]);
    return;
  }

  ctx.ui?.notify(`⚠️ ${type}: ${issues.length} issue${issues.length > 1 ? "s" : ""}`, "warning");
  const report = [`⚠️ ${type} (${issues.length}):`, ...issues.map((i) => `  - ${i.message}`)];
  if (hint) report.push(`\n${hint}`);
  ctx.ui?.setWidget("meta-validator", report);
}

/**
 * Convert string[] of issue messages to ValidationIssue[].
 */
export function toIssues(messages: string[]): ValidationIssue[] {
  return messages.map((message) => ({ message }));
}
