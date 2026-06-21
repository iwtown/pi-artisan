/**
 * pi-artisan 生命周期技能注册表
 *
 * 定义 pi-artisan 编排的外部 skill，在巡检时检测安装状态，
 * 供 routing hints（input hook）和 system prompt（before-start hook）使用。
 *
 * 设计原则：
 *   - pi-artisan 不捆绑这些 skill，只检测并引导 LLM 按需使用
 *   - 新 skill 加一条记录即可自动纳入巡检和路由
 */

import { scanByType } from "../catalog/scanner.js";

// ─────────────────────────────────────────────
//  注册表
// ─────────────────────────────────────────────

export interface LifecycleSkill {
  /** Skill slug（目录名） */
  name: string;
  /** 所属生命周期阶段 */
  stage: "discover" | "create" | "validate" | "adapt" | "vet" | "publish";
  /** 适用的能力包类型 */
  appliesTo: string[];
  /** 已安装时 LLM 的调用提示 */
  invokeHint: string;
}

export const LIFECYCLE_SKILLS: LifecycleSkill[] = [
  {
    name: "find-skills",
    stage: "discover",
    appliesTo: ["skill", "extension", "prompt", "theme", "package"],
    invokeHint: "Use /find-skills to search across stores (npm/GitHub/Gitee/skillhub/clawhub)",
  },
  {
    name: "skill-vetter",
    stage: "vet",
    appliesTo: ["skill", "extension", "prompt", "theme", "package"],
    invokeHint: "Run skill-vetter to security-audit a capability before installing. Use: read its SKILL.md then follow the vetting protocol",
  },
];

// ─────────────────────────────────────────────
//  检查函数
// ─────────────────────────────────────────────

export interface LifecycleSkillStatus {
  name: string;
  stage: string;
  appliesTo: string[];
  installed: boolean;
  hint: string;
}

/**
 * 检查所有生命周期技能的安装状态。
 * 供 before_agent_start 和 input hook 调用。
 */
export function checkLifecycleSkills(): LifecycleSkillStatus[] {
  const installedSkills = new Set(scanByType("skill").map((s) => s.name));

  return LIFECYCLE_SKILLS.map((skill) => ({
    name: skill.name,
    stage: skill.stage,
    appliesTo: skill.appliesTo,
    installed: installedSkills.has(skill.name),
    hint: skill.invokeHint,
  }));
}
