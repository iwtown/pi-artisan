/**
 * create-skill command — 从模板 scaffold 新 skill
 *
 * 封装 init-skill.sh，在 pi-capabilities 目录创建 SKILL.md 骨架
 * + 辐射目录（references/ scripts/ assets/），自动建立 symlink。
 *
 * 补齐"生"的 gap：搜索无结果 → scaffold → 填充 → 适配 → 部署
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";
import { existsSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_CAPABILITIES = join(homedir(), "projects", "pi-capabilities");
const SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");

export function setupCreateSkillCommand(pi: ExtensionAPI): void {
  pi.registerCommand("create-skill", {
    description: "Scaffold a new skill from template. Usage: /create-skill <name> \"<description>\"",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      // Parse arguments: name and optional description
      const parts = args.trim().match(/^(\S+)(?:\s+(.+))?$/);
      if (!parts) {
        ctx.ui.notify("用法: /create-skill <kebab-case-name> \"<description>\"", "error");
        return;
      }

      const name = parts[1];
      const desc = parts[2] || "";

      if (!desc) {
        ctx.ui.notify("❌ description 是必填的，请提供一段简短描述", "error");
        return;
      }

      // 确保 pi-capabilities 存在
      if (!existsSync(PI_CAPABILITIES)) {
        ctx.ui.notify(`❌ pi-capabilities 目录不存在: ${PI_CAPABILITIES}`, "error");
        return;
      }

      try {
        // 1. 运行 init-skill.sh
        const scriptPath = join(
          homedir(), "projects", ".dotfiles", "modules", "pi-artisan", "scripts", "init-skill.sh",
        );
        if (!existsSync(scriptPath)) {
          ctx.ui.notify(`❌ init-skill.sh 未找到: ${scriptPath}`, "error");
          return;
        }

        execSync(`bash "${scriptPath}" "${name}" "${desc}"`, {
          cwd: PI_CAPABILITIES,
          stdio: "pipe",
          timeout: 10000,
          encoding: "utf-8",
        });

        // 2. 创建 symlink
        const targetDir = join(PI_CAPABILITIES, "skills", name);
        const linkDir = join(SKILLS_DIR, name);

        if (!existsSync(targetDir)) {
          ctx.ui.notify(`❌ scaffold 创建失败: ${targetDir} 不存在`, "error");
          return;
        }

        if (existsSync(linkDir)) {
          // 如果是 dangling symlink，删掉重建
          try {
            const existing = readlinkSync(linkDir);
            if (!existsSync(existing)) {
              unlinkSync(linkDir);
            }
          } catch {
            // 不是 symlink，跳过
          }
        }

        if (!existsSync(linkDir)) {
          symlinkSync(targetDir, linkDir);
        }

        // 3. 通知
        ctx.ui.notify(
          `✅ /create-skill ${name} — scaffold 完成\n` +
          `   📄 ${targetDir}/SKILL.md\n` +
          `   🔗 ${linkDir} → symlink 已建立\n` +
          `\n下一步:\n` +
          `   1. 编辑 SKILL.md 填充 Instructions / Gotchas / Eval\n` +
          `   2. /adapt type=skill name=${name}  适配检查\n` +
          `   3. /validate-skill ${targetDir}/SKILL.md  格式校验\n` +
          `   4. /resource-birth type=skill name=${name}  出生证检查`,
          "info",
        );

        // 4. 注册 git add（自动跟踪）
        execSync(`git add skills/${name}/`, {
          cwd: PI_CAPABILITIES,
          stdio: "pipe",
          timeout: 5000,
        });
      } catch (err: any) {
        ctx.ui.notify(`❌ 创建失败: ${err.message || err}`, "error");
      }
    },
  });

  // Also register as LLM tool for -p mode
  pi.registerTool({
    name: "skill_create",
    label: "Skill Creator",
    description: "Scaffold a new skill from template in pi-capabilities, create symlink. Call this when user wants to create a new skill from scratch and no suitable existing skill is found.",
    parameters: Type.Object({
      name: Type.String({
        description: "Skill name in kebab-case (e.g., 'my-skill')",
      }),
      description: Type.String({
        description: "Short description of what the skill does",
      }),
    }),
    async execute(_toolCallId: string, params: { name: string; description: string }, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      const { name, description } = params;

      // 验证
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
        return {
          content: [{ type: "text", text: `❌ name must be kebab-case (lowercase, digits, hyphens only): ${name}` }],
          details: {},
          isError: true,
        };
      }

      if (!existsSync(PI_CAPABILITIES)) {
        return {
          content: [{ type: "text", text: `❌ pi-capabilities 目录不存在: ${PI_CAPABILITIES}` }],
          details: {},
          isError: true,
        };
      }

      try {
        const scriptPath = join(
          homedir(), "projects", ".dotfiles", "modules", "pi-artisan", "scripts", "init-skill.sh",
        );
        execSync(`bash "${scriptPath}" "${name}" "${description}"`, {
          cwd: PI_CAPABILITIES,
          stdio: "pipe",
          timeout: 10000,
          encoding: "utf-8",
        });

        // Symlink
        const targetDir = join(PI_CAPABILITIES, "skills", name);
        const linkDir = join(SKILLS_DIR, name);

        if (existsSync(linkDir)) {
          try {
            const existing = readlinkSync(linkDir);
            if (!existsSync(existing)) unlinkSync(linkDir);
          } catch { /* not a symlink, skip */ }
        }

        if (!existsSync(linkDir)) {
          symlinkSync(targetDir, linkDir);
        }

        // Git track
        execSync(`git add skills/${name}/`, {
          cwd: PI_CAPABILITIES,
          stdio: "pipe",
          timeout: 5000,
        });

        return {
          content: [{
            type: "text",
            text: `✅ Skill "${name}" 创建成功

位置: ${targetDir}/SKILL.md
Symlink: ${linkDir} → pi-capabilities

下一步:
1. 编辑 SKILL.md → 填充 Instructions / Gotchas / Eval / Forbidden Load
2. 运行 /adapt type=skill name=${name} 适配检查
3. 运行 /validate-skill 校验格式
4. 运行 /resource-birth type=skill name=${name} 出生证检查
5. git commit -m \"feat: add ${name} skill\" 后自动同步`,
          }],
          details: {},
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `❌ 创建失败: ${err.message || err}` }],
          details: {},
          isError: true,
        };
      }
    },
  });
}
