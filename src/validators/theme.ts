/**
 * Theme validator (.json files in themes/).
 *
 * Checks:
 *   - Valid JSON
 *   - Has "name" string field
 *   - Has "colors" object
 *   - All 51 required color tokens present (grouped by category)
 *   - Color values valid: hex (#RRGGBB), 0-255 int, empty string, or var reference
 */

import { basename } from "node:path";
import type { ValidationIssue } from "../types.js";

/**
 * All 51 required color tokens, grouped by category for readable error messages.
 */
export const REQUIRED_TOKENS: Record<string, string[]> = {
  "Core UI":        ["accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText"],
  "Backgrounds":    ["selectedBg", "userMessageBg", "userMessageText", "customMessageBg", "customMessageText", "customMessageLabel", "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput"],
  "Markdown":       ["mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet"],
  "Diffs":          ["toolDiffAdded", "toolDiffRemoved", "toolDiffContext"],
  "Syntax":         ["syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation"],
  "Thinking":       ["thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh"],
  "Bash Mode":      ["bashMode"],
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate a theme JSON content.
 * @param raw - Raw JSON string
 * @param filePath - Optional file path for filename validation
 */
export function validateThemeColors(raw: string, filePath?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch (e: any) {
    issues.push({ message: `Invalid JSON: ${e.message}` });
    return issues;
  }

  if (!json.name || typeof json.name !== "string") {
    issues.push({ message: 'Missing or invalid "name" field (must be a string)' });
  }

  // Filename naming check
  if (filePath) {
    const fileName = basename(filePath, ".json");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fileName)) {
      issues.push({ message: `Filename "${fileName}.json" 应使用 kebab-case（只能小写字母、数字、连字符）` });
    }
  }

  if (!json.colors || typeof json.colors !== "object") {
    issues.push({ message: 'Missing "colors" object' });
    return issues;
  }

  const vars = json.vars || {};
  const colors = json.colors;

  // Check each group for missing tokens
  for (const [group, tokens] of Object.entries(REQUIRED_TOKENS)) {
    const missing = tokens.filter((t) => !(t in colors));
    if (missing.length > 0) {
      issues.push({ message: `Missing ${group} color(s): ${missing.join(", ")}` });
    }
  }

  // Validate color values
  for (const [key, value] of Object.entries(colors)) {
    if (value === "") continue; // empty = terminal default
    if (typeof value === "number") {
      if (value < 0 || value > 255 || !Number.isInteger(value)) {
        issues.push({ message: `${key} = ${value} (must be 0-255 integer for 256-color mode)` });
      }
      continue;
    }
    if (typeof value !== "string") {
      issues.push({ message: `${key} = ${JSON.stringify(value)} (must be hex, number, empty string, or var ref)` });
      continue;
    }
    if (HEX_RE.test(value)) continue;
    // Check if it's a reference to a var
    if (vars && typeof vars === "object" && value in vars) continue;
    issues.push({ message: `${key} = "${value}" (not a valid hex color or var reference)` });
  }

  return issues;
}
