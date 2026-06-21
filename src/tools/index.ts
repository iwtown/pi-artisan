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
import { skillGitDeployTool, resourceGitDeployTool, revertDeploy, listDeploys } from "../tools/git-deploy.js";
import { acquireSkill } from "../tools/acquire.js";
import { toggleSkill, listSkillToggles } from "../tools/toggle.js";
import { upgradeSkill, listUpgradeStatus, upgradeAll, dependencyGraph } from "../tools/upgrade.js";
import { addRegistryTrigger, removeRegistryTrigger, showRegistry } from "../tools/registry.js";
import { listRollbacks, rollbackSkill } from "../tools/rollback.js";
import { recordToggle, recordUpgrade, usageReport } from "../tools/usage.js";
import { checkAging } from "../catalog/aging.js";
import { checkVersions } from "../catalog/version.js";
import { execSync } from "node:child_process";
import { diagnoseSkill, formatDiagnostic } from "../optimizer/optimizer.js";
import { adaptAll, adaptByType, adaptResource, formatAdaptReport, formatAdaptSummary } from "../adaptation/engine.js";

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

  // ── adapt tool ──
  pi.registerTool({
    name: "adapt_resource",
    label: "Adaptation Check",
    description: "对能力包运行 Pi Agent 适配化改造检查。type 可选（skill/extension/prompt/theme/package），name 可选。不传参则检查全部。返回通过/失败及详细问题列表。",
    parameters: Type.Object({
      type: Type.Optional(Type.String({ description: "资源类型: skill/extension/prompt/theme/package" })),
      name: Type.Optional(Type.String({ description: "资源名称（可选）" })),
    }),
    async execute(_id: string, params: { type?: string; name?: string }) {
      let reports;
      if (params.type && params.name) {
        const { scanByType } = await import("../catalog/scanner.js");
        const resources = scanByType(params.type as any);
        const target = resources.find((r: any) => r.name === params.name);
        if (!target) return { content: [{ type: "text" as const, text: `❌ 未找到 ${params.type}/${params.name}` }], details: {} as any };
        reports = [adaptResource(target)];
      } else if (params.type) {
        reports = adaptByType(params.type);
      } else {
        reports = adaptAll();
      }
      const lines = [formatAdaptSummary(reports)];
      for (const r of reports.filter((x) => !x.allPassed).slice(0, 5)) {
        lines.push("");
        lines.push(formatAdaptReport(r));
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }], details: { reports } as any };
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

  // ── skill_git_deploy tool ──
  pi.registerTool(skillGitDeployTool);

  // ── resource_git_deploy tool ──
  pi.registerTool(resourceGitDeployTool);

  // ── skill_git_revert tool ──
  pi.registerTool({
    name: "skill_git_revert",
    label: "Skill Git Revert",
    description: "Revert a previous deploy commit in the pi-capabilities repository by hash, then push. Usage: skill_git_revert --hash <commit-hash>",
    parameters: Type.Object({
      hash: Type.String({ description: "Git commit hash to revert (hex string)" }),
    }),
    execute: (_id: string, params: { hash: string }) => {
      return Promise.resolve(revertDeploy(params.hash));
    },
  });

  // ── skill_git_deploy_log tool ──
  pi.registerTool({
    name: "skill_git_deploy_log",
    label: "Skill Git Deploy Log",
    description: "Show last 5 deploy commits in the pi-capabilities repository.",
    parameters: Type.Object({}),
    execute: () => {
      return Promise.resolve(listDeploys());
    },
  });

  // ── skill_acquire tool ──
  pi.registerTool({
    name: "skill_acquire",
    label: "Skill Acquire",
    description: "从外部源（GitHub/Gitee）安装 skill 到 pi-capabilities。自动克隆 + 创建符号链接 + 校验。与 /find-skills 配合使用：发现技能后，用此工具安装。",
    parameters: Type.Object({
      name: Type.String({ description: "Skill 名称（kebab-case，如 'my-skill'）" }),
      source: Type.String({ description: "源地址。GitHub: 'user/repo' 或完整 URL; Gitee: 完整 URL" }),
    }),
    execute: (_id: string, params: { name: string; source: string }) => {
      const result = acquireSkill(params.name, params.source);
      return Promise.resolve({ content: [{ type: "text" as const, text: result.message }], details: result as any });
    },
  });

  // ── skill_toggle tool ──
  pi.registerTool({
    name: "skill_toggle",
    label: "Skill Toggle",
    description: "开关 skill 的按需加载状态。不常用的 skill 建议关掉（on=true），使用时再切换回来（on=false）。支持批量切换（多个 name 逗号分隔）。",
    parameters: Type.Object({
      name: Type.String({ description: "Skill 名称，多个用逗号分隔（如 'x-cmd,ponytail'）" }),
      on: Type.Boolean({ description: "true = 按需加载（关掉），false = 常驻（打开）" }),
    }),
    execute: (_id: string, params: { name: string; on: boolean }) => {
      const names = params.name.split(",").map((n) => n.trim()).filter(Boolean);
      const results = names.map((n) => {
        const r = toggleSkill(n, params.on);
        if (r.changed) recordToggle(n, params.on);
        return r;
      });
      const lines = results.map((r) => r.message);
      return Promise.resolve({ content: [{ type: "text" as const, text: lines.join("\n") }], details: results as any });
    },
  });

  // ── skill_list_toggles tool ──
  pi.registerTool({
    name: "skill_list_toggles",
    label: "Skill List Toggles",
    description: "列出所有 skill 的按需加载状态（常驻 vs 💤 按需加载）。",
    parameters: Type.Object({}),
    execute: () => {
      return Promise.resolve({ content: [{ type: "text" as const, text: listSkillToggles() }], details: {} as any });
    },
  });

  // ── skill_upgrade tool ──
  pi.registerTool({
    name: "skill_upgrade",
    label: "Skill Upgrade",
    description: "升级指定 skill 到最新上游版本。自动备份旧版、拉取新版、校验。仅支持 github:/gitee: 源的 skill。",
    parameters: Type.Object({
      name: Type.String({ description: "Skill 名称" }),
    }),
    execute: (_id: string, params: { name: string }) => {
      const result = upgradeSkill(params.name);
      if (result.upgraded) recordUpgrade(params.name);
      return Promise.resolve({ content: [{ type: "text" as const, text: result.message }], details: result as any });
    },
  });

  // ── skill_upgrade_list tool ──
  pi.registerTool({
    name: "skill_upgrade_list",
    label: "Skill Upgrade List",
    description: "列出所有带 upstream 追踪的 skill 及其当前版本。",
    parameters: Type.Object({}),
    execute: () => {
      return Promise.resolve({ content: [{ type: "text" as const, text: listUpgradeStatus() }], details: {} as any });
    },
  });

  // ── skill_upgrade_all tool ──
  pi.registerTool({
    name: "skill_upgrade_all",
    label: "Upgrade All Skills",
    description: "批量升级所有 github:/gitee: 源的 skill 到最新版本。",
    parameters: Type.Object({}),
    execute: () => {
      const msg = upgradeAll();
      return Promise.resolve({ content: [{ type: "text" as const, text: msg }], details: {} as any });
    },
  });

  // ── skill_dependency_graph tool ──
  pi.registerTool({
    name: "skill_dependency_graph",
    label: "Skill Dependency Graph",
    description: "按上游源分组展示所有 skill 的依赖关系。",
    parameters: Type.Object({}),
    execute: () => {
      return Promise.resolve({ content: [{ type: "text" as const, text: dependencyGraph() }], details: {} as any });
    },
  });

  // ── C4: registry tools ──
  pi.registerTool({
    name: "skill_registry_add",
    label: "Add Registry Trigger",
    description: "在按需注册表中添加 skill 的触发关键词。",
    parameters: Type.Object({
      name: Type.String({ description: "Skill 名称" }),
      triggers: Type.Array(Type.String(), { description: "触发词列表" }),
    }),
    execute: (_id: string, params: { name: string; triggers: string[] }) => {
      return Promise.resolve({ content: [{ type: "text" as const, text: addRegistryTrigger(params.name, params.triggers) }], details: {} as any });
    },
  });
  pi.registerTool({
    name: "skill_registry_remove",
    label: "Remove Registry Trigger",
    description: "从按需注册表中移除 skill 的触发关键词。不传 triggers 则移除整条。",
    parameters: Type.Object({
      name: Type.String({ description: "Skill 名称" }),
      triggers: Type.Optional(Type.Array(Type.String(), { description: "要移除的触发词（可选）" })),
    }),
    execute: (_id: string, params: { name: string; triggers?: string[] }) => {
      return Promise.resolve({ content: [{ type: "text" as const, text: removeRegistryTrigger(params.name, params.triggers) }], details: {} as any });
    },
  });
  pi.registerTool({
    name: "skill_registry_show",
    label: "Show Registry",
    description: "显示按需注册表内容。",
    parameters: Type.Object({}),
    execute: () => {
      return Promise.resolve({ content: [{ type: "text" as const, text: showRegistry() }], details: {} as any });
    },
  });

  // ── C2: rollback tools ──
  pi.registerTool({
    name: "skill_rollback",
    label: "Skill Rollback",
    description: "回滚 skill 到之前备份的版本。index=0 为最新备份。",
    parameters: Type.Object({
      name: Type.String({ description: "Skill 名称" }),
      index: Type.Optional(Type.Number({ description: "备份索引（0=最新，1=次新…）" })),
    }),
    execute: (_id: string, params: { name: string; index?: number }) => {
      const r = rollbackSkill(params.name, params.index ?? 0);
      return Promise.resolve({ content: [{ type: "text" as const, text: r.message }], details: r as any });
    },
  });
  pi.registerTool({
    name: "skill_rollback_list",
    label: "Skill Rollback List",
    description: "列出所有 skill 的可用备份。可选 name 参数筛选。",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "筛选 skill 名称（可选）" })),
    }),
    execute: (_id: string, params: { name?: string }) => {
      return Promise.resolve({ content: [{ type: "text" as const, text: listRollbacks(params.name) }], details: {} as any });
    },
  });
  pi.registerTool({
    name: "skill_usage_report",
    label: "Skill Usage Report",
    description: "查看所有 skill 的活跃度报告：修改时间、切换次数、过时检测。",
    parameters: Type.Object({}),
    execute: () => {
      return Promise.resolve({ content: [{ type: "text" as const, text: usageReport() }], details: {} as any });
    },
  });
}
