/**
 * /resource-birth command — birth certificate for resources.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ResourceType } from "../types.js";
import { runBirthCert } from "../birth/runner.js";
import { renderBirthResult, renderFullBirthResult } from "../birth/renderer.js";

const VALID_TYPES = ["skill", "extension", "prompt", "theme", "package"];

/**
 * Register the /resource-birth command.
 */
export function registerBirthCert(pi: ExtensionAPI): void {
  pi.registerCommand("resource-birth", {
    description: "检查资源是否准备好发布（出生证）。用法: /resource-birth <type> <name> [--all]",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui?.notify("用法: /resource-birth <type> <name> [--all]\n  type: skill|extension|prompt|theme|package\n  name: 资源名称、路径或 slug\n  --all: 展开所有条目", "error");
        return;
      }

      const type = parts[0].toLowerCase();
      if (!VALID_TYPES.includes(type)) {
        ctx.ui?.notify(`无效类型: ${type}，有效值: ${VALID_TYPES.join(", ")}`, "error");
        return;
      }

      const showAll = parts[parts.length - 1] === "--all";
      const name = showAll ? parts.slice(1, -1).join(" ") : parts.slice(1).join(" ");

      const result = runBirthCert(type as ResourceType, name);
      const lines = showAll ? renderFullBirthResult(result) : renderBirthResult(result);

      for (const line of lines) {
        ctx.ui?.notify(line, "info");
      }
      ctx.ui?.setWidget("birth-cert", lines);
    },
  });
}
