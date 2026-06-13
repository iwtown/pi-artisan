/**
 * Prompt template validator (.md files in prompts/).
 *
 * Checks:
 *   - Filename valid as /command (only letters, digits, hyphens, underscores)
 *   - description ≤200 chars
 *   - argument-hint uses <required> or [optional] format
 *   - Trailing newline
 */

import { basename } from "node:path";
import type { ValidationIssue } from "../types.js";
import { parseFrontmatter } from "../utils/yaml.js";

/**
 * Validate a prompt template file.
 */
export function validatePromptTemplate(content: string, filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Filename as command name
  const fileName = basename(filePath, ".md");
  if (!/^[a-zA-Z0-9_-]+$/.test(fileName)) {
    issues.push({
      message: `Filename "${fileName}.md" contains invalid chars — only letters, digits, hyphens, underscores (becomes /command name)`,
    });
  }

  // Frontmatter is optional for prompts, but if present, validate fields
  const fm = parseFrontmatter(content);
  if (!fm) return issues;

  const descMatch = fm.match(/^description:\s*(.+)$/m);
  if (descMatch && descMatch[1].trim().length > 200) {
    issues.push({ message: `description exceeds 200 characters (${descMatch[1].trim().length})` });
  }

  const hintMatch = fm.match(/^argument-hint:\s*(.+)$/m);
  if (hintMatch) {
    const hint = hintMatch[1].trim();
    if (!/^<[^>]+>$/.test(hint) && !/^\[[^\]]+\]$/.test(hint)) {
      issues.push({ message: `argument-hint should use <required> or [optional] format, got: "${hint}"` });
    }
  }

  // ── tags field recommendation ──
  const tagsMatch = fm.match(/^tags:\s*(.+)$/m);
  if (!tagsMatch) {
    issues.push({ message: "建议添加 tags 字段对 prompt 进行分类（如: [code-review, quality]）" });
  }

  if (content.length > 0 && !content.endsWith("\n")) {
    issues.push({ message: "File should end with a trailing newline" });
  }

  return issues;
}
