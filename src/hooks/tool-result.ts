/**
 * tool_result hook — auto-validates SKILL.md and .ts after write/edit.
 *
 * Non-blocking: warns only, does not prevent write.
 * Silent in -p (non-TUI) mode.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pendingPaths } from "./tool-call.js";
import { validateSkill } from "../validators/skill.js";
import { validateExtensionStructure } from "../validators/extension.js";
/**
 * Set up the tool_result hook for post-write auto-validation.
 */
export function setupToolResultHook(pi: ExtensionAPI): void {
  pi.on("tool_result", async (event: any, ctx: any) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;
    if (event.isError) return;

    const filePath = pendingPaths.get(event.toolCallId);
    if (!filePath) return;
    pendingPaths.delete(event.toolCallId);

    const fileName = basename(filePath);
    let issues: string[];
    let type: string;

    if (fileName === "SKILL.md") {
      issues = validateSkill(filePath).map((i) => i.message);
      type = "SKILL.md";
    } else if (fileName.endsWith(".ts")) {
      issues = validateExtensionStructure(readFileSync(filePath, "utf-8")).map((i) => i.message);
      type = "extension";
    } else {
      return;
    }

    // TUI only — silent in -p mode
    if (ctx.hasUI) {
      if (issues.length === 0) {
        ctx.ui?.notify(`✅ ${type}: ${basename(filePath)}`, "info");
      } else {
        ctx.ui?.notify(`⚠️ ${type}: ${issues.length} issues in ${basename(filePath)}`, "warning");
      }
    }
    return undefined;
  });
}
