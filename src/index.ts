/**
 * pi-artisan — Pi Agent 人工封装能力包的工坊
 *
 * 🧬 对 5 种能力包（skill/extension/prompt/theme/package）
 *    承担从生到养的全部责任——知道什么时候该做什么、怎么做才算好、出了门还得管。
 *
 * 自动校验（write/edit 后触发）：
 *   SKILL.md  → 25 项 frontmatter + 目录结构检查
 *   .ts       → export/import/命名/命名空间
 *
 * 启动巡检（before_agent_start）：
 *   自动扫描 5 种资源的健康状态，老化/版本落后时通知
 *
 * 校验命令：
 *   /validate-skill      validate_skill      SKILL.md
 *   /validate-extension  validate_extension  .ts 扩展
 *   /validate-prompt     validate_prompt     提示词模板
 *   /validate-theme      validate_theme      主题配色
 *   /validate-package    validate_package    Pi Package 目录
 *
 * 资源管理命令：
 *   /resource-list       resource_list       列出资源
 *   /resource-status     resource_status     查看质量报告
 *   /resource-maintain   resource_maintain   老化检测+版本追踪
 *   /resource-publish    resource_publish    发布编排→skillhub
 *
 * 质量增强命令：
 *   /resource-birth      resource_birth      出生证（出门把关）
 *   /optimize-skill      optimize_skill      8维Rubric诊断+定制改进
 *
 * 非阻塞：只警告，不阻止写入。-p 模式静默。
 *
 * @see ./validators/    — 5 个独立 validator 模块
 * @see ./hooks/         — auto-validate + startup hooks
 * @see ./commands/      — 11 个 slash command
 * @see ./tools/         — 11 个 LLM tool
 * @see ./catalog/       — 资源目录 + 评分 + 老化 + 版本
 * @see ./optimizer/     — Rubric 评分 + 改进建议
 * @see ./birth/         — 出生证检查
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { setupInputHook } from "./hooks/input.js";
import { setupToolCallHook } from "./hooks/tool-call.js";
import { setupToolResultHook } from "./hooks/tool-result.js";
import { setupBeforeStartHook } from "./hooks/before-start.js";
import { registerCommands } from "./commands/index.js";
import { registerTools } from "./tools/index.js";

export default function (pi: ExtensionAPI): void {
  // Hooks — startup inspection + auto-validate + intent routing
  setupInputHook(pi);
  setupBeforeStartHook(pi);
  setupToolCallHook(pi);
  setupToolResultHook(pi);

  // Slash commands — interactive TUI validation
  registerCommands(pi);

  // LLM tools — callable in -p mode
  registerTools(pi);
}
