/**
 * create-theme command — Scaffold a new Theme with all 51 required color tokens
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";
import { existsSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_CAPABILITIES = join(homedir(), "projects", "pi-capabilities");
const THEMES_DIR = join(homedir(), ".pi", "agent", "themes");

const THEME_TEMPLATE = (name: string) => {
  const colors: Record<string, string> = {
    // Core UI
    accent: "#007acc",
    border: "#333333",
    borderAccent: "#007acc",
    borderMuted: "#222222",
    success: "#4ec9b0",
    error: "#f44747",
    warning: "#cca700",
    muted: "#666666",
    dim: "#999999",
    text: "#cccccc",
    thinkingText: "#888888",
    selectedBg: "#37373d",
    userMessageBg: "#1e1e1e",
    userMessageText: "#cccccc",
    customMessageBg: "#1e1e1e",
    customMessageText: "#cccccc",
    customMessageLabel: "#888888",
    toolPendingBg: "#1e1e1e",
    toolSuccessBg: "#1e1e1e",
    toolErrorBg: "#1e1e1e",
    toolTitle: "#cccccc",
    toolOutput: "#cccccc",

    // Markdown
    mdHeading: "#569cd6",
    mdLink: "#3794ff",
    mdLinkUrl: "#6a9955",
    mdCode: "#ce9178",
    mdCodeBlock: "#dcdcaa",
    mdCodeBlockBorder: "#333333",
    mdQuote: "#6a9955",
    mdQuoteBorder: "#6a9955",
    mdHr: "#333333",
    mdListBullet: "#569cd6",

    // Diffs
    toolDiffAdded: "#4ec9b0",
    toolDiffRemoved: "#f44747",
    toolDiffContext: "#cccccc",

    // Syntax
    syntaxComment: "#6a9955",
    syntaxKeyword: "#569cd6",
    syntaxFunction: "#dcdcaa",
    syntaxVariable: "#9cdcfe",
    syntaxString: "#ce9178",
    syntaxNumber: "#b5cea8",
    syntaxType: "#4ec9b0",
    syntaxOperator: "#d4d4d4",
    syntaxPunctuation: "#d4d4d4",

    // Thinking
    thinkingOff: "#333333",
    thinkingMinimal: "#666666",
    thinkingLow: "#888888",
    thinkingMedium: "#aaaaaa",
    thinkingHigh: "#cccccc",
    thinkingXhigh: "#dddddd",
    bashMode: "#1e1e1e",
  };

  return JSON.stringify({
    $schema: "https://raw.githubusercontent.com/earendil-works/pi/main/schemas/theme.json",
    name,
    colors,
    vars: {
      bg: "#1e1e1e",
      fg: "#cccccc",
      primary: "#007acc",
      secondary: "#569cd6",
    },
    export: {
      pageBg: "#1e1e1e",
      cardBg: "#252526",
      infoBg: "#1e1e1e",
      text: "#cccccc",
      accent: "#007acc",
    },
  }, null, 2);
};

export function setupCreateThemeCommand(pi: ExtensionAPI): void {
  pi.registerCommand("create-theme", {
    description: "Scaffold a new Theme with all 51 required color tokens. Usage: /create-theme <name>",
    handler: async (args: string, ctx: any) => {
      const name = args.trim();
      if (!name || !/^[a-zA-Z][a-zA-Z0-9 -]*$/.test(name)) {
        ctx.ui.notify("❌ name 应字母开头，字母/数字/空格/连字符", "error");
        return;
      }

      const filePath = join(PI_CAPABILITIES, "themes", `${name.replace(/\s+/g, "-").toLowerCase()}.json`);
      const linkPath = join(THEMES_DIR, `${name.replace(/\s+/g, "-").toLowerCase()}.json`);

      if (existsSync(filePath)) { ctx.ui.notify(`❌ 已存在: ${filePath}`, "error"); return; }

      execSync(`mkdir -p "${join(PI_CAPABILITIES, "themes")}"`, { stdio: "pipe" });
      writeFileSync(filePath, THEME_TEMPLATE(name));

      if (existsSync(linkPath)) {
        try { const e = readlinkSync(linkPath); if (!existsSync(e)) unlinkSync(linkPath); } catch { /* */ }
      }
      if (!existsSync(linkPath)) symlinkSync(filePath, linkPath);

      execSync(`git add themes/${name.replace(/\s+/g, "-").toLowerCase()}.json`, { cwd: PI_CAPABILITIES, stdio: "pipe", timeout: 5000 });

      ctx.ui.notify(
        `✅ /create-theme ${name}\n` +
        `   📄 ${filePath}\n` +
        `   🔗 已建立 symlink，即刻可用\n` +
        `\n下一步:\n` +
        `   1. 调整颜色值\n` +
        `   2. /adapt type=theme name=${name}\n` +
        `   3. /validate-theme ${filePath}`,
        "info",
      );
    },
  });

  pi.registerTool({
    name: "theme_create",
    label: "Theme Creator",
    description: "Scaffold a new Theme (.json) with all 51 required color tokens + vars + export sections. Call when user wants to create a new color theme.",
    parameters: Type.Object({
      name: Type.String({ description: "Theme display name (e.g., 'My Dark Theme')" }),
    }),
    async execute(_id: string, params: any) {
      const { name } = params;
      if (!name || !/^[a-zA-Z][a-zA-Z0-9 -]*$/.test(name)) {
        return { content: [{ type: "text", text: `❌ name 应字母开头: ${name}` }], details: {}, isError: true };
      }

      const slug = name.replace(/\s+/g, "-").toLowerCase();
      const filePath = join(PI_CAPABILITIES, "themes", `${slug}.json`);
      const linkPath = join(THEMES_DIR, `${slug}.json`);

      if (existsSync(filePath)) {
        return { content: [{ type: "text", text: `❌ 已存在: ${filePath}` }], details: {}, isError: true };
      }

      execSync(`mkdir -p "${join(PI_CAPABILITIES, "themes")}"`, { stdio: "pipe" });
      writeFileSync(filePath, THEME_TEMPLATE(name));

      if (existsSync(linkPath)) {
        try { const e = readlinkSync(linkPath); if (!existsSync(e)) unlinkSync(linkPath); } catch { /* */ }
      }
      if (!existsSync(linkPath)) symlinkSync(filePath, linkPath);

      execSync(`git add themes/${slug}.json`, { cwd: PI_CAPABILITIES, stdio: "pipe", timeout: 5000 });

      return {
        content: [{ type: "text", text: `✅ Theme "${name}" 创建成功\n位置: ${filePath}\n\n下一步:\n1. 调整颜色值\n2. /adapt type=theme name=${slug}\n3. /validate-theme ${filePath}` }],
        details: {},
      };
    },
  });
}