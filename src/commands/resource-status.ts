/**
 * /resource-status — detailed quality report for a single resource.
 *
 * Usage:
 *   /resource-status skill hv-analysis
 *   /resource-status extension my-ext --json
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findResource } from "../catalog/scanner.js";
import { computeQualityScore } from "../catalog/score.js";
import { generateReport } from "../catalog/report.js";
import type { ResourceType } from "../types.js";

const VALID_TYPES: ResourceType[] = ["skill", "extension", "prompt", "theme", "package"];

export function registerResourceStatus(pi: ExtensionAPI): void {
  pi.registerCommand("resource-status", {
    description: "Show detailed quality report for a resource. Usage: /resource-status <type> <name> [--json]",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const isJson = parts.includes("--json");
      const nonFlagParts = parts.filter((p) => !p.startsWith("--"));

      if (nonFlagParts.length < 2) {
        ctx.ui?.notify("Usage: /resource-status <type> <name> [--json]\n  type: skill | extension | prompt | theme | package", "error");
        return;
      }

      const typeArg = nonFlagParts[0];
      const nameArg = nonFlagParts.slice(1).join(" ");

      const type = VALID_TYPES.find((t) => t === typeArg);
      if (!type) {
        ctx.ui?.notify(`Invalid type "${typeArg}". Valid: ${VALID_TYPES.join(", ")}`, "error");
        return;
      }

      const resource = findResource(type, nameArg);
      if (!resource) {
        ctx.ui?.notify(`Resource not found: ${type}/${nameArg}`, "error");
        ctx.ui?.setWidget("resource-status", [`❌ ${type}/${nameArg} not found`]);
        return;
      }

      try {
        const score = computeQualityScore(resource.type, resource.path);
        const report = generateReport(resource, score);

        if (isJson) {
          ctx.ui?.notify(JSON.stringify({ resource, score }, null, 2), "info");
          return;
        }

        ctx.ui?.notify(report, "info");
        ctx.ui?.setWidget("resource-status", report.split("\n"));
      } catch (e: any) {
        ctx.ui?.notify(`Error computing score: ${e.message}`, "error");
      }
    },
  });
}
