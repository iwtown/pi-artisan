/**
 * Skill scaffolder — generates a SKILL.md skeleton with radiant directory structure.
 *
 * Usage (from CLI or extension code):
 *   scaffoldSkill("my-skill", "当用户需要 X 时加载", "/path/to/target")
 *
 * Equivalent to scripts/init-skill.sh but in TypeScript for cross-platform use.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ScaffoldOptions {
  name: string;
  description: string;
  targetDir: string;
  overwrite?: boolean;
}

interface ScaffoldResult {
  success: boolean;
  path: string;
  error?: string;
}

const SKILL_TEMPLATE = (name: string, description: string): string => `---
name: ${name}
description: >-
  ${description}
tested-models: []
---

# ${name}

## Overview

Brief overview of what this skill does.

## When to Use

- Trigger 1: when user ...
- Trigger 2: when you need to ...

## Instructions

1. Step 1
2. Step 2
3. Step 3

## Examples

### Example 1

\`\`\`
User: "..."
Agent: ...
\`\`\`

## Gotchas

<!-- 真实失败案例。每次使用此 skill 出错后追加，格式：- [场景] 问题描述 -->

## Forbidden Load

<!-- 什么场景下本 skill 绝不加载？ -->

## Eval

### 正例（应加载此 skill 的场景）
-
### 反例（不应加载的场景）
-

## References

- [related-skill](../related-skill/SKILL.md)
`;

/**
 * Scaffold a new skill with SKILL.md + radiant directories.
 */
export function scaffoldSkill(options: ScaffoldOptions): ScaffoldResult {
  const { name, description, targetDir, overwrite = false } = options;

  // Validate name
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    return { success: false, path: targetDir, error: `name "${name}" is not kebab-case (lowercase, digits, hyphens only)` };
  }
  if (name.length > 64) {
    return { success: false, path: targetDir, error: `name too long (${name.length} chars, max 64)` };
  }
  if (!description) {
    return { success: false, path: targetDir, error: "description is required" };
  }
  if (description.length > 1024) {
    return { success: false, path: targetDir, error: `description too long (${description.length} chars, max 1024)` };
  }

  // Check existing
  if (existsSync(targetDir) && !overwrite) {
    return { success: false, path: targetDir, error: `Directory already exists: ${targetDir} (set overwrite: true to force)` };
  }

  // Create directories
  mkdirSync(targetDir, { recursive: true });
  mkdirSync(join(targetDir, "references"), { recursive: true });
  mkdirSync(join(targetDir, "scripts"), { recursive: true });
  mkdirSync(join(targetDir, "assets"), { recursive: true });

  // Write .gitkeep files
  writeFileSync(join(targetDir, "references", ".gitkeep"), "");
  writeFileSync(join(targetDir, "scripts", ".gitkeep"), "");
  writeFileSync(join(targetDir, "assets", ".gitkeep"), "");

  // Write SKILL.md
  const skillPath = join(targetDir, "SKILL.md");
  writeFileSync(skillPath, SKILL_TEMPLATE(name, description));

  return { success: true, path: skillPath };
}
