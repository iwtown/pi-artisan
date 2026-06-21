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
import { registerAdaptCommand } from "./adapt.js";
import { registerResourceRetire } from "./resource-retire.js";
import { setupCreateSkillCommand } from "./create-skill.js";
import { setupCreateExtensionCommand } from "./create-extension.js";
import { setupCreatePromptCommand } from "./create-prompt.js";
import { setupCreateThemeCommand } from "./create-theme.js";
import { setupCreatePackageCommand } from "./create-package.js";
import { toggleSkill, listSkillToggles } from "../tools/toggle.js";
import { upgradeSkill, listUpgradeStatus, upgradeAll, dependencyGraph } from "../tools/upgrade.js";
import { addRegistryTrigger, removeRegistryTrigger, showRegistry } from "../tools/registry.js";
import { listRollbacks, rollbackSkill } from "../tools/rollback.js";
import { usageReport } from "../tools/usage.js";

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

  // ── Retirement ──
  registerResourceRetire(pi);

  // ── Adaptation check ──
  registerAdaptCommand(pi);

  // ── Create commands ──
  setupCreateSkillCommand(pi);
  setupCreateExtensionCommand(pi);
  setupCreatePromptCommand(pi);
  setupCreateThemeCommand(pi);
  setupCreatePackageCommand(pi);

  // ── skill-toggle ──
  register(pi, "skill-toggle", {
    description: "Toggle a skill's on-demand state: on = 💤 按需加载, off = ✅ 常驻",
    handler: async (args: string, ctx: any) => {
      const [name, state] = args.trim().split(/\s+/);
      if (!name || !state || !["on", "off"].includes(state)) {
        ctx.ui?.notify("用法: /skill-toggle <name> on|off", "error");
        return;
      }
      const result = toggleSkill(name, state === "on");
      ctx.ui?.notify(result.message, result.changed ? "info" : "warning");
    },
  });

  // ── skill-list-toggles ──
  register(pi, "skill-list-toggles", {
    description: "Show all skills with their on-demand state",
    handler: async (_args: string, ctx: any) => {
      ctx.ui?.notify(listSkillToggles(), "info");
    },
  });

  // ── skill-upgrade ──
  register(pi, "skill-upgrade", {
    description: "Upgrade a skill to latest upstream version (backup + replace)",
    handler: async (args: string, ctx: any) => {
      const name = args.trim();
      if (!name) { ctx.ui?.notify("用法: /skill-upgrade <name>", "error"); return; }
      const result = upgradeSkill(name);
      ctx.ui?.notify(result.message, result.upgraded ? "info" : "error");
    },
  });

  // ── skill-upgrade-list ──
  register(pi, "skill-upgrade-list", {
    description: "Show upgrade status for all skills with upstream tracking",
    handler: async (_args: string, ctx: any) => {
      ctx.ui?.notify(listUpgradeStatus(), "info");
    },
  });

  // ── skill-upgrade-all ──
  register(pi, "skill-upgrade-all", {
    description: "Upgrade all skills with github:/gitee: upstream to latest",
    handler: async (_args: string, ctx: any) => {
      ctx.ui?.notify(upgradeAll(), "info");
    },
  });

  // ── skill-dependency-graph ──
  register(pi, "skill-dependency-graph", {
    description: "Show dependency graph: skills grouped by upstream source",
    handler: async (_args: string, ctx: any) => {
      ctx.ui?.notify(dependencyGraph(), "info");
    },
  });

  // ── C4: registry commands ──
  register(pi, "skill-registry-show", {
    description: "Show on-demand registry contents",
    handler: async (_args: string, ctx: any) => {
      ctx.ui?.notify(showRegistry(), "info");
    },
  });
  register(pi, "skill-registry-add", {
    description: "Add trigger keywords to on-demand registry. Usage: /skill-registry-add <name> <trigger1> [trigger2...]",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) { ctx.ui?.notify("用法: /skill-registry-add <name> <触发词>...", "error"); return; }
      const [name, ...triggers] = parts;
      ctx.ui?.notify(addRegistryTrigger(name, triggers), "info");
    },
  });
  register(pi, "skill-registry-remove", {
    description: "Remove trigger keywords (or whole entry). Usage: /skill-registry-remove <name> [trigger1...]",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 1) { ctx.ui?.notify("用法: /skill-registry-remove <name> [触发词...]", "error"); return; }
      const [name, ...triggers] = parts;
      ctx.ui?.notify(removeRegistryTrigger(name, triggers.length ? triggers : undefined), "info");
    },
  });

  // ── C2: rollback commands ──
  register(pi, "skill-rollback", {
    description: "Rollback a skill to a previous backup. Usage: /skill-rollback <name> [index]",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/);
      const name = parts[0], idx = parseInt(parts[1]) || 0;
      if (!name) { ctx.ui?.notify("用法: /skill-rollback <name> [index]", "error"); return; }
      const r = rollbackSkill(name, idx);
      ctx.ui?.notify(r.message, r.success ? "info" : "error");
    },
  });
  register(pi, "skill-rollback-list", {
    description: "List available backups. Usage: /skill-rollback-list [name]",
    handler: async (args: string, ctx: any) => {
      ctx.ui?.notify(listRollbacks(args.trim() || undefined), "info");
    },
  });

  // ── C1: usage report ──
  register(pi, "skill-usage-report", {
    description: "Show skill usage report: activity, staleness, and toggle history",
    handler: async (_args: string, ctx: any) => {
      ctx.ui?.notify(usageReport(), "info");
    },
  });
}
