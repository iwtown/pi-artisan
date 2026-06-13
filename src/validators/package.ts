/**
 * Pi Package validator (directory with package.json).
 *
 * Checks:
 *   - package.json exists
 *   - Valid JSON
 *   - "pi-package" in keywords (recommended)
 *   - pi manifest paths resolve (extensions/skills/prompts/themes)
 *   - OR conventional directories exist (extensions/ skills/ prompts/ themes/)
 *   - OR neither — not a Pi package
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ValidationIssue } from "../types.js";

/**
 * Validate a Pi Package directory.
 */
export function validatePackage(dirPath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const pkgPath = join(dirPath, "package.json");
  if (!existsSync(pkgPath)) {
    issues.push({ message: "Missing package.json — Pi packages need a package.json with 'pi' manifest or conventional directories" });
    return issues;
  }

  let pkg: any;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch (e: any) {
    issues.push({ message: `Invalid package.json: ${e.message}` });
    return issues;
  }

  // Check keywords
  const keywords: string[] = pkg.keywords || [];
  if (!keywords.includes("pi-package")) {
    issues.push({ message: 'Suggested: add "pi-package" to "keywords" for gallery discoverability' });
  }

  // Check description length
  if (pkg.description && typeof pkg.description === "string" && pkg.description.length > 80) {
    issues.push({ message: `Description exceeds 80 characters (${pkg.description.length}), 建议缩短（npm 规范）` });
  }

  // Check pi manifest paths
  const pi: any = pkg.pi;
  if (pi && typeof pi === "object") {
    for (const resource of ["extensions", "skills", "prompts", "themes"]) {
      const paths = pi[resource];
      if (!paths) continue;
      const list = Array.isArray(paths) ? paths : [paths];
      for (const p of list) {
        if (typeof p !== "string") continue;
        const resolved = join(dirPath, p);
        if (!existsSync(resolved)) {
          issues.push({ message: `pi.${resource} path "${p}" does not exist` });
        }
      }
    }
  } else {
    // No pi manifest — check conventional directories
    const conventionalDirs = ["extensions", "skills", "prompts", "themes"];
    const hasAny = conventionalDirs.some((d) => existsSync(join(dirPath, d)));
    if (!hasAny) {
      issues.push({
        message: 'No pi manifest or conventional directories found. Add "pi" key to package.json or create extensions/skills/prompts/themes directories.',
      });
    }
  }

  return issues;
}
