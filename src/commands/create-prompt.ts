/**
 * create-prompt command — Scaffold a new Prompt Template
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";
import { existsSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_CAPABILITIES = join(homedir(), "projects", "pi-capabilities");
const PROMPTS_DIR = join(homedir(), ".pi", "agent", "prompts");

const PROMPT_TEMPLATE = (name: string, desc: string) => `---
description: ${desc}
argument-hint: <arg1> [arg2]
tags: [prompt-template]
---

# ${name}

<!-- Instructions for what this template expands to. Use $1, $2, $@ for arguments. -->

\$@
`;

export function setupCreatePromptCommand(pi: ExtensionAPI): void {
  pi.registerCommand("create-prompt", {
    description: "Scaffold a new Prompt Template. Usage: /create-prompt <name> \"<description>\"",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().match(/^(\S+)(?:\s+(.+))?$/);
      if (!parts) { ctx.ui.notify("用法: /create-prompt <name> \"<description>\"", "error"); return; }

      const name = parts[1];
      const desc = parts[2] || "";
      if (!/^[a-z][a-z0-9-]{0,30}$/.test(name)) { ctx.ui.notify("❌ name 应小写字母/数字/连字符（文件名即命令名）", "error"); return; }
      if (!desc) { ctx.ui.notify("❌ description 是必填的", "error"); return; }

      const filePath = join(PI_CAPABILITIES, "prompts", `${name}.md`);
      const linkPath = join(PROMPTS_DIR, `${name}.md`);

      if (existsSync(filePath)) { ctx.ui.notify(`❌ 已存在: ${filePath}`, "error"); return; }

      execSync(`mkdir -p "${join(PI_CAPABILITIES, "prompts")}"`, { stdio: "pipe" });
      writeFileSync(filePath, PROMPT_TEMPLATE(name, desc));

      // Symlink
      if (existsSync(linkPath)) {
        try { const e = readlinkSync(linkPath); if (!existsSync(e)) unlinkSync(linkPath); } catch { /* */ }
      }
      if (!existsSync(linkPath)) symlinkSync(filePath, linkPath);

      execSync(`git add prompts/${name}.md`, { cwd: PI_CAPABILITIES, stdio: "pipe", timeout: 5000 });

      ctx.ui.notify(
        `✅ /create-prompt ${name}\n` +
        `   📄 ${filePath}\n` +
        `   🔗 /${name} 即可展开\n` +
        `\n下一步:\n` +
        `   1. 编辑模板内容（可用 $1, $2, $@, \${1:-default}）\n` +
        `   2. 更新 argument-hint 为实际参数提示\n` +
        `   3. /adapt type=prompt name=${name}\n` +
        `   4. /validate-prompt ${filePath}`,
        "info",
      );
    },
  });

  pi.registerTool({
    name: "prompt_create",
    label: "Prompt Template Creator",
    description: "Scaffold a new Prompt Template (.md). Call when user wants to create a new slash-command prompt template.",
    parameters: Type.Object({
      name: Type.String({ description: "Command name (kebab-case, max 31 chars, e.g., 'deploy-help')" }),
      description: Type.String({ description: "Brief description shown in autocomplete" }),
    }),
    async execute(_id: string, params: any) {
      const { name, description } = params;
      if (!/^[a-z][a-z0-9-]{0,30}$/.test(name)) {
        return { content: [{ type: "text", text: `❌ name 应小写/数字/连字符 ≤31 字符: ${name}` }], details: {}, isError: true };
      }

      const filePath = join(PI_CAPABILITIES, "prompts", `${name}.md`);
      const linkPath = join(PROMPTS_DIR, `${name}.md`);

      if (existsSync(filePath)) {
        return { content: [{ type: "text", text: `❌ 已存在: ${filePath}` }], details: {}, isError: true };
      }

      execSync(`mkdir -p "${join(PI_CAPABILITIES, "prompts")}"`, { stdio: "pipe" });
      writeFileSync(filePath, PROMPT_TEMPLATE(name, description));

      if (existsSync(linkPath)) {
        try { const e = readlinkSync(linkPath); if (!existsSync(e)) unlinkSync(linkPath); } catch { /* */ }
      }
      if (!existsSync(linkPath)) symlinkSync(filePath, linkPath);

      execSync(`git add prompts/${name}.md`, { cwd: PI_CAPABILITIES, stdio: "pipe", timeout: 5000 });

      return {
        content: [{ type: "text", text: `✅ Prompt "${name}" 创建成功\n位置: ${filePath}\n展开: /${name}\n\n下一步:\n1. 编辑模板内容\n2. /adapt type=prompt name=${name}\n3. /validate-prompt ${filePath}` }],
        details: {},
      };
    },
  });
}