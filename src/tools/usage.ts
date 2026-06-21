/**
 * skill_usage — 调用频率追踪（C1）
 *
 * 追踪 skill 的活跃度：记录 toggle 操作、检查 SKILL.md 修改时间、
 * 按需注册表触发词频。非侵入式，不做拦截。
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { scanByType } from "../catalog/scanner.js";
import { loadOnDemandRegistry } from "./toggle.js";

const LOG_PATH = join(homedir(), ".pi", "agent", ".skill-usage.json");

interface UsageLog {
  version: number;
  lastUpdated: string;
  skills: Record<string, {
    lastToggleOn?: string;  // ISO date when turned on
    lastToggleOff?: string; // ISO date when turned off
    upgradeCount?: number;
    toggleCount: number;
  }>;
}

function loadLog(): UsageLog {
  try {
    if (!existsSync(LOG_PATH)) return { version: 1, lastUpdated: new Date().toISOString(), skills: {} };
    return JSON.parse(readFileSync(LOG_PATH, "utf-8"));
  } catch { return { version: 1, lastUpdated: new Date().toISOString(), skills: {} }; }
}

function saveLog(log: UsageLog): void {
  log.lastUpdated = new Date().toISOString();
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2) + "\n", "utf-8");
}

/** Record a toggle event. Called by toggleSkill when changed=true. */
export function recordToggle(name: string, on: boolean): void {
  const log = loadLog();
  const entry = log.skills[name] ??= { toggleCount: 0 };
  entry.toggleCount++;
  if (on) entry.lastToggleOn = new Date().toISOString();
  else entry.lastToggleOff = new Date().toISOString();
  saveLog(log);
}

/** Record an upgrade. Called by upgradeSkill when upgraded=true. */
export function recordUpgrade(name: string): void {
  const log = loadLog();
  const entry = log.skills[name] ??= { toggleCount: 0 };
  entry.upgradeCount = (entry.upgradeCount || 0) + 1;
  saveLog(log);
}

/** Generate usage report: active, stale, unknown per skill. */
export function usageReport(): string {
  const skills = scanByType("skill");
  const registry = loadOnDemandRegistry();
  const log = loadLog();
  const now = Date.now();

  const lines: string[] = [];
  for (const s of skills) {
    const content = readFileSync(s.path, "utf-8");
    const onDemand = /^disable-model-invocation:\s*true/m.test(content);
    const mtime = statSync(s.path).mtimeMs;
    const daysSinceMod = Math.round((now - mtime) / (24 * 60 * 60 * 1000));
    const usage = log.skills[s.name];
    const regTriggers = registry[s.name];
    const triggerInfo = regTriggers ? ` 🔗${regTriggers.length}触发词` : "";
    const toggleInfo = usage ? ` 🔄${usage.toggleCount}次切换` : "";
    const upgradeInfo = usage?.upgradeCount ? ` ⬆${usage.upgradeCount}次升级` : "";

    let status: string;
    if (!onDemand) {
      status = "✅ 常驻";
    } else if (usage && daysSinceMod < 30) {
      status = "💤 按需（近期活跃）";
    } else if (daysSinceMod >= 90) {
      status = `🕸️ 可能过时（${daysSinceMod}d 未改）`;
    } else {
      status = "💤 按需";
    }

    lines.push(`  ${status.padEnd(30)} ${s.name.padEnd(24)} ${daysSinceMod}d${triggerInfo}${toggleInfo}${upgradeInfo}`);
  }

  const active = lines.filter(l => l.includes("✅")).length;
  const ondemandActive = lines.filter(l => l.includes("近期活跃")).length;
  const stale = lines.filter(l => l.includes("可能过时")).length;

  return `📊 Skill 活跃度报告（共 ${lines.length} 个）
${lines.sort().join("\n")}
---
✅ ${active} 常驻  |  💤 ${ondemandActive} 近期活跃  |  🕸️ ${stale} 可能过时`;
}
