/**
 * create-package command — Scaffold a new Pi Package
 *
 * Creates package.json with pi manifest + conventional directories
 * (skills/ extensions/ prompts/ themes/) all at once.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_CAPABILITIES = join(homedir(), "projects", "pi-capabilities");

export function setupCreatePackageCommand(pi: ExtensionAPI): void {
  pi.registerCommand("create-package", {
    description: "Scaffold a new Pi Package with pi manifest. Usage: /create-package <name>",
    handler: async (args: string, ctx: any) => {
      const name = args.trim();
      if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
        ctx.ui.notify("❌ name 应 kebab-case（小写/数字/连字符）", "error");
        return;
      }

      const targetDir = join(PI_CAPABILITIES, "packages", name);
      if (existsSync(targetDir)) { ctx.ui.notify(`❌ 已存在: ${targetDir}`, "error"); return; }

      const pkg = {
        name: `pi-${name}`,
        version: "0.1.0",
        description: `Pi package: ${name}`,
        keywords: ["pi-package"],
        pi: {
          skills: ["skills/*"],
          extensions: ["extensions/*"],
          prompts: ["prompts/*"],
          themes: ["themes/*"],
        },
      };

      mkdirSync(targetDir, { recursive: true });
      for (const dir of ["skills", "extensions", "prompts", "themes"]) {
        mkdirSync(join(targetDir, dir), { recursive: true });
        writeFileSync(join(targetDir, dir, ".gitkeep"), "");
      }
      writeFileSync(join(targetDir, "package.json"), JSON.stringify(pkg, null, 2));

      execSync(`git add packages/${name}/`, { cwd: PI_CAPABILITIES, stdio: "pipe", timeout: 5000 });

      ctx.ui.notify(
        `✅ /create-package ${name}\n` +
        `   📄 ${targetDir}/package.json\n` +
        `   📁 skills/ extensions/ prompts/ themes/ 已就绪\n` +
        `\n下一步:\n` +
        `   1. 在对应目录放入实际文件\n` +
        `   2. /adapt type=package name=${name}\n` +
        `   3. /validate-package ${targetDir}`,
        "info",
      );
    },
  });

  pi.registerTool({
    name: "package_create",
    label: "Package Creator",
    description: "Scaffold a new Pi Package with package.json + pi manifest + skills/extensions/prompts/themes directories. Call when user wants to bundle multiple resources into a Pi package.",
    parameters: Type.Object({
      name: Type.String({ description: "Package name (kebab-case, e.g., 'my-toolkit')" }),
    }),
    async execute(_id: string, params: any) {
      const { name } = params;
      if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        return { content: [{ type: "text", text: `❌ name 应 kebab-case: ${name}` }], details: {}, isError: true };
      }

      const targetDir = join(PI_CAPABILITIES, "packages", name);
      if (existsSync(targetDir)) {
        return { content: [{ type: "text", text: `❌ 已存在: ${targetDir}` }], details: {}, isError: true };
      }

      const pkg = {
        name: `pi-${name}`,
        version: "0.1.0",
        description: `Pi package: ${name}`,
        keywords: ["pi-package"],
        pi: { skills: ["skills/*"], extensions: ["extensions/*"], prompts: ["prompts/*"], themes: ["themes/*"] },
      };

      mkdirSync(targetDir, { recursive: true });
      for (const dir of ["skills", "extensions", "prompts", "themes"]) {
        mkdirSync(join(targetDir, dir), { recursive: true });
        writeFileSync(join(targetDir, dir, ".gitkeep"), "");
      }
      writeFileSync(join(targetDir, "package.json"), JSON.stringify(pkg, null, 2));

      execSync(`git add packages/${name}/`, { cwd: PI_CAPABILITIES, stdio: "pipe", timeout: 5000 });

      return {
        content: [{ type: "text", text: `✅ Package "${name}" 创建成功\n位置: ${targetDir}/package.json\n\n下一步:\n1. 在 skills/ extensions/ prompts/ themes/ 放入实际文件\n2. /adapt type=package name=${name}\n3. /validate-package ${targetDir}` }],
        details: {},
      };
    },
  });
}