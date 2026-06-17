/**
 * create-extension command — Scaffold a new Pi Extension
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_CAPABILITIES = join(homedir(), "projects", "pi-capabilities");
const EXTENSIONS_DIR = join(homedir(), ".pi", "agent", "extensions");

const EXT_TEMPLATE = `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI): Promise<void> {
  // Register tools/commands/hooks here
  // See: https://pi.dev/docs/latest/extensions
}
`;

export function setupCreateExtensionCommand(pi: ExtensionAPI): void {
  pi.registerCommand("create-extension", {
    description: "Scaffold a new Pi Extension. Usage: /create-extension <name> \"<description>\"",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().match(/^(\S+)(?:\s+(.+))?$/);
      if (!parts) { ctx.ui.notify("用法: /create-extension <name> \"<description>\"", "error"); return; }

      const name = parts[1];
      const desc = parts[2] || "";
      if (!/^[a-z][a-z0-9-]*$/.test(name)) { ctx.ui.notify("❌ name 应小写字母/数字/连字符", "error"); return; }
      if (!desc) { ctx.ui.notify("❌ description 是必填的", "error"); return; }

      const targetDir = join(PI_CAPABILITIES, "extensions", name);
      const filePath = join(targetDir, "index.ts");
      const linkPath = join(EXTENSIONS_DIR, `${name}.ts`);

      if (existsSync(filePath)) { ctx.ui.notify(`❌ 已存在: ${filePath}`, "error"); return; }

      mkdirSync(targetDir, { recursive: true });
      writeFileSync(filePath, EXT_TEMPLATE);

      // Symlink
      if (existsSync(linkPath)) {
        try { const e = readlinkSync(linkPath); if (!existsSync(e)) unlinkSync(linkPath); } catch { /* */ }
      }
      if (!existsSync(linkPath)) symlinkSync(filePath, linkPath);

      execSync(`git add extensions/${name}/`, { cwd: PI_CAPABILITIES, stdio: "pipe", timeout: 5000 });

      ctx.ui.notify(
        `✅ /create-extension ${name}\n` +
        `   📄 ${filePath}\n` +
        `\n下一步:\n` +
        `   1. 编辑 index.ts 实现功能\n` +
        `   2. /adapt type=extension name=${name}\n` +
        `   3. /validate-extension ${filePath}`,
        "info",
      );
    },
  });

  pi.registerTool({
    name: "extension_create",
    label: "Extension Creator",
    description: "Scaffold a new Pi Extension (.ts skeleton) in pi-capabilities with symlink. Call when user wants to create a new Pi extension.",
    parameters: Type.Object({
      name: Type.String({ description: "Extension name (kebab-case, e.g., 'my-extension')" }),
      description: Type.String({ description: "Short description" }),
    }),
    async execute(_id: string, params: any) {
      const { name } = params;
      if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        return { content: [{ type: "text", text: `❌ name 应小写字母/数字/连字符: ${name}` }], details: {}, isError: true };
      }

      const targetDir = join(PI_CAPABILITIES, "extensions", name);
      const filePath = join(targetDir, "index.ts");
      const linkPath = join(EXTENSIONS_DIR, `${name}.ts`);

      if (existsSync(filePath)) {
        return { content: [{ type: "text", text: `❌ 已存在: ${filePath}` }], details: {}, isError: true };
      }

      mkdirSync(targetDir, { recursive: true });
      writeFileSync(filePath, EXT_TEMPLATE);

      if (existsSync(linkPath)) {
        try { const e = readlinkSync(linkPath); if (!existsSync(e)) unlinkSync(linkPath); } catch { /* */ }
      }
      if (!existsSync(linkPath)) symlinkSync(filePath, linkPath);

      execSync(`git add extensions/${name}/`, { cwd: PI_CAPABILITIES, stdio: "pipe", timeout: 5000 });

      return {
        content: [{ type: "text", text: `✅ Extension "${name}" 创建成功\n位置: ${filePath}\nSymlink: ${linkPath}\n\n下一步:\n1. 编辑 index.ts 实现功能\n2. /adapt type=extension name=${name}\n3. /validate-extension ${filePath}` }],
        details: {},
      };
    },
  });
}