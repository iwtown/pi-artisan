/**
 * 适配规则定义 — 每种资源类型的 Pi Agent 适配规则
 *
 * 每条规则编号对应 pi.dev/docs/latest 的具体要求。
 * 规则按类型分组，按严重级别排序（critical → error → warning → info）。
 */

import type { AdapterRule } from "./types.js";

/**
 * 所有适配规则，按资源类型分组
 */
export const ADAPTER_RULES: Record<string, AdapterRule[]> = {
  // ═══════════════════════════════════════════════
  //  SKILL 适配规则
  //  https://pi.dev/docs/latest/skills
  // ═══════════════════════════════════════════════
  skill: [
    // ── Critical: 缺失则 Pi 拒绝加载 ──
    {
      id: "skill-dir-exists",
      type: "skill",
      severity: "critical",
      description: "Skill 必须是包含 SKILL.md 的目录（或单 .md 文件）",
      source: "skills: Skill Structure",
      autoFixable: false,
    },
    {
      id: "skill-frontmatter-name",
      type: "skill",
      severity: "critical",
      description: "SKILL.md frontmatter 必须有 name 字段",
      source: "skills: Frontmatter — name (required)",
      autoFixable: false,
    },
    {
      id: "skill-frontmatter-desc",
      type: "skill",
      severity: "critical",
      description: "SKILL.md frontmatter 必须有 description 字段（缺失则不加载）",
      source: "skills: Frontmatter — description (required)",
      autoFixable: false,
    },

    // ── Warning: 官方文档标记为 warning（仍加载，但违背规范）──
    {
      id: "skill-name-format",
      type: "skill",
      severity: "warning",
      description: "name 必须小写字母/数字/连字符、≤64 字符、无前导/尾随/连续连字符",
      source: "skills: Validation — name format warns but loads",
      autoFixable: true,
    },
    {
      id: "skill-desc-length",
      type: "skill",
      severity: "warning",
      description: "description 必须 ≤1024 字符",
      source: "skills: Validation — description exceeds 1024 warns but loads",
      autoFixable: false,
    },
    {
      id: "skill-desc-specific",
      type: "skill",
      severity: "info",
      description: "description 应具体说明做什么和何时用（好例：'Extracts text from PDFs'；差例：'Helps with PDFs'）",
      source: "skills: Description Best Practices",
      autoFixable: false,
    },
    {
      id: "skill-progressive-disclosure",
      type: "skill",
      severity: "info",
      description: "考虑使用 progressive disclosure：description 精简，详细指令放 SKILL.md 正文按需加载",
      source: "skills: How Skills Work — progressive disclosure",
      autoFixable: false,
    },
    {
      id: "skill-radiant-dirs",
      type: "skill",
      severity: "info",
      description: "建议使用 scripts/ references/ assets/ 辐射目录组织辅助文件",
      source: "skills: Skill Structure — freeform layout",
      autoFixable: false,
    },
    {
      id: "skill-allow-unknown-fields",
      type: "skill",
      severity: "info",
      description: "Pi 忽略未知 frontmatter 字段（如 upstream），确保不干扰 Pi 解析",
      source: "skills: Validation — unknown frontmatter fields are ignored",
      autoFixable: false,
    },
    {
      id: "skill-license-field",
      type: "skill",
      severity: "info",
      description: "建议添加 license 字段（MIT/Apache-2.0/GPL-3.0）",
      source: "skills: Validation — license field",
      autoFixable: false,
    },
    {
      id: "skill-allowed-tools",
      type: "skill",
      severity: "info",
      description: "allowed-tools 是实验性字段，限制 skill 可调用的工具",
      source: "skills: Validation — allowed-tools experimental",
      autoFixable: false,
    },
    {
      id: "skill-disable-model-invocation",
      type: "skill",
      severity: "info",
      description: "非核心 skill 建议设置 disable-model-invocation: true，用 /skill:name 按需触发",
      source: "skills: Frontmatter — disable-model-invocation",
      autoFixable: false,
    },
    {
      id: "skill-relative-paths",
      type: "skill",
      severity: "warning",
      description: "SKILL.md 内引用路径必须相对 skill 目录（如 references/guide.md），不能绝对路径",
      source: "skills: Skill Structure — relative paths",
      autoFixable: false,
    },
  ],

  // ═══════════════════════════════════════════════
  //  EXTENSION 适配规则
  //  https://pi.dev/docs/latest/extensions
  // ═══════════════════════════════════════════════
  extension: [
    // ── Critical ──
    {
      id: "ext-export-default",
      type: "extension",
      severity: "critical",
      description: "Extension 必须有 export default function(pi: ExtensionAPI) 导出",
      source: "extensions: Writing an Extension — default export",
      autoFixable: false,
    },
    {
      id: "ext-import-package",
      type: "extension",
      severity: "critical",
      description: "必须从 @earendil-works/pi-coding-agent 导入 ExtensionAPI",
      source: "extensions: Available Imports",
      autoFixable: false,
    },

    // ── Warning ──
    {
      id: "ext-tool-naming",
      type: "extension",
      severity: "warning",
      description: "自定义工具建议使用 snake_case 命名（不影响加载）",
      source: "extensions: Custom Tools — naming convention",
      autoFixable: false,
    },
    {
      id: "ext-no-js-import",
      type: "extension",
      severity: "warning",
      description: "不应从 .js 文件导入（Pi 用 jiti 加载 TS，无需编译）",
      source: "extensions: Available Imports — jiti loads TS directly",
      autoFixable: false,
    },
    {
      id: "ext-package-deps",
      type: "extension",
      severity: "warning",
      description: "有依赖时需 package.json，npm 包放 dependencies",
      source: "extensions: Package with dependencies",
      autoFixable: false,
    },
    {
      id: "ext-structure",
      type: "extension",
      severity: "info",
      description: "建议按文件大小选结构：单文件 .ts → 多文件 dir/index.ts → 带依赖再加 package.json",
      source: "extensions: Extension Styles — three tiers",
      autoFixable: false,
    },
    {
      id: "ext-session-scope",
      type: "extension",
      severity: "warning",
      description: "后台资源（timer/socket/watch）必须在 session_start 启动、session_shutdown 关闭",
      source: "extensions: Long-lived resources and shutdown",
      autoFixable: false,
    },
    {
      id: "ext-event-lifecycle",
      type: "extension",
      severity: "info",
      description: "检查事件注册（pi.on）和 session_shutdown 清理钩子，防止后台资源泄漏",
      source: "extensions: Events — pi.on()",
      autoFixable: false,
    },
  ],

  // ═══════════════════════════════════════════════
  //  PROMPT 适配规则
  //  https://pi.dev/docs/latest/prompt-templates
  // ═══════════════════════════════════════════════
  prompt: [
    {
      id: "prompt-description",
      type: "prompt",
      severity: "info",
      description: "建议添加 frontmatter description（缺失则用首行非空行；无则 autocomplete 不显示）",
      source: "prompt-templates: Frontmatter — description",
      autoFixable: false,
    },
    {
      id: "prompt-argument-hint",
      type: "prompt",
      severity: "info",
      description: "有参数时建议添加 argument-hint 提升 autocomplete 体验",
      source: "prompt-templates: Argument hint",
      autoFixable: false,
    },
    {
      id: "prompt-filename-command",
      type: "prompt",
      severity: "error",
      description: "文件名（不含 .md）成为命令名，应简短易记",
      source: "prompt-templates: filename becomes command",
      autoFixable: false,
    },
    {
      id: "prompt-args-format",
      type: "prompt",
      severity: "info",
      description: "参数引用格式：$1 $2 $@ 或 ${1:-default}",
      source: "prompt-templates: Argument expansion",
      autoFixable: false,
    },
  ],

  // ═══════════════════════════════════════════════
  //  THEME 适配规则
  //  https://pi.dev/docs/latest/themes
  // ═══════════════════════════════════════════════
  theme: [
    // ── Critical ──
    {
      id: "theme-valid-json",
      type: "theme",
      severity: "critical",
      description: "Theme 必须是合法 JSON",
      source: "themes: Creating a Custom Theme",
      autoFixable: false,
    },
    {
      id: "theme-name-field",
      type: "theme",
      severity: "critical",
      description: "必须有 name 字段且唯一",
      source: "themes: Theme Format — name required",
      autoFixable: false,
    },
    {
      id: "theme-51-colors",
      type: "theme",
      severity: "critical",
      description: "颜色定义必须包含全部 51 个 token，无遗漏",
      source: "themes: Color Tokens — all 51 required",
      autoFixable: false,
    },

    // ── Error ──
    {
      id: "theme-color-formats",
      type: "theme",
      severity: "error",
      description: "颜色值须为 hex (#rrggbb)、256 索引、vars 引用或空字符串（终端默认）",
      source: "themes: Color Values — four formats",
      autoFixable: false,
    },
    {
      id: "theme-vars-reuse",
      type: "theme",
      severity: "info",
      description: "建议用 vars 定义可复用颜色（如 primary/ secondary），在 colors 中引用",
      source: "themes: Theme Format — vars",
      autoFixable: false,
    },
    {
      id: "theme-schema-ref",
      type: "theme",
      severity: "info",
      description: "建议添加 $schema 引用以获得编辑器自动补全和校验",
      source: "themes: Creating a Custom Theme — $schema",
      autoFixable: false,
    },
    {
      id: "theme-export-html",
      type: "theme",
      severity: "info",
      description: "如需 /export HTML 输出，可加 export 节指定 pageBg/cardBg/infoBg",
      source: "themes: Theme Format — export for HTML rendering",
      autoFixable: false,
    },
  ],

  // ═══════════════════════════════════════════════
  //  PACKAGE 适配规则
  //  https://pi.dev/docs/latest/packages
  // ═══════════════════════════════════════════════
  package: [
    // ── Critical ──
    {
      id: "pkg-package-json",
      type: "package",
      severity: "critical",
      description: "必须有 package.json",
      source: "packages: Creating a Pi Package",
      autoFixable: false,
    },

    // ── Info ──
    {
      id: "pkg-pi-manifest",
      type: "package",
      severity: "info",
      description: "建议在 package.json 中添加 pi 清单声明（pi 自动发现技能/扩展/提示）",
      source: "packages: Creating a Pi Package — pi manifest",
      autoFixable: false,
    },
    {
      id: "pkg-pi-manifest-keys",
      type: "package",
      severity: "warning",
      description: "pi 清单路径声明应使用允许的键：extensions/skills/prompts/themes/video/image",
      source: "packages: Creating a Pi Package — pi manifest",
      autoFixable: false,
    },
    {
      id: "pkg-conventional-dirs",
      type: "package",
      severity: "info",
      description: "可用约定目录（extensions/ skills/ prompts/ themes/）代替 pi 清单",
      source: "packages: Package Structure — conventional directories",
      autoFixable: false,
    },
    {
      id: "pkg-keyword",
      type: "package",
      severity: "info",
      description: "建议添加 pi-package 关键词到 package.json keywords 增强可发现性",
      source: "packages: Creating a Pi Package — pi-package keyword",
      autoFixable: false,
    },
    {
      id: "pkg-peer-deps",
      type: "package",
      severity: "info",
      description: "引用 pi SDK 的包应列 @earendil-works/pi-* 为 peerDependencies",
      source: "packages: Dependencies — peer dependencies",
      autoFixable: false,
    },
    {
      id: "pkg-filter",
      type: "package",
      severity: "info",
      description: "安装后可用 settings.json 按类型过滤（+/- 语法）精细控制",
      source: "packages: Package Filtering",
      autoFixable: false,
    },
  ],
};

/**
 * 获取指定类型的所有适配规则
 */
export function getRulesForType(type: string): AdapterRule[] {
  return ADAPTER_RULES[type] || [];
}

/**
 * 获取所有适配规则（平铺）
 */
export function getAllRules(): AdapterRule[] {
  return Object.values(ADAPTER_RULES).flat();
}
