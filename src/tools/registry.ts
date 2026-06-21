/**
 * C4: on-demand registry management — add/remove trigger entries
 *
 * Reads/writes ~/.pi/agent/skills/.on-demand-registry.json
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const REGISTRY_PATH = join(homedir(), ".pi", "agent", "skills", ".on-demand-registry.json");

interface RegistryEntry {
  path: string;
  triggers: string[];
}

interface OnDemandRegistry {
  version: number;
  skills: Record<string, RegistryEntry>;
}

function load(): OnDemandRegistry {
  try {
    if (!existsSync(REGISTRY_PATH)) return { version: 1, skills: {} };
    return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  } catch {
    return { version: 1, skills: {} };
  }
}

function save(reg: OnDemandRegistry): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2) + "\n", "utf-8");
}

/** Add or update a skill's trigger entries in the on-demand registry. */
export function addRegistryTrigger(name: string, triggers: string[]): string {
  const reg = load();
  const entry = reg.skills[name] || { path: "", triggers: [] };
  const before = entry.triggers.length;
  for (const t of triggers) {
    if (!entry.triggers.includes(t)) entry.triggers.push(t);
  }
  entry.path ||= join(homedir(), ".pi", "agent", "skills", name, "SKILL.md");
  reg.skills[name] = entry;
  save(reg);
  const added = entry.triggers.length - before;
  return `✅ ${name} 添加了 ${added} 个触发词（共 ${entry.triggers.length} 个）`;
}

/** Remove specific triggers from a skill. */
export function removeRegistryTrigger(name: string, triggers?: string[]): string {
  const reg = load();
  if (!reg.skills[name]) return `❌ ${name} 不在注册表中`;
  if (!triggers || triggers.length === 0) {
    delete reg.skills[name];
    save(reg);
    return `✅ 已移除 ${name} 的注册表条目`;
  }
  const entry = reg.skills[name];
  const before = entry.triggers.length;
  entry.triggers = entry.triggers.filter((t) => !triggers!.includes(t));
  if (entry.triggers.length === 0) delete reg.skills[name];
  else reg.skills[name] = entry;
  save(reg);
  const removed = before - entry.triggers.length;
  return `✅ ${name} 移除了 ${removed} 个触发词`;
}

/** Show registry contents. */
export function showRegistry(): string {
  const reg = load();
  const entries = Object.entries(reg.skills);
  if (entries.length === 0) return "📋 按需注册表为空";
  const lines = entries.map(([name, entry]) =>
    `  ${name.padEnd(24)} ${entry.triggers.length}触发词: ${entry.triggers.slice(0, 5).join(", ")}${entry.triggers.length > 5 ? "..." : ""}`
  );
  return `📋 按需注册表（共 ${entries.length} 条）\n${lines.join("\n")}`;
}
