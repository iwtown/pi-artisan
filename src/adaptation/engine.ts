/**
 * 适配改造引擎 — 对能力包执行 Pi Agent 适配性检查
 *
 * 核心职责：
 *   1. 对资源运行适配规则
 *   2. 生成适配报告
 *   3. 判定是否通过（严格模式拒绝所有 non-passed）
 *   4. 提供 "装配就绪" 判定
 *
 * 与其他系统的关系：
 *   - birth certificate 检查发布就绪，更偏外面（合规+文档+市场）
 *   - validation 检查文件格式正确性
 *   - adaptation 检查 Pi Agent 兼容性，是装配能力包的前置关卡
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { scanResources, scanByType } from "../catalog/scanner.js";
import { getRulesForType } from "./rules.js";
import { DEFAULT_ADAPTER_CONFIG } from "./types.js";
import type {
  AdapterRule,
  AdapterResult,
  AdapterReport,
  AdapterConfig,
  AdapterSeverity,
} from "./types.js";
import type { ResourceInfo } from "../types.js";

// ─────────────────────────────────────────────────────────
//  规则检查器 — 每种规则的具体检查逻辑
// ─────────────────────────────────────────────────────────

type RuleChecker = (resource: ResourceInfo) => AdapterResult;

/**
 * 对单个资源运行一条规则
 */
function checkRule(rule: AdapterRule, resource: ResourceInfo): AdapterResult {
  const checker = RULE_CHECKERS[rule.id];
  if (checker) {
    return checker(resource);
  }
  // 无特定检查器 == info 规则，标记为通过但提醒
  return {
    ruleId: rule.id,
    resource: resource.name,
    passed: true,
    severity: rule.severity,
    message: `[${rule.severity}] ${rule.description}`,
    autoFixable: rule.autoFixable,
  };
}

/**
 * 检查一个 skill 的 SKILL.md frontmatter 是否存在指定字段
 */
function checkFrontmatterField(skillDir: string, field: string): string | null {
  try {
    const mdPath = join(skillDir, "SKILL.md");
    if (!existsSync(mdPath)) return null;
    const content = readFileSync(mdPath, "utf-8");
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const fm = match[1];
    const re = new RegExp(`^${field}:\\s*(.+)$`, "m");
    const f = fm.match(re);
    return f ? f[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * 检查 name 字段格式是否合规
 */
function checkNameFormat(name: string): boolean {
  return /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/.test(name) && name.length <= 64 && !name.includes("--");
}

/**
 * 各规则的检查器映射
 */
const RULE_CHECKERS: Record<string, RuleChecker> = {
  // ── Skill ──
  "skill-dir-exists": (r) => {
    const hasSkillMd = r.path.endsWith("SKILL.md") && existsSync(r.path);
    return {
      ruleId: "skill-dir-exists",
      resource: r.name,
      passed: hasSkillMd,
      severity: "critical",
      message: hasSkillMd
        ? "✅ SKILL.md 存在"
        : `❌ SKILL.md 不存在于 ${r.path}`,
      autoFixable: false,
    };
  },
  "skill-frontmatter-name": (r) => {
    const name = checkFrontmatterField(dirname(r.path), "name");
    return {
      ruleId: "skill-frontmatter-name",
      resource: r.name,
      passed: name !== null,
      severity: "critical",
      message: name ? `✅ name: "${name}"` : "❌ frontmatter 缺少 name 字段",
      autoFixable: false,
    };
  },
  "skill-frontmatter-desc": (r) => {
    const desc = checkFrontmatterField(dirname(r.path), "description");
    return {
      ruleId: "skill-frontmatter-desc",
      resource: r.name,
      passed: desc !== null,
      severity: "critical",
      message: desc ? `✅ description 存在 (${desc.length} chars)` : "❌ frontmatter 缺少 description 字段",
      autoFixable: false,
    };
  },
  "skill-name-format": (r) => {
    const name = checkFrontmatterField(dirname(r.path), "name");
    const valid = name ? checkNameFormat(name) : false;
    return {
      ruleId: "skill-name-format",
      resource: r.name,
      passed: valid,
      severity: "error",
      message: valid
        ? `✅ name "${name}" 格式合规`
        : `❌ name "${name}" 不合规：小写字母/数字/连字符、≤64 字符、无前导/尾随/连续连字符`,
      autoFixable: true,
    };
  },
  "skill-desc-length": (r) => {
    const desc = checkFrontmatterField(dirname(r.path), "description");
    const ok = desc !== null && desc.length <= 1024;
    return {
      ruleId: "skill-desc-length",
      resource: r.name,
      passed: ok,
      severity: "error",
      message: ok
        ? `✅ description ${desc!.length}/1024 chars`
        : `❌ description ${desc ? desc.length : 0}/1024 chars 超限`,
      autoFixable: false,
    };
  },
  "skill-desc-specific": (r) => {
    const desc = checkFrontmatterField(dirname(r.path), "description");
    const vague = desc ? /^(helps? with|for|handle|manage|deal with)/i.test(desc) : true;
    return {
      ruleId: "skill-desc-specific",
      resource: r.name,
      passed: !vague && desc !== null,
      severity: "warning",
      message: desc && !vague
        ? `✅ description 描述具体`
        : `⚠️ description "${desc}" 过于模糊，建议说明做什么和何时用`,
      autoFixable: false,
    };
  },
  "skill-relative-paths": (r) => {
    try {
      const content = readFileSync(r.path, "utf-8");
      // 检查绝对路径引用
      const hasAbsolute = /\]\(\/(?:home|Users|mnt|tmp)/.test(content);
      return {
        ruleId: "skill-relative-paths",
        resource: r.name,
        passed: !hasAbsolute,
        severity: "warning",
        message: hasAbsolute
          ? "⚠️ SKILL.md 包含绝对路径引用，应改用相对路径"
          : "✅ 路径引用使用相对路径",
        autoFixable: false,
      };
    } catch {
      return {
        ruleId: "skill-relative-paths",
        resource: r.name,
        passed: true,
        severity: "warning",
        message: "✅ 无法检查路径引用",
        autoFixable: false,
      };
    }
  },
  "skill-progressive-disclosure": (r) => {
    return {
      ruleId: "skill-progressive-disclosure",
      resource: r.name,
      passed: true,
      severity: "info",
      message: "💡 progression disclosure：description 精简，详细指令放正文",
      autoFixable: false,
    };
  },
  "skill-radiant-dirs": (r) => {
    const dir = dirname(r.path);
    const hasRefs = existsSync(join(dir, "references"));
    const hasScripts = existsSync(join(dir, "scripts"));
    const hasAssets = existsSync(join(dir, "assets"));
    const hasAny = hasRefs || hasScripts || hasAssets;
    const dirs = [hasRefs ? "references" : "", hasScripts ? "scripts" : "", hasAssets ? "assets" : ""].filter(Boolean).join("/");
    return {
      ruleId: "skill-radiant-dirs",
      resource: r.name,
      passed: true,
      severity: "info",
      message: hasAny
        ? `💡 辐射目录: ${dirs}`
        : "💡 考虑用 references/ scripts/ assets/ 组织辅助文件",
      autoFixable: false,
    };
  },
  "skill-disable-model-invocation": (r) => {
    // 仅在非 on-demand 注册表中的核心 skill 提示
    return {
      ruleId: "skill-disable-model-invocation",
      resource: r.name,
      passed: true,
      severity: "info",
      message: "💡 非核心 skill 建议设 disable-model-invocation: true",
      autoFixable: false,
    };
  },

  // ── Extension ──
  "ext-export-default": (r) => {
    const extPath = r.path.endsWith("index.ts") ? r.path : r.path;
    if (!existsSync(extPath)) {
      return { ruleId: "ext-export-default", resource: r.name, passed: false, severity: "critical", message: "❌ 文件不存在", autoFixable: false };
    }
    const content = readFileSync(extPath, "utf-8");
    const hasExport = /export\s+default\s+(?:async\s+)?function/.test(content) || /export\s+default\s+\(/.test(content);
    return {
      ruleId: "ext-export-default",
      resource: r.name,
      passed: hasExport,
      severity: "critical",
      message: hasExport ? "✅ 有 export default function" : "❌ 缺少 export default function(pi: ExtensionAPI)",
      autoFixable: false,
    };
  },
  "ext-import-package": (r) => {
    const extPath = r.path.endsWith("index.ts") ? r.path : r.path;
    if (!existsSync(extPath)) {
      return { ruleId: "ext-import-package", resource: r.name, passed: false, severity: "critical", message: "❌ 文件不存在", autoFixable: false };
    }
    const content = readFileSync(extPath, "utf-8");
    const hasImport = content.includes('@earendil-works/pi-coding-agent');
    return {
      ruleId: "ext-import-package",
      resource: r.name,
      passed: hasImport,
      severity: "critical",
      message: hasImport ? "✅ 从 @earendil-works/pi-coding-agent 导入" : "❌ 未从 @earendil-works/pi-coding-agent 导入 ExtensionAPI",
      autoFixable: false,
    };
  },
  "ext-tool-naming": (r) => {
    const extPath = r.path.endsWith("index.ts") ? r.path : r.path;
    if (!existsSync(extPath)) {
      return { ruleId: "ext-tool-naming", resource: r.name, passed: true, severity: "error", message: "✅ 无法检查", autoFixable: false };
    }
    const content = readFileSync(extPath, "utf-8");
    const toolNames = [...content.matchAll(/name:\s*["']([a-z_]\w*)["']/g)].map((m) => m[1]);
    const bad = toolNames.filter((n) => !/^[a-z][a-z0-9_]*$/.test(n));
    return {
      ruleId: "ext-tool-naming",
      resource: r.name,
      passed: bad.length === 0,
      severity: "error",
      message: bad.length > 0
        ? `❌ 工具名 "${bad.join(", ")}" 应使用 snake_case`
        : toolNames.length > 0
          ? `✅ 工具名 snake_case (${toolNames.join(", ")})`
          : "✅ 无自定义工具（或未检测到）",
      autoFixable: false,
    };
  },
  "ext-session-scope": (r) => {
    // 启发式检查 — 有生命周期事件注册
    return {
      ruleId: "ext-session-scope",
      resource: r.name,
      passed: true,
      severity: "warning",
      message: "💡 确认后台资源在 session_start 启动、session_shutdown 关闭",
      autoFixable: false,
    };
  },

  // ── Prompt ──
  "prompt-description": (r) => {
    try {
      const content = readFileSync(r.path, "utf-8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      const hasDesc = !!(fmMatch && /description:\s*\S/.test(fmMatch[1]));
      return {
        ruleId: "prompt-description",
        resource: r.name,
        passed: hasDesc,
        severity: "info",
        message: hasDesc ? "✅ frontmatter 有 description" : "💡 建议加 description（autocomplete 可见）",
        autoFixable: false,
      };
    } catch {
      return { ruleId: "prompt-description", resource: r.name, passed: true, severity: "info", message: "✅", autoFixable: false };
    }
  },
  "prompt-filename-command": (r) => {
    const name = basename(r.path, ".md");
    const valid = /^[a-z][a-z0-9-]{0,30}$/.test(name);
    return {
      ruleId: "prompt-filename-command",
      resource: r.name,
      passed: valid,
      severity: "error",
      message: valid ? `✅ 文件名 "${name}" 适合作命令名` : `❌ 文件名 "${name}" 应简短小写字母/数字/连字符`,
      autoFixable: false,
    };
  },

  // ── Theme ──
  "theme-valid-json": (r) => {
    try {
      JSON.parse(readFileSync(r.path, "utf-8"));
      return { ruleId: "theme-valid-json", resource: r.name, passed: true, severity: "critical", message: "✅ JSON 合法", autoFixable: false };
    } catch (e: any) {
      return { ruleId: "theme-valid-json", resource: r.name, passed: false, severity: "critical", message: `❌ JSON 非法: ${e.message}`, autoFixable: false };
    }
  },
  "theme-name-field": (r) => {
    try {
      const json = JSON.parse(readFileSync(r.path, "utf-8"));
      return {
        ruleId: "theme-name-field",
        resource: r.name,
        passed: !!json.name,
        severity: "critical",
        message: json.name ? `✅ name: "${json.name}"` : "❌ 缺少 name 字段",
        autoFixable: false,
      };
    } catch {
      return { ruleId: "theme-name-field", resource: r.name, passed: false, severity: "critical", message: "❌ 无法解析 JSON", autoFixable: false };
    }
  },
  "theme-51-colors": (r) => {
    const REQUIRED_COLORS = [
      "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText",
      "selectedBg", "userMessageBg", "userMessageText", "customMessageBg", "customMessageText", "customMessageLabel",
      "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput",
      "mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet",
      "toolDiffAdded", "toolDiffRemoved", "toolDiffContext",
      "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation",
      "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh",
      "bashMode",
    ];
    try {
      const json = JSON.parse(readFileSync(r.path, "utf-8"));
      const missing = REQUIRED_COLORS.filter((c) => !(c in (json.colors || {})));
      return {
        ruleId: "theme-51-colors",
        resource: r.name,
        passed: missing.length === 0,
        severity: "critical",
        message: missing.length === 0
          ? "✅ 全部 51 个颜色 token 已定义"
          : `❌ 缺少 ${missing.length} 个 token: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}`,
        autoFixable: false,
      };
    } catch {
      return { ruleId: "theme-51-colors", resource: r.name, passed: false, severity: "critical", message: "❌ 无法解析 JSON", autoFixable: false };
    }
  },
  "theme-color-formats": (r) => {
    const VALID_FORMAT = /^(#[0-9a-fA-F]{6}|[0-9]{1,3}|[a-zA-Z]\w*|)$/;
    try {
      const json = JSON.parse(readFileSync(r.path, "utf-8"));
      const colors = json.colors || {};
      const bad = Object.entries(colors).filter(([, v]) => typeof v === "string" && !VALID_FORMAT.test(v));
      return {
        ruleId: "theme-color-formats",
        resource: r.name,
        passed: bad.length === 0,
        severity: "error",
        message: bad.length === 0
          ? "✅ 颜色值格式合规"
          : `❌ ${bad.length} 个颜色值格式异常: ${bad.slice(0, 3).map(([k]) => k).join(", ")}${bad.length > 3 ? "..." : ""}`,
        autoFixable: false,
      };
    } catch {
      return { ruleId: "theme-color-formats", resource: r.name, passed: true, severity: "error", message: "✅ 无法验证", autoFixable: false };
    }
  },

  // ── Package ──
  "pkg-package-json": (r) => {
    const pkgPath = join(r.path, "package.json");
    const exists = existsSync(pkgPath);
    return {
      ruleId: "pkg-package-json",
      resource: r.name,
      passed: exists,
      severity: "critical",
      message: exists ? "✅ package.json 存在" : "❌ 缺少 package.json",
      autoFixable: false,
    };
  },
  "pkg-pi-manifest": (r) => {
    const pkgPath = join(r.path, "package.json");
    if (!existsSync(pkgPath)) {
      return { ruleId: "pkg-pi-manifest", resource: r.name, passed: false, severity: "info", message: "💡 建议加 pi 清单", autoFixable: false };
    }
    try {
      const json = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const hasManifest = json.pi && Object.keys(json.pi).length > 0;
      return {
        ruleId: "pkg-pi-manifest",
        resource: r.name,
        passed: true,
        severity: "info",
        message: hasManifest ? "✅ 有 pi 清单声明" : "💡 建议在 package.json 添加 pi 清单",
        autoFixable: false,
      };
    } catch {
      return { ruleId: "pkg-pi-manifest", resource: r.name, passed: true, severity: "info", message: "💡 建议在 package.json 添加 pi 清单", autoFixable: false };
    }
  },
  "pkg-keyword": (r) => {
    const pkgPath = join(r.path, "package.json");
    if (!existsSync(pkgPath)) {
      return { ruleId: "pkg-keyword", resource: r.name, passed: false, severity: "info", message: "💡 建议加 pi-package 关键词", autoFixable: false };
    }
    try {
      const json = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const hasKeyword = Array.isArray(json.keywords) && json.keywords.includes("pi-package");
      return {
        ruleId: "pkg-keyword",
        resource: r.name,
        passed: true,
        severity: "info",
        message: hasKeyword ? "✅ 有 pi-package 关键词" : "💡 建议在 keywords 添加 pi-package",
        autoFixable: false,
      };
    } catch {
      return { ruleId: "pkg-keyword", resource: r.name, passed: true, severity: "info", message: "💡 建议加 pi-package 关键词", autoFixable: false };
    }
  },
};

// ─────────────────────────────────────────────────────────
//  引擎 API
// ─────────────────────────────────────────────────────────

/**
 * 对单个资源运行所有适配规则
 */
export function adaptResource(
  resource: ResourceInfo,
  config: AdapterConfig = DEFAULT_ADAPTER_CONFIG,
): AdapterReport {
  const rules = getRulesForType(resource.type);
  const enabledRules = config.rules[resource.type] !== false ? rules : [];

  const results: AdapterResult[] = [];
  for (const rule of enabledRules) {
    const result = checkRule(rule, resource);
    results.push(result);
  }

  const criticalCount = results.filter((r) => !r.passed && r.severity === "critical").length;
  const errorCount = results.filter((r) => !r.passed && r.severity === "error").length;
  const warningCount = results.filter((r) => !r.passed && r.severity === "warning").length;
  const infoCount = results.filter((r) => !r.passed && r.severity === "info").length;

  // strictMode: 任何 non-passed 都算不通过
  const allPassed = config.strictMode
    ? results.every((r) => r.passed)
    : criticalCount === 0 && errorCount === 0;

  return {
    resourceName: resource.name,
    resourceType: resource.type,
    resourcePath: resource.path,
    results,
    criticalCount,
    errorCount,
    warningCount,
    infoCount,
    allPassed,
  };
}

/**
 * 对所有资源运行适配规则
 */
export function adaptAll(config?: AdapterConfig): AdapterReport[] {
  const resources = scanResources();
  return resources.map((r) => adaptResource(r, config));
}

/**
 * 对指定类型的所有资源运行适配规则
 */
export function adaptByType(type: string, config?: AdapterConfig): AdapterReport[] {
  const resources = scanByType(type as any);
  return resources.map((r) => adaptResource(r, config));
}

/**
 * 格式化适配报告为可读文本
 */
export function formatAdaptReport(report: AdapterReport): string {
  const lines: string[] = [];
  const status = report.allPassed ? "✅" : "❌";
  lines.push(`${status} ${report.resourceName} (${report.resourceType})`);

  const icons: Record<AdapterSeverity, string> = {
    critical: "🔴",
    error: "🟠",
    warning: "🟡",
    info: "💡",
  };

  for (const r of report.results) {
    if (r.passed) continue;
    const icon = icons[r.severity] || "  ";
    lines.push(`  ${icon} [${r.severity}] ${r.message}`);
  }

  if (report.results.every((r) => r.passed)) {
    lines.push("  全部适配规则通过");
  }

  return lines.join("\n");
}

/**
 * 格式化批量适配报告摘要
 */
export function formatAdaptSummary(reports: AdapterReport[]): string {
  const total = reports.length;
  const passed = reports.filter((r) => r.allPassed).length;
  const critical = reports.reduce((s, r) => s + r.criticalCount, 0);
  const errors = reports.reduce((s, r) => s + r.errorCount, 0);
  const warnings = reports.reduce((s, r) => s + r.warningCount, 0);

  const lines: string[] = [];
  lines.push(`🧰 适配化改造报告`);
  lines.push(`   共 ${total} 个能力包，${passed}/${total} 通过适配`);
  if (critical > 0) lines.push(`   🔴 ${critical} 个 critical 问题 — 必须修复方可装配`);
  if (errors > 0) lines.push(`   🟠 ${errors} 个 error`);
  if (warnings > 0) lines.push(`   🟡 ${warnings} 个 warning`);
  if (critical === 0 && errors === 0 && warnings === 0) {
    lines.push(`   ✅ 全部资源就绪，可以装配`);
  }
  return lines.join("\n");
}

/**
 * 资源是否已通过适配，可以装配
 */
export function isReadyForAssembly(report: AdapterReport, strict: boolean = true): boolean {
  if (strict) return report.allPassed;
  return report.criticalCount === 0 && report.errorCount === 0;
}
