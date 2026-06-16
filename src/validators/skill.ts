/**
 * SKILL.md validator — frontmatter + radiant directory structure.
 *
 * 20 checks:
 *   - YAML frontmatter presence
 *   - name: kebab-case, 1-64 chars
 *   - description: exists, ≤1024, routing-trigger format
 *   - version: exists, semver format (x.y.z)
 *   - compatibility: ≤500 chars
 *   - allowed-tools: format check
 *   - tested-models: array format suggestion, result format suggestion
 *   - license: optional per Agent Skills spec (MIT, Apache-2.0, etc.)
 *   - YAML structure validity
 *   - Trailing newline
 *   - ## Gotchas section: exists, non-empty, no placeholders, actual entries
 *   - ## Eval section: exists, with 正例/反例 subsections
 *   - ## Forbidden Load section: exists, non-empty, no placeholders
 *   - Line count ≤300
 *   - Radiant dirs: references/ scripts/ assets/ (exist + non-empty)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ValidationIssue } from "../types.js";
import { parseFrontmatter, extractFieldValue, extractNestedMapping, checkYamlStructure } from "../utils/yaml.js";

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────

/**
 * Full skill validation: reads file, checks frontmatter + directories.
 */
export function validateSkill(filePath: string): ValidationIssue[] {
  const content = readFileSync(filePath, "utf-8");
  const issues = validateSkillFrontmatter(content);
  issues.push(...checkRadiantDirs(filePath));
  return issues;
}

/**
 * Content-only frontmatter validation (no file I/O — testable).
 */
export function validateSkillFrontmatter(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const fm = parseFrontmatter(content);
  if (!fm) {
    issues.push({ message: "Missing YAML frontmatter (should start with --- ... ---)" });
    return issues;
  }

  // ── name ──
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  if (!nameMatch) {
    issues.push({ message: "Missing required field: name" });
  } else {
    const name = nameMatch[1].trim();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      issues.push({ message: `name "${name}" is not kebab-case (use only lowercase a-z, 0-9, hyphens)` });
    }
    if (name.length < 1 || name.length > 64) {
      issues.push({ message: `name length ${name.length} (valid: 1-64 chars)` });
    }
  }

  // ── description (with block scalar support) ──
  const descRaw = extractFieldValue(fm, "description");
  if (!descRaw) {
    issues.push({ message: "Missing required field: description" });
  } else {
    if (descRaw.length > 1024) {
      issues.push({ message: `description exceeds 1024 characters (${descRaw.length})` });
    }
    // 路由式检查：避免功能说明式描述
    if (/^(Generate|Create|Provide|Handle|Manage|Interact|Use|This skill)/i.test(descRaw)) {
      issues.push({ message: 'description 建议改为路由触发格式：以"当用户需要…时加载"开头，非功能说明' });
    }
    if (!/当用户|用户需要|用户想要|用户提到|用户要求|用户输入|when.*user|when.*need/i.test(descRaw)) {
      issues.push({ message: 'description 应描述触发场景（"当用户需要…时加载"），非功能说明' });
    }
  }

  // ── compatibility (optional) ──
  const compatMatch = fm.match(/^compatibility:\s*(.+)$/m);
  if (compatMatch && compatMatch[1].trim().length > 500) {
    issues.push({ message: `compatibility exceeds 500 characters (${compatMatch[1].trim().length})` });
  }

  // ── allowed-tools (optional) ──
  const toolsMatch = fm.match(/^allowed-tools:\s*(.+)$/m);
  if (toolsMatch) {
    const tools = toolsMatch[1].trim();
    if (!/^[A-Za-z0-9_*()/,:-]+(?:\s+[A-Za-z0-9_*()/,:-]+)*$/.test(tools)) {
      issues.push({ message: `allowed-tools format: space-delimited tool names, got: "${tools.slice(0, 60)}"` });
    }
  }

  // ── version (required) ──
  const versionMatch = fm.match(/^version:\s*(.+)$/m);
  if (!versionMatch) {
    issues.push({ message: "Missing required field: version (semver format x.y.z)" });
  } else {
    const version = versionMatch[1].trim();
    if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) {
      issues.push({ message: `version "${version}" is not valid semver (expected x.y.z format)` });
    }
  }

  // ── tested-models (optional, but recommended) ──
  const testedRaw = extractFieldValue(fm, "tested-models");
  if (testedRaw) {
    if (!/^\[[^\]]+\]$/.test(testedRaw) && !testedRaw.includes(",")) {
      issues.push({ message: "tested-models 格式建议使用 [model1, model2] 数组格式" });
    }
    // 检查是否包含结果记录（model + result + notes 模式）
    if (!/result\s*[:：]/.test(testedRaw) && !/notes\s*[:：]/.test(testedRaw)) {
      issues.push({ message: "tested-models 建议记录每个模型的测试结果（如: - model: xxx\\n  result: pass\\n  notes: ...）" });
    }
  } else {
    issues.push({ message: "建议添加 tested-models 字段记录跨模型测试结果（如: [gpt-4, claude-3, deepseek-v4]）" });
  }

  // ── license (optional, per Agent Skills spec) ──
  const licenseMatch = fm.match(/^license:\s*(.+)$/m);
  if (licenseMatch) {
    const license = licenseMatch[1].trim();
    if (!/^[a-zA-Z0-9 .-]+$/.test(license)) {
      issues.push({ message: `license "${license}" 格式异常，建议使用标准 SPDX 标识符（如 MIT、Apache-2.0）` });
    }
  } else {
    issues.push({ message: "建议添加 license 字段（遵循 Agent Skills 标准，如 MIT）" });
  }

  // ── upstream block (optional) ──
  if (fm.includes("upstream:")) {
    const upstream = extractNestedMapping(fm, "upstream");
    if (upstream) {
      if (!upstream["source"]) {
        issues.push({ message: "upstream.source 必填（例如 skillhub/<slug> 或 github:<user>/<repo>）" });
      }
      if (upstream["version"] && !/^\d+\.\d+\.\d+/.test(upstream["version"])) {
        issues.push({ message: `upstream.version "${upstream["version"]}" 建议使用 semver 格式 (x.y.z)` });
      }
      if (upstream["sync"] && !["manual", "auto-patch", "never"].includes(upstream["sync"])) {
        issues.push({ message: `upstream.sync "${upstream["sync"]}" 无效，可选: manual, auto-patch, never` });
      }
    }
  }

  // ── YAML structure validity ──
  issues.push(...checkYamlStructure(fm).map((m) => ({ message: m })));

  // ── Trailing newline ──
  if (content.length > 0 && !content.endsWith("\n")) {
    issues.push({ message: "File should end with a trailing newline" });
  }

  // ── Gotchas section ──
  if (!content.includes("## Gotchas") && !content.includes("## Gotcha")) {
    issues.push({ message: "建议添加 ## Gotchas 节（记录真实失败案例，gotchas 是最有价值的内容）" });
  } else {
    const gotchaSection = content.match(/## Gotchas?\n([\s\S]*?)(?=\n## |$)/);
    if (gotchaSection) {
      const sectionText = gotchaSection[1];
      if (sectionText.trim().length < 10) {
        issues.push({ message: "Gotchas 节内容为空或仅占位符，建议追加真实失败案例" });
      } else {
        // 占位符模式检测
        const placeholderPatterns = [/真实失败案例/, /每次使用此 skill 出错后追加/, /TODO/i, /待补充/, /<!--\s*(TODO|待补充|真实失败案例|FIXME)/i, /此 skill 出错后/];
        for (const pattern of placeholderPatterns) {
          if (pattern.test(sectionText)) {
            issues.push({ message: "Gotchas 节包含占位符内容，请替换为真实失败案例" });
            break;
          }
        }
        // 实际条目检测：至少有一条以 - 或 * 开头的非注释列表项
        const entries = sectionText.split("\n").filter((line) => {
          const trimmed = line.trim();
          return (trimmed.startsWith("- ") || trimmed.startsWith("* ")) && !trimmed.startsWith("<!--");
        });
        if (entries.length === 0) {
          issues.push({ message: "Gotchas 节缺少实际条目（以 \"- \" 或 \"* \" 开头），建议追加真实失败案例" });
        }
      }
    }
  }

  // ── Eval section ──
  if (!content.includes("## Eval") && !content.includes("## 评估")) {
    issues.push({ message: "建议添加 ## Eval 节（包含正例、反例、forbidden load 三类）" });
  } else {
    const evalSection = content.match(/## Eval\n([\s\S]*?)(?=\n## |$)/);
    if (evalSection) {
      const evalText = evalSection[1];
      // Check for 正例 subsection
      const hasPros = /#{1,4}\s*正例/.test(evalText);
      if (!hasPros) {
        issues.push({ message: "Eval 节缺少 ## 正例 子节（Define scenarios where this skill should trigger）" });
      } else {
        // Check 正例 has content
        const prosSection = evalText.match(/#{1,4}\s*正例\n([\s\S]*?)(?=\n#{1,4}|$)/);
        if (prosSection && prosSection[1].trim().length < 5) {
          issues.push({ message: "Eval 正例 子节内容为空，请补充至少一条加载此 skill 的场景" });
        }
      }
      // Check for 反例 subsection
      const hasCons = /#{1,4}\s*反例/.test(evalText);
      if (!hasCons) {
        issues.push({ message: "Eval 节缺少 ## 反例 子节（Define scenarios where this skill should NOT trigger）" });
      } else {
        const consSection = evalText.match(/#{1,4}\s*反例\n([\s\S]*?)(?=\n#{1,4}|$)/);
        if (consSection && consSection[1].trim().length < 5) {
          issues.push({ message: "Eval 反例 子节内容为空，请补充至少一条不应加载此 skill 的场景" });
        }
      }
    }
  }

  // ── Forbidden Load ──
  if (!content.includes("Forbidden") && !content.includes("不加载") && !content.includes("绝不")) {
    issues.push({ message: "建议添加 Forbidden Load 条件：什么场景下本 skill 不加载" });
  } else {
    const forbiddenSection = content.match(/## Forbidden Load\n([\s\S]*?)(?=\n##|$)/);
    if (forbiddenSection) {
      const sectionText = forbiddenSection[1];
      if (sectionText.trim().length < 15) {
        issues.push({ message: "Forbidden Load 节内容过短，建议明确列出不应加载的场景" });
      } else {
        // 占位符检测
        const placeholderPatterns = [/绝不加载/, /不应加载的场景/, /<!--\s*(TODO|待补充|不应加载的场景|FIXME)/i, /TODO/i, /待补充/];
        for (const pattern of placeholderPatterns) {
          if (pattern.test(sectionText)) {
            issues.push({ message: "Forbidden Load 节包含占位符内容，请替换为实际的不加载条件" });
            break;
          }
        }
        // 实际条目检测
        const entries = sectionText.split("\n").filter((line) => {
          const trimmed = line.trim();
          return (trimmed.startsWith("- ") || trimmed.startsWith("* ")) && !trimmed.startsWith("<!--");
        });
        if (entries.length === 0) {
          issues.push({ message: "Forbidden Load 节缺少实际条目，建议列出具体的不加载条件" });
        }
      }
    }
  }

  // ── Line count ──
  const lineCount = content.split("\n").length;
  if (lineCount > 300) {
    issues.push({
      message: `SKILL.md ${lineCount} 行，建议精简或拆分到 references/（每个 Skill 都是一种税，没有这句 Agent 会不会做错？不会就删）`,
    });
  }

  return issues;
}

/**
 * Check for radiant directory structure (references/ scripts/ assets/).
 */
export function checkRadiantDirs(filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const dir = dirname(filePath);
  const dirs = ["references", "scripts", "assets"];
  const missing = dirs.filter((d) => !existsSync(join(dir, d)));
  if (missing.length === dirs.length) {
    issues.push({ message: "建议添加 references/ scripts/ assets/ 目录实现「辐射厚」架构（当前仅有 SKILL.md）" });
  } else if (missing.length > 0) {
    issues.push({ message: `建议添加 ${missing.join("/ ")} 目录完善 Skill 架构` });
  }

  // 检查存在的目录是否有实际内容（非 .gitkeep 和空文件）
  const subdirs = dirs.filter((d) => existsSync(join(dir, d)));
  for (const subdir of subdirs) {
    const entries = readdirSync(join(dir, subdir));
    const realFiles = entries.filter((f) => f !== ".gitkeep" && f.length > 0);
    if (realFiles.length === 0) {
      issues.push({ message: `${subdir}/ 目录为空（仅有 .gitkeep），建议放入实际参考文件` });
    }
  }

  return issues;
}
