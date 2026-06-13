/**
 * Path resolution & location hint utilities.
 */

import { isAbsolute, resolve, join } from "node:path";
import type { ToolContext } from "../types.js";

const HOME = process.env.HOME || "/home/wtown";

export const GLOBAL_DIRS: Record<string, string> = {
  extensions: join(HOME, ".pi", "agent", "extensions"),
  skills:     join(HOME, ".pi", "agent", "skills"),
  prompts:    join(HOME, ".pi", "agent", "prompts"),
  themes:     join(HOME, ".pi", "agent", "themes"),
};

/**
 * Resolve a path argument that may be relative, absolute, or ~-prefixed.
 */
export function resolvePath(arg: string, ctx: ToolContext): string {
  if (!arg) return "";
  if (isAbsolute(arg)) return arg;
  if (arg.startsWith("~")) return arg.replace("~", HOME);
  const cwd = ctx.cwd || ctx.sessionManager?.cwd || process.cwd();
  return resolve(cwd, arg);
}

/**
 * If file is not in a standard Pi directory, suggest the right global path.
 */
export function locationHint(filePath: string, subdir: string): string {
  if (!subdir || !GLOBAL_DIRS[subdir]) return "";
  const absPath = resolve(filePath);
  if (absPath.startsWith(GLOBAL_DIRS[subdir]) || absPath.includes(`/.pi/${subdir}`)) return "";
  return `💡 放到 ${GLOBAL_DIRS[subdir]}/ 可被 Pi 全局自动发现`;
}

/**
 * Map type label to standard Pi subdirectory name.
 */
export function inferredDir(typeLabel: string): string {
  const map: Record<string, string> = {
    "SKILL.md": "skills",
    extension: "extensions",
    "prompt template": "prompts",
    theme: "themes",
  };
  return map[typeLabel] || "";
}
