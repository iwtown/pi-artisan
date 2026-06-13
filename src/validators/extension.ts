/**
 * .ts Extension validator.
 *
 * Checks:
 *   - export default function (entry point)
 *   - import from @earendil-works/pi-coding-agent
 *   - Tool names use snake_case
 *   - No .js imports (jiti handles .ts)
 *   - Tool names with namespace prefix (suggested)
 */

import type { ValidationIssue } from "../types.js";

/**
 * Validate a .ts extension file's source structure.
 */
export function validateExtensionStructure(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!/export\s+default\s+(async\s+)?function/.test(content)) {
    issues.push({ message: "Missing: 'export default function (pi: ExtensionAPI)' — extension entry point" });
  }

  if (!/@earendil-works\/pi-coding-agent/.test(content)) {
    issues.push({ message: "Missing import from '@earendil-works/pi-coding-agent'" });
  }

  const toolPattern = /name:\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = toolPattern.exec(content)) !== null) {
    const toolName = match[1];
    if (/[A-Z-]/.test(toolName) && !toolName.includes("/")) {
      issues.push({ message: `Tool name "${toolName}" should be snake_case (lowercase, underscores, no hyphens)` });
    }
  }

  const jsImports = content.match(/from\s+['"]\.[/.]+?\.js['"]/g);
  if (jsImports) {
    issues.push({ message: `Use .ts imports (jiti handles TypeScript): ${jsImports.join(", ")}` });
  }

  // Suggest namespace prefix for tool names without one
  const toolNamePattern = /name:\s*['"]([^'"/]+)['"]/g;
  let nsMatch;
  while ((nsMatch = toolNamePattern.exec(content)) !== null) {
    const toolName = nsMatch[1];
    if (!toolName.includes("/")) {
      issues.push({ message: `Tool name "${toolName}" 建议加命名空间前缀防冲突，如 my-project/${toolName}` });
    }
  }

  return issues;
}
