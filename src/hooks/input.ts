/**
 * input hook — 能力包操作意图侦测与路由
 *
 * 当用户消息涉及 5 种能力包（skills/extensions/prompts/themes/packages）
 * 的操作意图（创建/修改/部署/安装等）时，在消息前注入路由提示，
 * 引导 LLM 使用 pi-artisan 工具进行全生命周期管理。
 *
 * 与 before-start hook 互补：
 *   - before-start: 全局告知 pi-artisan 存在（每轮注入系统提示）
 *   - input: 按需拦截，精准路由（仅检测到能力包操作时触发）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ─────────────────────────────────────────────
//  能力包类型关键词
// ─────────────────────────────────────────────

const RESOURCE_TYPES = [
  { id: "skill", keywords: ["skill", "skills", "SKILL.md", "技能", "技艺"] },
  { id: "extension", keywords: ["extension", "extensions", "插件", "扩展"] },
  { id: "prompt", keywords: ["prompt", "prompts", "提示词", "提示模板", "模板"] },
  { id: "theme", keywords: ["theme", "themes", "主题", "配色"] },
  { id: "package", keywords: ["package", "packages", "包", "npm包", "pi包"] },
];

// ─────────────────────────────────────────────
//  操作意图关键词
// ─────────────────────────────────────────────

const OPERATIONS = [
  "创建", "写", "修改", "编辑", "删除",
  "部署", "发布", "上传", "同步",
  "安装", "卸载",
  "校验", "适配", "检查",
  "create", "write", "edit", "modify", "delete",
  "deploy", "publish", "upload", "sync",
  "install", "uninstall",
  "validate", "adapt",
];

// ─────────────────────────────────────────────
//  路由提示模板
// ─────────────────────────────────────────────

const ROUTING_HINTS: Record<string, string> = {
  skill: `🧰 pi-artisan 路由：检测到 skill 操作。
skill 全生命周期：/find-skills 搜索 → /create-skill scaffold → /adapt 适配检查 → /resource-birth 出生证 → 编辑 SKILL.md → /validate-skill 校验。
常用工具：/create-skill, /adapt, /resource-birth, /validate-skill, /optimize-skill, /resource-publish`,
  extension: `🧰 pi-artisan 路由：检测到 extension 操作。
extension 工作流：创建 .ts → /adapt 适配检查 → /resource-birth 出生证。
常用工具：/adapt, /validate-extension, /resource-birth`,
  prompt: `🧰 pi-artisan 路由：检测到 prompt 操作。
prompt 工作流：创建 .md → /adapt 适配检查 → /resource-birth 出生证。
常用工具：/adapt, /validate-prompt, /resource-birth`,
  theme: `🧰 pi-artisan 路由：检测到 theme 操作。
theme 工作流：创建 .json（51 色值）→ /adapt 适配检查 → /resource-birth 出生证。
常用工具：/adapt, /validate-theme, /resource-birth`,
  package: `🧰 pi-artisan 路由：检测到 package 操作。
package 工作流：package.json + pi 清单 → /adapt 适配检查 → /resource-birth 出生证。
常用工具：/adapt, /validate-package, /resource-birth`,
};

// ─────────────────────────────────────────────
//  检测逻辑
// ─────────────────────────────────────────────

interface RoutingResult {
  typeId: string;
}

/**
 * 检查文本是否包含能力包操作意图。
 * 同时命中资源类型 + 操作关键词才触发路由。
 */
function detectRouting(text: string): RoutingResult | null {
  const lower = text.toLowerCase();

  // 找到匹配的资源类型（优先匹配更具体的）
  let matchedType: string | null = null;
  for (const rt of RESOURCE_TYPES) {
    if (rt.keywords.some((kw) => lower.includes(kw))) {
      matchedType = rt.id;
      break;
    }
  }
  if (!matchedType) return null;

  // 检查是否有操作意图
  const hasOperation = OPERATIONS.some((op) => lower.includes(op));
  if (!hasOperation) return null;

  return { typeId: matchedType };
}

// ─────────────────────────────────────────────
//  Hook 注册
// ─────────────────────────────────────────────

export function setupInputHook(pi: ExtensionAPI): void {
  pi.on("input", async (event, _ctx) => {
    // 只处理用户直接输入（不处理来自 extension 的消息）
    if (event.source === "extension") return { action: "continue" };

    const routing = detectRouting(event.text);
    if (!routing) return { action: "continue" };

    const hint = ROUTING_HINTS[routing.typeId];
    if (!hint) return { action: "continue" };

    // 转换为原始文本，注入路由提示
    return {
      action: "transform",
      text: `${hint}\n---\n${event.text}`,
    };
  });
}