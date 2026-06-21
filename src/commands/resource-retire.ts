/**
 * /resource-retire — Mark a resource as deprecated.
 *
 * For skills: updates SKILL.md frontmatter with deprecated: true.
 * For extension/prompt/theme: creates a .deprecated marker file.
 *
 * Usage:
 *   /resource-retire skill <name>                 — retire a skill (prompt + frontmatter update)
 *   /resource-retire extension <name> --reason "Use the new API instead"
 *   /resource-retire theme <name> --force         — skip confirmation
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { findResource } from "../catalog/scanner.js";
import type { ResourceType } from "../types.js";

const VALID_TYPES: ResourceType[] = ["skill", "extension", "prompt", "theme"];

/** Update SKILL.md frontmatter to add deprecated fields. */
function markSkillDeprecated(filePath: string, reason: string): boolean {
  try {
    let content = readFileSync(filePath, "utf-8");

    // If already deprecated, just update reason
    if (content.includes("deprecated: true")) {
      content = content.replace(
        /^(deprecated_at):\s*.*$/m,
        `$1: ${new Date().toISOString().slice(0, 10)}`,
      );
      if (reason) {
        content = content.replace(/^(deprecated_reason):\s*.*$/m, `$1: ${reason}`);
      }
    } else {
      // Insert after the opening --- line
      const today = new Date().toISOString().slice(0, 10);
      const depLines = [
        `deprecated: true`,
        reason ? `deprecated_reason: ${reason}` : "",
        `deprecated_at: ${today}`,
      ].filter(Boolean).join("\n");

      content = content.replace(/^(---\n)/, `$1${depLines}\n`);
    }

    writeFileSync(filePath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Create a .deprecated marker file for non-skill types. */
function markNonSkillDeprecated(filePath: string, reason: string): boolean {
  try {
    const markerPath = filePath + ".deprecated";
    const today = new Date().toISOString().slice(0, 10);
    const marker = JSON.stringify({ reason: reason || null, at: today }, null, 2);
    writeFileSync(markerPath, marker, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Find the actual file path for a non-skill resource by name and type. */
function findNonSkillPath(type: ResourceType, name: string): string | null {
  const extMap: Record<string, string> = {
    extension: ".ts",
    prompt: ".md",
    theme: ".json",
  };
  const ext = extMap[type];
  if (!ext) return null;

  const dir = join(process.env.HOME || "/home/wtown", ".pi", "agent", `${type}s`);
  if (!existsSync(dir)) return null;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const baseName = basename(entry.name, ext);
    if (baseName === name && entry.name.endsWith(ext)) {
      return join(dir, entry.name);
    }
  }
  return null;
}

export function registerResourceRetire(pi: ExtensionAPI): void {
  pi.registerCommand("resource-retire", {
    description: "Mark a resource as deprecated. Usage: /resource-retire <type> <name> [--reason \"...\"] [--force]",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);

      // Parse flags
      const reasonIdx = parts.indexOf("--reason");
      const reason = reasonIdx >= 0 && reasonIdx + 1 < parts.length ? parts[reasonIdx + 1] : "";
      const isForce = parts.includes("--force");

      // Non-flag parts: [type, name]
      const nonFlagParts = parts.filter((p) => !p.startsWith("--") && p !== reason);

      if (nonFlagParts.length < 2) {
        ctx.ui?.notify("Usage: /resource-retire <type> <name> [--reason \"...\"] [--force]", "error");
        return;
      }

      const type = nonFlagParts[0] as ResourceType;
      const name = nonFlagParts.slice(1).join(" ");

      if (!VALID_TYPES.includes(type)) {
        ctx.ui?.notify(`❌ 不支持的类型 "${type}"。支持: ${VALID_TYPES.join(", ")}`, "warning");
        return;
      }

      // Check resource exists
      const resource = findResource(type, name);
      if (!resource) {
        ctx.ui?.notify(`❌ 未找到 ${type} "${name}"`, "error");
        return;
      }

      if (resource.deprecated) {
        ctx.ui?.notify(`⚠️  ${type} "${name}" 已标记为弃用`, "info");
        return;
      }

      // Confirm unless --force
      if (!isForce) {
        ctx.ui?.notify(
          `❓ 确定要弃用 ${type} "${name}"?${reason ? `\n原因: ${reason}` : ""}\n输入 y 确认: [y/N]`,
          "info",
        );
        // In TUI mode, we need the user to type /resource-retire again with --force
        // or implement interactive confirmation — ponytail: just tell them to use --force
        ctx.ui?.notify("💡 添加 --force 跳过确认，或重新运行命令", "info");
        return;
      }

      // Execute
      let success = false;
      if (type === "skill") {
        success = markSkillDeprecated(resource.path, reason);
      } else {
        const filePath = findNonSkillPath(type, name);
        if (filePath) {
          success = markNonSkillDeprecated(filePath, reason);
        } else {
          ctx.ui?.notify(`❌ 无法找到 ${type} "${name}" 的文件路径`, "error");
          return;
        }
      }

      if (success) {
        ctx.ui?.notify(`✅ ${type} "${name}" 已标记为弃用${reason ? `\n原因: ${reason}` : ""}`, "info");
        ctx.ui?.setWidget("resource-retire", [
          `✅ ${type} "${name}" → 已弃用`,
          reason ? `  原因: ${reason}` : "",
        ].filter(Boolean));
      } else {
        ctx.ui?.notify(`❌ 弃用 ${type} "${name}" 失败`, "error");
      }
    },
  });
}
