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
//  能力沉淀意图关键词
// ─────────────────────────────────────────────

/**
 * 当用户表达将隐性经验/做法/SOP 固化为能力包的意图时匹配。
 * 优先级高于资源操作路由——沉淀流程覆盖更靠前的阶段。
 */
const CRYSTALLIZATION_KEYWORDS = [
  // Chinese — 直接意图
  "沉淀", "固化", "经验", "做法", "流程",
  "SOP", "惯例", "套路", "规范", "标准",
  // English
  "crystallize", "crystallization", "solidify", "formalize",
  "standardize", "reusable",
];

// ─────────────────────────────────────────────
//  沉淀路由提示模板（Phase A + B）
// ─────────────────────────────────────────────

const PHASE_AB_HINT = `🧰 pi-artisan 沉淀路由：检测到能力沉淀意图。

请按顺序处理以下两个阶段：

=== Phase A — 值得沉淀吗？ ===
先问用户这 3 个问题，每个回答后 LLM 做判断：

1️⃣ 通用性：这个能力是通用的还是只适用于当前场景？
   · 跨项目/场景通用 ✅ → +1
   · 仅当前项目特有 ❌ → -1

2️⃣ 复现频率：你多久会用到一次？
   · 每周 1 次以上 ✅ → +1
   · 每月不到 1 次 ❌ → -1

3️⃣ 可拆分性：能否拆分为独立可复用的单元？边界清晰吗？
   · 边界清晰，可独立复用 ✅ → +1
   · 与上下文高度耦合 ❌ → -1

综合判断：≥2 分 → 值得做。请给出结论并问用户是否继续。
用户确认后 → 进入 Phase B。

=== Phase B — 选什么类型？ ===
根据能力特征选择类型：

▶ 纯指令/步骤/规范（不需要编程）→ Skill
▶ 文本模板，需参数插值 → Prompt Template
▶ 需程序化逻辑（API/IO/条件/钩子）→ Extension
▶ 界面配色/样式 → Theme
▶ 混合类型 → Package

类型对比矩阵：
| 能力特征        | Skill | Ext | Prompt | Theme | Pkg |
|----------------|-------|-----|--------|-------|-----|
| 纯规范性说明    | ★★★  | -   | ★★     | -     | -   |
| 需条件判断/分支 | ★    | ★★★ | ★      | -     | ★   |
| 需 API/事件钩子 | -    | ★★★ | -      | -     | ★   |
| 纯文本+参数     | ★★   | -   | ★★★    | -     | -   |
| 界面样式        | -    | -   | -      | ★★★   | ★   |
| 多种资源混合    | -    | -   | -      | -     | ★★★ |

推荐一个类型并说明理由 → 问用户是否同意。
确认类型后 → 进入搜索阶段（可参考 find-skills 流程）。`;

const ROUTING_HINTS: Record<string, string> = {
  skill: `🧰 pi-artisan 路由：检测到 skill 操作。
skill 全生命周期：/find-skills 搜索 → /create-skill scaffold → /adapt 适配检查 → /resource-birth 出生证 → 编辑 SKILL.md → /validate-skill 校验。
常用工具：/create-skill, /adapt, /resource-birth, /validate-skill, /optimize-skill, /resource-publish`,
  extension: `🧰 pi-artisan 路由：检测到 extension 操作。
extension 全生命周期：/create-extension scaffold → /adapt 适配检查 → /resource-birth 出生证。
常用工具：/create-extension, /adapt, /validate-extension, /resource-birth`,
  prompt: `🧰 pi-artisan 路由：检测到 prompt 操作。
prompt 全生命周期：/create-prompt scaffold → /adapt 适配检查 → /resource-birth 出生证。
常用工具：/create-prompt, /adapt, /validate-prompt, /resource-birth`,
  theme: `🧰 pi-artisan 路由：检测到 theme 操作。
theme 全生命周期：/create-theme scaffold → /adapt 适配检查 → /resource-birth 出生证。
常用工具：/create-theme, /adapt, /validate-theme, /resource-birth`,
  package: `🧰 pi-artisan 路由：检测到 package 操作。
package 全生命周期：/create-package scaffold → /adapt 适配检查 → /resource-birth 出生证。
常用工具：/create-package, /adapt, /validate-package, /resource-birth`,
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
//  能力沉淀意图检测
// ─────────────────────────────────────────────

/**
 * 用户表达将隐性经验固化为能力包的意图检测。
 * 优先级高于 detectRouting，因为沉淀流程覆盖更靠前的阶段。
 */
function detectCrystallization(text: string): boolean {
  const lower = text.toLowerCase();

  // 直接关键词匹配
  if (CRYSTALLIZATION_KEYWORDS.some((kw) => lower.includes(kw))) return true;

  // 模式匹配：「每次」+「都要」（暗示高复现频率）
  if (lower.includes("每次") && lower.includes("都要")) return true;

  // 模式匹配：「做成/封装/固化」+ 能力包类型
  const creationVerbs = ["做成", "封装", "固化", "做成一个", "变成一个"];
  const typeMentions = ["skill", "技能", "extension", "插件", "prompt", "模板", "theme", "主题", "package", "包"];
  if (creationVerbs.some((v) => lower.includes(v)) && typeMentions.some((t) => lower.includes(t))) return true;

  return false;
}

// ─────────────────────────────────────────────
//  Hook 注册
// ─────────────────────────────────────────────

export function setupInputHook(pi: ExtensionAPI): void {
  pi.on("input", async (event, _ctx) => {
    // 只处理用户直接输入（不处理来自 extension 的消息）
    if (event.source === "extension") return { action: "continue" };

    // ── 优先级 1: 能力沉淀意图（Phase A + B）──
    if (detectCrystallization(event.text)) {
      return {
        action: "transform",
        text: `${PHASE_AB_HINT}\n---\n${event.text}`,
      };
    }

    // ── 优先级 2: 能力包操作意图（已有资源类型路由）──
    const routing = detectRouting(event.text);
    if (!routing) return { action: "continue" };

    const hint = ROUTING_HINTS[routing.typeId];
    if (!hint) return { action: "continue" };

    return {
      action: "transform",
      text: `${hint}\n---\n${event.text}`,
    };
  });
}