/**
 * /resource-list — list installed Pi resources of all types.
 *
 * Usage:
 *   /resource-list               — summary of all types (top 5 each)
 *   /resource-list skill          — all skills
 *   /resource-list skill --json   — JSON output
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { scanByType, scanResources } from "../catalog/scanner.js";
import { computeQualityScore } from "../catalog/score.js";
import { formatResourceTable } from "../catalog/report.js";
import type { ResourceType } from "../types.js";

const VALID_TYPES: ResourceType[] = ["skill", "extension", "prompt", "theme", "package"];
const TYPE_LABELS: Record<ResourceType, string> = {
  skill: "Skills",
  extension: "Extensions",
  prompt: "Prompts",
  theme: "Themes",
  package: "Packages",
};

export function registerResourceList(pi: ExtensionAPI): void {
  pi.registerCommand("resource-list", {
    description: "List installed Pi resources by type. Usage: /resource-list [type] [--json]",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const typeArg = parts.find((p) => !p.startsWith("--")) || "";
      const isJson = parts.includes("--json");

      // If a valid type is specified, show only that type
      const targetType = VALID_TYPES.find((t) => t === typeArg);

      if (targetType) {
        const resources = scanByType(targetType);
        // Compute scores
        const scored = resources.map((r) => {
          try {
            const score = computeQualityScore(r.type, r.path);
            return { ...r, qualityScore: score.overall };
          } catch {
            return { ...r, qualityScore: null };
          }
        });

        if (isJson) {
          ctx.ui?.notify(JSON.stringify(scored, null, 2), "info");
          return;
        }

        const table = formatResourceTable(scored, TYPE_LABELS[targetType]);
        ctx.ui?.notify(table, "info");
        ctx.ui?.setWidget("resource-list", table.split("\n"));
        return;
      }

      // Show all types summary
      if (isJson) {
        const all = scanResources();
        ctx.ui?.notify(JSON.stringify(all, null, 2), "info");
        return;
      }

      const lines: string[] = [];
      lines.push("┌─ 已安装资源总览 ───────────────────────────┐");

      for (const t of VALID_TYPES) {
        const resources = scanByType(t);
        const label = TYPE_LABELS[t];
        const top = resources.slice(0, 5).map((r) => {
          const ver = r.version ? `v${r.version}` : "";
          return `  ${r.name}${ver ? ` ${ver}` : ""}`;
        });

        lines.push(`│ ${label} (${resources.length}):`);
        if (top.length === 0) {
          lines.push(`│   (空)`);
        } else {
          for (const item of top) lines.push(`│ ${item}`);
        }
        if (resources.length > 5) {
          lines.push(`│   … 还有 ${resources.length - 5} 个`);
        }
        lines.push(`│${" ".repeat(50)}│`);
      }

      lines.push("└──────────────────────────────────────────────┘");
      const output = lines.join("\n");
      ctx.ui?.notify(output, "info");
      ctx.ui?.setWidget("resource-list", lines);
    },
  });
}
