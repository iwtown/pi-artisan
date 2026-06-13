/**
 * LLM tool registration — registers all 5 validate_* tools callable by the AI.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { resolvePath } from "../utils/path.js";
import { validateSkill } from "../validators/skill.js";
import { runBirthCert } from "../birth/runner.js";
import { renderBirthResultJson } from "../birth/renderer.js";
import { validateExtensionStructure } from "../validators/extension.js";
import { validatePromptTemplate } from "../validators/prompt.js";
import { validateThemeColors } from "../validators/theme.js";
import { validatePackage } from "../validators/package.js";
import type { ValidationIssue, ResourceType } from "../types.js";
import { scanByType, scanResources, findResource } from "../catalog/scanner.js";
import { computeQualityScore } from "../catalog/score.js";
import { generateReport, formatResourceTable } from "../catalog/report.js";
import { checkAging } from "../catalog/aging.js";
import { checkVersions } from "../catalog/version.js";
import { execSync } from "node:child_process";
import { diagnoseSkill, formatDiagnostic } from "../optimizer/optimizer.js";

interface ToolDef {
  name: string;
  label: string;
  description: string;
  validateFn: (filePath: string) => ValidationIssue[];
  typeLabel: string;
}

const TOOLS: ToolDef[] = [
  {
    name: "validate_skill",
    label: "Validate Skill",
    description: "Validate a SKILL.md file's frontmatter and directory structure. Checks required fields (name, description), kebab-case name format, description length, gotchas/eval sections, radiant dirs (references/ scripts/ assets/). Returns pass/fail with issue list.",
    validateFn: validateSkill,
    typeLabel: "SKILL.md",
  },
  {
    name: "validate_extension",
    label: "Validate Extension",
    description: "Validate a .ts Pi extension file. Checks: has export default function, imports from @earendil-works/pi-coding-agent, tool names use snake_case convention, no .js imports.",
    validateFn: (f) => validateExtensionStructure(readFileSync(f, "utf-8")),
    typeLabel: "extension",
  },
  {
    name: "validate_prompt",
    label: "Validate Prompt Template",
    description: "Validate a Pi prompt template (.md). Checks: valid frontmatter, description length, argument-hint format, filename valid as /command.",
    validateFn: (f) => validatePromptTemplate(readFileSync(f, "utf-8"), f),
    typeLabel: "prompt template",
  },
  {
    name: "validate_theme",
    label: "Validate Theme",
    description: "Validate a Pi theme file (.json). Checks: valid JSON, has name, all 51 required color tokens present, color values valid (hex/rgb/vars ref).",
    validateFn: (f) => validateThemeColors(readFileSync(f, "utf-8"), f),
    typeLabel: "theme",
  },
  {
    name: "validate_package",
    label: "Validate Package",
    description: "Validate a Pi Package directory. Checks: package.json exists, pi manifest paths resolve, or conventional directories present.",
    validateFn: (f) => validatePackage(f),
    typeLabel: "package",
  },
];

/**
 * Register all validate_* LLM tools plus resource management tools.
 */
export function registerTools(pi: ExtensionAPI): void {
  // ── Validate tools ──
  for (const tool of TOOLS) {
    pi.registerTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: Type.Object({
        path: Type.String({ description: "Absolute or relative path to the file or directory" }),
      }),
      async execute(_id: string, params: { path: string }) {
        const filePath = resolvePath(params.path, {} as any);
        const notFound = !existsSync(filePath);
        const issues = notFound ? [] : tool.validateFn(filePath);
        const text = notFound
          ? `❌ File not found: ${filePath}`
          : issues.length === 0
            ? `✅ ${tool.typeLabel} validation passed: ${basename(filePath)}`
            : `⚠️ ${tool.typeLabel} validation: ${issues.length} issue${issues.length > 1 ? "s" : ""} in ${basename(filePath)}\n${issues.map((i) => `  - ${i.message}`).join("\n")}`;
        return { content: [{ type: "text" as const, text }], details: {} as any };
      },
    });
  }

  // ── resource_list tool ──
  pi.registerTool({
    name: "resource_list",
    label: "Resource List",
    description: "List installed Pi resources. Optionally filter by type (skill|extension|prompt|theme|package). Shows quality scores.",
    parameters: Type.Object({
      type: Type.Optional(Type.String({ description: "Resource type to filter by: skill, extension, prompt, theme, package" })),
    }),
    async execute(_id: string, params: { type?: string }) {
      const validTypes: ResourceType[] = ["skill", "extension", "prompt", "theme", "package"];
      const targetType = params.type ? validTypes.find((t) => t === params.type) : undefined;

      if (targetType) {
        const resources = scanByType(targetType);
        const scored = resources.map((r) => {
          try { const s = computeQualityScore(r.type, r.path); return { ...r, qualityScore: s.overall }; }
          catch { return { ...r, qualityScore: null }; }
        });
        return {
          content: [{ type: "text" as const, text: formatResourceTable(scored, targetType + "s") }],
          details: { resources: scored } as any,
        };
      }

      const all = scanResources();
      const summary = all.map((r) => `${r.type}:${r.name}${r.version ? "@" + r.version : ""}`).join("\n");
      return { content: [{ type: "text" as const, text: `Total: ${all.length} resources\n${summary}` }], details: { resources: all } as any };
    },
  });

  // ── resource_status tool ──
  pi.registerTool({
    name: "resource_status",
    label: "Resource Status",
    description: "Show detailed quality report for a specific resource. Requires type and name.",
    parameters: Type.Object({
      type: Type.String({ description: "Resource type: skill, extension, prompt, theme, package" }),
      name: Type.String({ description: "Resource name (slug for skills)" }),
    }),
    async execute(_id: string, params: { type: string; name: string }) {
      const validTypes: ResourceType[] = ["skill", "extension", "prompt", "theme", "package"];
      const type = validTypes.find((t) => t === params.type);
      if (!type) return { content: [{ type: "text" as const, text: `❌ Invalid type: ${params.type}` }], details: {} as any };

      const resource = findResource(type, params.name);
      if (!resource) return { content: [{ type: "text" as const, text: `❌ Resource not found: ${params.type}/${params.name}` }], details: {} as any };

      try {
        const score = computeQualityScore(resource.type, resource.path);
        resource.qualityScore = score.overall;
        const report = generateReport(resource, score);
        return { content: [{ type: "text" as const, text: report }], details: { resource, score } as any };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `❌ Error: ${e.message}` }], details: {} as any };
      }
    },
  });

  // ── resource_maintain tool ──
  pi.registerTool({
    name: "resource_maintain",
    label: "Resource Maintain",
    description: "Check resource health: aging detection (90d stale) + version tracking against remote sources (skillhub, npm).",
    parameters: Type.Object({}),
    async execute() {
      const agingResults = checkAging();
      const versionResults = await checkVersions();

      const stale = agingResults.filter((a) => a.status !== "active").length;
      const outdated = versionResults.filter((v) => !v.isUpToDate && v.latestVersion !== null).length;

      const lines: string[] = [];
      lines.push(`Aging: ${stale} stale/archived resources`);
      for (const a of agingResults.filter((a) => a.status !== "active")) {
        lines.push(`  ${a.name} (${a.type}) - ${a.daysSinceUpdate} days - ${a.status}`);
      }
      lines.push(`Versions: ${outdated} outdated resources`);
      for (const v of versionResults.filter((v) => !v.isUpToDate && v.latestVersion !== null)) {
        lines.push(`  ${v.name} (${v.type}): local ${v.currentVersion} → latest ${v.latestVersion}`);
      }
      if (stale === 0 && outdated === 0) lines.push("✅ All resources are healthy");

      return { content: [{ type: "text" as const, text: lines.join("\n") }], details: { aging: agingResults, versions: versionResults } as any };
    },
  });

  // ── optimize_skill tool ──
  pi.registerTool({
    name: "optimize_skill",
    label: "Optimize Skill",
    description: "Evaluate a SKILL.md using 8-dimension Rubric. Returns scores, weak points, and improvement suggestions. Does not auto-edit. Run after editing to re-evaluate.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to SKILL.md or directory containing it" }),
    }),
    async execute(_id: string, params: { path: string }) {
      const filePath = resolvePath(params.path, {} as any);
      const skillMd = filePath.endsWith("SKILL.md") ? filePath : `${filePath.replace(/\/+$/, "")}/SKILL.md`;
      if (!existsSync(skillMd)) {
        return { content: [{ type: "text" as const, text: `❌ SKILL.md not found at ${skillMd}` }], details: {} as any };
      }
      const diag = diagnoseSkill(skillMd);
      return { content: [{ type: "text" as const, text: formatDiagnostic(diag) }], details: { total: diag.evaluation.total, dimensions: diag.evaluation.dimensions } as any };
    },
  });

  // ── resource_publish tool ──
  pi.registerTool({
    name: "resource_publish",
    label: "Resource Publish",
    description: "Validate then publish a skill to SkillHub. Supports --dry-run for preflight. Only 'skill' type is supported.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the skill directory or SKILL.md" }),
      dry_run: Type.Optional(Type.Boolean({ description: "Preflight check only, no upload" })),
      version: Type.Optional(Type.String({ description: "Override version (semver)" })),
      changelog: Type.Optional(Type.String({ description: "Changelog text for this release" })),
    }),
    async execute(_id: string, params: { path: string; dry_run?: boolean; version?: string; changelog?: string }) {
      const dirPath = params.path.replace(/\/SKILL\.md$/, "");
      const skillMdPath = dirPath.endsWith("SKILL.md") ? dirPath : `${dirPath.replace(/\/+$/, "")}/SKILL.md`;

      if (!existsSync(skillMdPath)) {
        return { content: [{ type: "text" as const, text: `❌ SKILL.md not found at ${skillMdPath}` }], details: {} as any };
      }

      // Validate
      const issues = validateSkill(skillMdPath);
      if (issues.length > 0) {
        const detail = issues.map((i) => `  - ${i.message}`).join("\n");
        return { content: [{ type: "text" as const, text: `❌ Validation failed (${issues.length} issues):\n${detail}\nFix issues before publishing.` }], details: { issues } as any };
      }

      // Build and run skillhub publish command
      let cmd = `skillhub publish "${dirPath}"`;
      if (params.version) cmd += ` --version "${params.version}"`;
      if (params.changelog) cmd += ` --changelog "${params.changelog}"`;
      if (params.dry_run) cmd += ` --dry-run`;

      try {
        const out = execSync(cmd, { timeout: 30000, encoding: "utf-8" });
        return { content: [{ type: "text" as const, text: out.trim() }], details: {} as any };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `❌ Publish failed: ${e.message}` }], details: {} as any };
      }
    },
  });

  // ── resource_birth tool ──
  pi.registerTool({
    name: "resource_birth",
    label: "Resource Birth Certificate",
    description: "检查资源是否准备好发布。返回自动检查+待验证+待补充的完整清单。type: skill|extension|prompt|theme|package, name: slug/路径/显示名",
    parameters: Type.Object({
      type: Type.String({ description: "资源类型: skill/extension/prompt/theme/package" }),
      name: Type.String({ description: "资源名称（slug/路径/显示名）" }),
    }),
    async execute(_id: string, params: { type: string; name: string }) {
      const result = runBirthCert(params.type as any, params.name);
      if (result.checks.length === 0) {
        return {
          content: [{ type: "text" as const, text: `❌ 找不到资源: ${params.type}/${params.name}` }],
          details: {} as any,
        };
      }
      return {
        content: [{ type: "text" as const, text: renderBirthResultJson(result) }],
        details: {} as any,
      };
    },
  });
}
