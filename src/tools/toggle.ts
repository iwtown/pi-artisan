/**
 * skill_toggle — 开关 skill 的 disable-model-invocation（按需加载）
 *
 * 用户习惯：不常用的 skill 关掉（disable-model-invocation: true），
 * 使用时打开。pi-artisan 帮他们一键切换，免去手动改 YAML frontmatter。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { scanByType } from "../catalog/scanner.js";

const ON_DEMAND_REGISTRY = join(homedir(), ".pi", "agent", "skills", ".on-demand-registry.json");

interface ToggleResult {
  name: string;
  path: string;
  status: "on" | "off";
  changed: boolean;
  message: string;
}

interface RegistryEntry {
  path: string;
  triggers: string[];
}

interface OnDemandRegistry {
  version: number;
  skills: Record<string, RegistryEntry>;
}

/** A3: 读取 .on-demand-registry，返回 {name -> triggers[]} */
export function loadOnDemandRegistry(): Record<string, string[]> {
  try {
    if (!existsSync(ON_DEMAND_REGISTRY)) return {};
    const raw: OnDemandRegistry = JSON.parse(readFileSync(ON_DEMAND_REGISTRY, "utf-8"));
    const result: Record<string, string[]> = {};
    for (const [name, entry] of Object.entries(raw.skills || {})) {
      if (entry.triggers?.length) result[name] = entry.triggers;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Set disable-model-invocation in a skill's SKILL.md frontmatter.
 * @param on true = 关（按需加载），false = 开（常驻可用）
 */
export function toggleSkill(name: string, on: boolean): ToggleResult {
  // Find the skill
  const skills = scanByType("skill");
  const skill = skills.find((s) => s.name === name);
  if (!skill) {
    return { name, path: "", status: "off", changed: false, message: `❌ 未找到 skill: ${name}。运行 /resource-list 查看已安装的 skill。` };
  }

  // scanByType returns SKILL.md path directly
  const skillMd = skill.path;

  if (!skillMd) {
    return { name, path: skill.path, status: "off", changed: false, message: `❌ 未找到 SKILL.md: ${skill.path}` };
  }

  const content = readFileSync(skillMd, "utf-8");
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return { name, path: skillMd, status: "off", changed: false, message: "❌ SKILL.md 没有 YAML frontmatter（缺少 --- 标记）" };
  }

  const frontmatter = frontmatterMatch[1];
  const hasField = /^disable-model-invocation:/m.test(frontmatter);
  const currentlyDisabled = hasField && /^disable-model-invocation:\s*true/m.test(frontmatter);

  if (on === currentlyDisabled) {
    // Already in desired state
    const status = currentlyDisabled ? "off" : "on";
    return { name, path: skillMd, status, changed: false, message: `✅ ${name} 已经是 ${status === "on" ? "常驻" : "按需加载"} 状态` };
  }

  let newContent: string;

  if (on) {
    // Enable on-demand: add disable-model-invocation: true
    if (hasField) {
      // Replace existing value
      newContent = content.replace(
        /^disable-model-invocation:\s*(true|false)/m,
        "disable-model-invocation: true"
      );
    } else {
      // Insert after 'description:' line (good position)
      newContent = content.replace(
        /^(description:.*)$/m,
        `$1\ndisable-model-invocation: true`
      );
    }
  } else {
    // Disable on-demand: remove the field entirely
    newContent = content.replace(/^disable-model-invocation:.*\n?/m, "");
  }

  writeFileSync(skillMd, newContent, "utf-8");
  const status = on ? "off" : "on";
  return {
    name,
    path: skillMd,
    status,
    changed: true,
    message: `${name} 已切换为 ${status === "on" ? "✅ 常驻" : "💤 按需加载"}（可用 /skill:${name} 随时调用）`,
  };
}

/**
 * List all skills with their on-demand status and trigger info.
 */
export function listSkillToggles(): string {
  const skills = scanByType("skill");
  const registry = loadOnDemandRegistry();
  const lines = skills
    .map((s) => {
      const content = readFileSync(s.path, "utf-8");
      const off = /^disable-model-invocation:\s*true/m.test(content);
      const triggers = registry[s.name];
      const extra = triggers ? ` 🔗${triggers.length}触发词` : "";
      return `  ${off ? "💤" : "✅"} ${s.name.padEnd(24)} ${off ? "按需加载" : "常驻"}${extra}`;
    })
    .sort() as string[];

  return `🧰 Skills 加载状态（共 ${lines.length} 个）
${lines.join("\n")}
用 /skill-toggle <name> on|off 切换`;
}
