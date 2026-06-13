/**
 * /resource-publish — validate then publish a skill to SkillHub.
 *
 * Usage:
 *   /resource-publish skill <path>                — validate + publish
 *   /resource-publish skill <path> --dry-run      — validate only, no upload
 *   /resource-publish skill <path> --version 1.1.0 — override version
 *   /resource-publish skill <path> --changelog "fix: ..."  — changelog
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolvePath } from "../utils/path.js";
import { validateSkill } from "../validators/skill.js";
import { execSync } from "node:child_process";
import { recordObservation } from "../catalog/observations.js";

export function registerResourcePublish(pi: ExtensionAPI): void {
  pi.registerCommand("resource-publish", {
    description: "Validate then publish a resource. Only 'skill' type is supported. Usage: /resource-publish skill <path> [--dry-run] [--version X] [--changelog \"...\"]",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);

      // Parse flags
      const isDryRun = parts.includes("--dry-run");
      const versionIdx = parts.indexOf("--version");
      const version = versionIdx >= 0 && versionIdx + 1 < parts.length ? parts[versionIdx + 1] : null;
      const changelogIdx = parts.indexOf("--changelog");
      const changelog = changelogIdx >= 0 && changelogIdx + 1 < parts.length ? parts[changelogIdx + 1] : null;

      // Non-flag parts: [type, path]
      const nonFlagParts = parts.filter((p) => !p.startsWith("--") && p !== version && p !== changelog);

      if (nonFlagParts.length < 2) {
        ctx.ui?.notify("Usage: /resource-publish skill <path> [--dry-run] [--version X] [--changelog \"...\"]", "error");
        return;
      }

      const type = nonFlagParts[0];
      const pathArg = nonFlagParts.slice(1).join(" ");

      if (type !== "skill") {
        ctx.ui?.notify(`❌ "${type}" 类型无线上发布平台。仅支持 skill 类型。`, "warning");
        return;
      }

      // Resolve path
      const filePath = resolvePath(pathArg, ctx);
      const dirPath = filePath.endsWith("SKILL.md") ? filePath.replace(/\/SKILL\.md$/, "") : filePath;
      const skillMdPath = dirPath.endsWith("SKILL.md") ? dirPath : `${dirPath.replace(/\/+$/, "")}/SKILL.md`;

      if (!existsSync(skillMdPath)) {
        ctx.ui?.notify(`❌ SKILL.md not found at ${skillMdPath}`, "error");
        return;
      }

      // Step 1: validate
      ctx.ui?.notify("🔍 正在校验 SKILL.md…", "info");
      const issues = validateSkill(skillMdPath);

      if (issues.length > 0) {
        const issueText = issues.map((i) => `  - ${i.message}`).join("\n");
        ctx.ui?.notify(`⚠️ 校验未通过 (${issues.length} issues):\n${issueText}`, "warning");
        ctx.ui?.setWidget("resource-publish", [
          "❌ 发布中止：校验未通过",
          ...issues.map((i) => `  - ${i.message}`),
          "💡 请修复后重试",
        ]);
        return;
      }

      ctx.ui?.notify("✅ 校验通过", "info");

      // Step 2: Build publish command
      const publishDir = dirPath.replace(/\/SKILL\.md$/, "");
      let cmd = `skillhub publish "${publishDir}"`;

      if (version) cmd += ` --version "${version}"`;
      if (changelog) cmd += ` --changelog "${changelog}"`;
      if (isDryRun) cmd += ` --dry-run`;

      // Step 3: Execute
      ctx.ui?.notify(`📤 ${isDryRun ? "预检" : "发布"}中…\n$ ${cmd}`, "info");

      try {
        const out = execSync(cmd, { timeout: 30000, encoding: "utf-8" });
        ctx.ui?.notify(out.trim(), "info");

        if (!isDryRun) {
          // Extract version for observation record
          let pubVersion = version || "";
          if (!pubVersion) {
            try {
              const content = readFileSync(skillMdPath, "utf-8");
              const m = content.match(/^version:\s*(.+)$/m);
              if (m) pubVersion = m[1].trim();
            } catch { /* skip */ }
          }

          // Record observation (回炉清单)
          const slug = skillMdPath.replace(/\/SKILL\.md$/, "").split("/").pop() || "skill";
          recordObservation(slug, pubVersion || "1.0.0");

          // Record published_at in SKILL.md frontmatter
          try {
            const content = readFileSync(skillMdPath, "utf-8");
            const updated = content.replace(
              /^(---\n)/,
              `$1published_at: ${new Date().toISOString().slice(0, 10)}\n`,
            );
            if (updated !== content) {
              writeFileSync(skillMdPath, updated);
            }
          } catch { /* skip metadata update on error */ }
        }

        ctx.ui?.setWidget("resource-publish", [
          `✅ ${isDryRun ? "预检" : "发布"}成功`,
          `  路径: ${publishDir}`,
          version ? `  版本: ${version}` : "",
          changelog ? `  changelog: ${changelog}` : "",
          isDryRun ? "  使用 --dry-run 移除可真正发布" : "",
        ].filter(Boolean));
      } catch (e: any) {
        ctx.ui?.notify(`❌ ${isDryRun ? "预检" : "发布"}失败: ${e.message}`, "error");
        ctx.ui?.setWidget("resource-publish", [
          "❌ 发布失败",
          `  ${e.message}`,
        ]);
      }
    },
  });
}
