/**
 * /adapt 命令 — 对能力包运行适配化改造检查
 *
 * 用法:
 *   /adapt              — 检查全部资源
 *   /adapt skill        — 仅检查 skill
 *   /adapt ponytail     — 仅检查指定名称的资源
 *   /adapt skill ponytail — 按类型+名称过滤
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { adaptAll, adaptByType, formatAdaptSummary } from "../adaptation/engine.js";

export function registerAdaptCommand(pi: ExtensionAPI): void {
  pi.registerCommand("adapt", {
    description: "运行 Pi Agent 适配化改造检查。用法: /adapt [type] [name]",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const validTypes = ["skill", "extension", "prompt", "theme", "package"];

      let reports;
      if (parts.length === 0) {
        // 全部资源
        reports = adaptAll();
      } else if (validTypes.includes(parts[0])) {
        // 按类型过滤
        if (parts.length >= 2) {
          // 按类型+名称，从 scanner 过滤
          const { scanByType } = await import("../catalog/scanner.js");
          const { adaptResource } = await import("../adaptation/engine.js");
          const resources = scanByType(parts[0] as any);
          const target = resources.find((r: any) => r.name === parts[1]);
          if (!target) {
            ctx.ui?.notify(`❌ 未找到 ${parts[0]}/${parts[1]}`, "error");
            return;
          }
          reports = [adaptResource(target)];
        } else {
          reports = adaptByType(parts[0]);
        }
      } else {
        // 按名称在所有类型中搜索
        const { scanResources } = await import("../catalog/scanner.js");
        const { adaptResource } = await import("../adaptation/engine.js");
        const resources = scanResources();
        const targets = resources.filter((r: any) => r.name.includes(parts[0]));
        if (targets.length === 0) {
          ctx.ui?.notify(`❌ 未找到名称包含 "${parts[0]}" 的资源`, "error");
          return;
        }
        reports = targets.map((r: any) => adaptResource(r));
      }

      const summary = formatAdaptSummary(reports);

      if (ctx.hasUI) {
        ctx.ui?.notify(summary, "info");
        // Show detailed per-resource if only one
        if (reports.length <= 3) {
          for (const r of reports) {
            const { formatAdaptReport } = await import("../adaptation/engine.js");
            ctx.ui?.notify(formatAdaptReport(r), "info");
          }
        }
      }
    },
  });
}
