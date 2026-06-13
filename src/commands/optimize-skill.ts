/**
 * /optimize-skill — Rubric-based SKILL.md evaluation and diagnosis.
 *
 * Usage:
 *   /optimize-skill <path>              — full diagnostic
 *   /optimize-skill <path> reevaluate   — compare after user edits
 *
 * This does NOT auto-edit SKILL.md. It diagnoses, suggests, and verifies.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { resolvePath } from "../utils/path.js";
import { diagnoseSkill, reEvaluateSkill, formatDiagnostic } from "../optimizer/optimizer.js";
import { evaluateSkill } from "../optimizer/rubric.js";

const beforeCache = new Map<string, ReturnType<typeof evaluateSkill>>();

export function registerOptimizeSkill(pi: ExtensionAPI): void {
  pi.registerCommand("optimize-skill", {
    description: "Evaluate a SKILL.md using 8-dimension Rubric. Shows scores, weak points, and improvement suggestions. Does not auto-edit. Usage: /optimize-skill <path> [reevaluate]",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      if (parts.length < 1) {
        ctx.ui?.notify(
          "Usage: /optimize-skill <path> [reevaluate]\n" +
          "  path        — Path to SKILL.md (or directory containing it)\n" +
          "  reevaluate  — Re-evaluate after edits and compare scores",
          "error",
        );
        return;
      }

      const isReeval = parts.includes("reevaluate");
      const pathArg = parts.filter((p) => p !== "reevaluate").join(" ");

      // Resolve path
      const rawPath = resolvePath(pathArg, ctx);
      const filePath = rawPath.endsWith("SKILL.md")
        ? rawPath
        : `${rawPath.replace(/\/+$/, "")}/SKILL.md`;

      if (!existsSync(filePath)) {
        ctx.ui?.notify(`❌ SKILL.md not found at ${filePath}`, "error");
        return;
      }

      if (isReeval) {
        // Re-evaluation mode: compare after user edits
        const cached = beforeCache.get(filePath);
        if (!cached) {
          ctx.ui?.notify("⚠️ 没有找到基线评估数据。请先不带 reevaluate 参数跑一次 /optimize-skill", "warning");
          return;
        }

        const result = reEvaluateSkill(filePath, cached);
        beforeCache.delete(filePath);

        ctx.ui?.notify(result.report, "info");
        ctx.ui?.setWidget("optimize-skill", result.report.split("\n"));

        if (result.improved) {
          ctx.ui?.notify(`✅ 优化有效！总分提升 ${result.delta} 分`, "info");
        } else if (result.delta === 0) {
          ctx.ui?.notify("→ 总分持平，建议针对具体维度深入改进", "info");
        } else {
          ctx.ui?.notify(`↓ 总分下降 ${Math.abs(result.delta)} 分，建议回滚本次修改`, "warning");
        }
        return;
      }

      // Diagnostic mode
      const diag = diagnoseSkill(filePath);
      const output = formatDiagnostic(diag);

      // Cache baseline for potential re-evaluation
      beforeCache.set(filePath, diag.evaluation);

      ctx.ui?.notify(output, "info");
      ctx.ui?.setWidget("optimize-skill", output.split("\n"));

      if (diag.hasBlockers) {
        ctx.ui?.notify(
          `⚠️ 有 ${diag.validationIssues.length} 个校验问题，建议先用 /validate-skill 修复`,
          "warning",
        );
      } else {
        ctx.ui?.notify(
          "💡 修改 SKILL.md 后运行 /optimize-skill <path> reevaluate 查看分数变化",
          "info",
        );
      }
    },
  });
}
