/**
 * Slash command registration — registers all interactive TUI validate commands.
 *
 * Commands:
 *   /validate-skill      <path>   — validate SKILL.md
 *   /validate-extension  <path>   — validate .ts extension
 *   /validate-prompt     <path>   — validate prompt template (.md)
 *   /validate-theme      <path>   — validate theme (.json)
 *   /validate-package    <path>   — validate Pi Package directory
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolvePath, locationHint } from "../utils/path.js";
import { notifyResults } from "../utils/result.js";
import { validateSkill } from "../validators/skill.js";
import { validateExtensionStructure } from "../validators/extension.js";
import { validatePromptTemplate } from "../validators/prompt.js";
import { validateThemeColors } from "../validators/theme.js";
import { validatePackage } from "../validators/package.js";
import { registerResourceList } from "./resource-list.js";
import { registerResourceStatus } from "./resource-status.js";
import { registerResourceMaintain } from "./resource-maintain.js";
import { registerResourcePublish } from "./resource-publish.js";
import { registerOptimizeSkill } from "./optimize-skill.js";
import { registerBirthCert } from "./birth-cert.js";

type CommandHandler = (args: string, ctx: any) => Promise<void>;

interface CommandDef {
  description: string;
  handler: CommandHandler;
}

function register(pi: ExtensionAPI, name: string, def: CommandDef): void {
  pi.registerCommand(name, def);
}

/**
 * Register all validate-* slash commands and resource management commands.
 */
export function registerCommands(pi: ExtensionAPI): void {
  // ── validate-skill ──
  register(pi, "validate-skill", {
    description: "Validate a SKILL.md file (frontmatter + directory checks)",
    handler: async (args: string, ctx: any) => {
      const filePath = resolvePath(args.trim(), ctx);
      if (!existsSync(filePath)) { ctx.ui?.notify(`File not found: ${filePath}`, "error"); return; }
      const issues = validateSkill(filePath);
      notifyResults("SKILL.md", filePath, issues, locationHint(filePath, "skills"), ctx);
    },
  });

  // ── validate-extension ──
  register(pi, "validate-extension", {
    description: "Validate a .ts extension file (export/import checks)",
    handler: async (args: string, ctx: any) => {
      const filePath = resolvePath(args.trim(), ctx);
      if (!existsSync(filePath)) { ctx.ui?.notify(`File not found: ${filePath}`, "error"); return; }
      const issues = validateExtensionStructure(readFileSync(filePath, "utf-8"));
      notifyResults("extension", filePath, issues, locationHint(filePath, "extensions"), ctx);
    },
  });

  // ── validate-prompt ──
  register(pi, "validate-prompt", {
    description: "Validate a prompt template (.md file in prompts/)",
    handler: async (args: string, ctx: any) => {
      const filePath = resolvePath(args.trim(), ctx);
      if (!existsSync(filePath)) { ctx.ui?.notify(`File not found: ${filePath}`, "error"); return; }
      const issues = validatePromptTemplate(readFileSync(filePath, "utf-8"), filePath);
      notifyResults("prompt template", filePath, issues, locationHint(filePath, "prompts"), ctx);
    },
  });

  // ── validate-theme ──
  register(pi, "validate-theme", {
    description: "Validate a theme file (.json in themes/)",
    handler: async (args: string, ctx: any) => {
      const filePath = resolvePath(args.trim(), ctx);
      if (!existsSync(filePath)) { ctx.ui?.notify(`File not found: ${filePath}`, "error"); return; }
      const issues = validateThemeColors(readFileSync(filePath, "utf-8"), filePath);
      notifyResults("theme", filePath, issues, locationHint(filePath, "themes"), ctx);
    },
  });

  // ── validate-package ──
  register(pi, "validate-package", {
    description: "Validate a Pi Package directory (package.json structure)",
    handler: async (args: string, ctx: any) => {
      const dirPath = resolvePath(args.trim(), ctx);
      if (!existsSync(dirPath)) { ctx.ui?.notify(`Directory not found: ${dirPath}`, "error"); return; }
      if (!statSync(dirPath).isDirectory()) { ctx.ui?.notify(`Not a directory: ${dirPath}`, "error"); return; }
      const issues = validatePackage(dirPath);
      notifyResults("package", dirPath, issues, "", ctx);
    },
  });

  // ── Resource management commands ──
  registerResourceList(pi);
  registerResourceStatus(pi);
  registerResourceMaintain(pi);
  registerResourcePublish(pi);

  // ── Optimizer command ──
  registerOptimizeSkill(pi);

  // ── Birth certificate ──
  registerBirthCert(pi);
}
