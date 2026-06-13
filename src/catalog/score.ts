/**
 * Quality scoring model — computes a 0-100 quality score per resource type.
 *
 * Skills use a multi-dimension weighted score.
 * Other types use a simplified pass-rate score.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import type { ResourceType, QualityScore } from "../types.js";
import { validateSkillFrontmatter, checkRadiantDirs } from "../validators/skill.js";
import { validateExtensionStructure } from "../validators/extension.js";
import { validatePromptTemplate } from "../validators/prompt.js";
import { validateThemeColors } from "../validators/theme.js";
import { validatePackage } from "../validators/package.js";

// ── Skill score dimensions with weights ──

interface SkillDimensions {
  structure: number;   // pass rate on structural checks (name, version, desc, etc.)
  content: number;     // gotchas entries, eval completeness, description quality
  radiant: number;     // references/ scripts/ assets/ richness
  version: number;     // version present + format
  testing: number;     // tested-models coverage
}

const SKILL_WEIGHTS: Record<keyof SkillDimensions, number> = {
  structure: 0.30,
  content: 0.25,
  radiant: 0.15,
  version: 0.15,
  testing: 0.15,
};

function computeSkillScore(filePath: string): QualityScore {
  const content = readFileSync(filePath, "utf-8");
  const frontmatterIssues = validateSkillFrontmatter(content);
  const dirIssues = checkRadiantDirs(filePath);
  const allIssues = [...frontmatterIssues, ...dirIssues];

  // Structure: pass rate of structural items
  const structuralItems = allIssues.length;
  const structurePass = Math.max(0, 1 - structuralItems / 25); // 25 max possible checks
  const structure = Math.round(structurePass * 100);

  // Content: gotchas quality
  const gotchaMatch = content.match(/## Gotchas?\n([\s\S]*?)(?=\n## |$)/);
  const gotchaText = gotchaMatch ? gotchaMatch[1] : "";
  const gotchaEntries = (gotchaText.match(/^[-*]\s/gm) || []).length;
  const contentScore = Math.min(100, Math.round(gotchaEntries * 10 + (content.includes("### 正例") ? 20 : 0) + (content.includes("### 反例") ? 20 : 0)));

  // Radiant: how many of the 3 dirs have files
  const radiantDirs = ["references", "scripts", "assets"];
  let radiantScore = 0;
  for (const d of radiantDirs) {
    const dir = filePath.replace(/\/[^/]+$/, `/${d}`);
    try {
      const files = readdirSync(dir);
      if (files.some((f: string) => f !== ".gitkeep")) radiantScore += 33;
    } catch { /* dir doesn't exist */ }
  }

  // Version
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const fm = fmMatch ? fmMatch[1] : "";
  const versionScore = /^version:\s*\d+\.\d+\.\d+$/m.test(fm) ? 100 : 0;

  // Testing
  const hasTestedModels = content.includes("tested-models");
  const testingScore = hasTestedModels ? 100 : 0;

  const dimensions: SkillDimensions = {
    structure: structure,
    content: Math.min(100, contentScore),
    radiant: radiantScore,
    version: versionScore,
    testing: testingScore,
  };

  const overall = Math.round(
    dimensions.structure * SKILL_WEIGHTS.structure +
    dimensions.content * SKILL_WEIGHTS.content +
    dimensions.radiant * SKILL_WEIGHTS.radiant +
    dimensions.version * SKILL_WEIGHTS.version +
    dimensions.testing * SKILL_WEIGHTS.testing,
  );

  return { overall, dimensions: dimensions as unknown as Record<string, number> };
}

// ── Simplified scoring for non-skill types ──

function computeSimpleScore(validateFn: () => number): QualityScore {
  const issueCount = validateFn();
  const passRate = Math.max(0, Math.round((1 - issueCount / 10) * 100));
  return { overall: passRate, dimensions: { structure: passRate } };
}

/**
 * Compute a quality score for a resource.
 */
export function computeQualityScore(type: ResourceType, resourcePath: string): QualityScore {
  switch (type) {
    case "skill":
      return computeSkillScore(resourcePath);

    case "extension": {
      const content = readFileSync(resourcePath, "utf-8");
      const issues = validateExtensionStructure(content);
      return computeSimpleScore(() => issues.length);
    }

    case "prompt": {
      const content = readFileSync(resourcePath, "utf-8");
      const issues = validatePromptTemplate(content, resourcePath);
      return computeSimpleScore(() => issues.length);
    }

    case "theme": {
      const content = readFileSync(resourcePath, "utf-8");
      const issues = validateThemeColors(content, resourcePath);
      return computeSimpleScore(() => issues.length);
    }

    case "package": {
      // 包名可能是纯名称（来自 scanner），也可能是真实目录路径（来自测试）
      // 只有真实路径才能做文件校验
      if (existsSync(resourcePath)) {
        const dir = resourcePath.replace(/\/[^/]+$/, "");
        const issues = validatePackage(dir);
        return computeSimpleScore(() => issues.length);
      }
      // 纯名称路径，跳过文件校验，返回中性分
      return { overall: 50, dimensions: {} };
    }

    default:
      return { overall: 0, dimensions: {} };
  }
}
