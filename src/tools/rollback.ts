/**
 * skill_rollback — 从备份目录恢复 skill 到指定版本
 *
 * upgradeSkill() 会在升级前自动创建备份到 ~/.pi/agent/.skill-backups/。
 * 本工具列出可用备份并恢复指定版本。
 */

import { existsSync, readdirSync, rmSync, cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BACKUP_DIR = join(homedir(), ".pi", "agent", ".skill-backups");
const AGENT_SKILLS = join(homedir(), ".pi", "agent", "skills");

interface BackupEntry {
  name: string;
  version: string;
  timestamp: number;
  path: string;
}

interface RollbackResult {
  name: string;
  version: string;
  timestamp: number;
  success: boolean;
  message: string;
}

function listBackups(): BackupEntry[] {
  if (!existsSync(BACKUP_DIR)) return [];
  const entries: BackupEntry[] = [];
  for (const dir of readdirSync(BACKUP_DIR)) {
    const fullPath = join(BACKUP_DIR, dir);
    // dir format: <name>-<version>-<timestamp>
    const m = dir.match(/^(.+)-(.+)-(\d+)$/);
    if (!m || !existsSync(join(fullPath, "SKILL.md"))) continue;
    entries.push({ name: m[1], version: m[2], timestamp: parseInt(m[3]), path: fullPath });
  }
  return entries.sort((a, b) => b.timestamp - a.timestamp); // newest first
}

function parseVersion(fullPath: string): string {
  try {
    const md = readFileSync(join(fullPath, "SKILL.md"), "utf-8");
    const fm = md.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) return "?";
    const upM = fm[1].match(/^\s*version:\s*(.+)/m);
    return upM ? upM[1].trim() : "?";
  } catch { return "?"; }
}

/** List available backups for a specific skill, or all skills. */
export function listRollbacks(name?: string): string {
  const backups = listBackups().filter((b) => !name || b.name === name);
  if (backups.length === 0) return name
    ? `📦 ${name} 没有可用备份`
    : "📦 没有可用备份";

  const grouped: Record<string, BackupEntry[]> = {};
  for (const b of backups) (grouped[b.name] ??= []).push(b);

  const lines: string[] = [];
  for (const [skill, entries] of Object.entries(grouped)) {
    lines.push(`  📦 ${skill}:`);
    for (const e of entries) {
      const ver = parseVersion(e.path);
      const date = new Date(e.timestamp).toLocaleString("zh-CN");
      lines.push(`     └ v${ver}  (${date})`);
    }
  }
  return `📦 备份列表（${backups.length} 条）\n${lines.join("\n")}`;
}

/** Rollback a skill to the latest backup (or nth newest). */
export function rollbackSkill(name: string, index: number = 0): RollbackResult {
  const backups = listBackups().filter((b) => b.name === name);
  if (backups.length === 0) {
    return { name, version: "", timestamp: 0, success: false, message: `❌ ${name} 没有可用备份` };
  }
  if (index >= backups.length) {
    return { name, version: backups[0].version, timestamp: backups[0].timestamp, success: false, message: `❌ 只有 ${backups.length} 个备份，索引 ${index} 越界` };
  }

  const backup = backups[index];
  const targetDir = join(AGENT_SKILLS, name);

  if (!existsSync(targetDir)) {
    // Skill was deleted — restore from backup
    cpSync(backup.path, targetDir, { recursive: true });
    return { name, version: backup.version, timestamp: backup.timestamp, success: true, message: `✅ ${name} 已从备份 v${backup.version} 恢复` };
  }

  // Backup current state first, then replace
  const currentBackup = join(BACKUP_DIR, `${name}-pre-rollback-${Date.now()}`);
  cpSync(targetDir, currentBackup, { recursive: true });

  rmSync(targetDir, { recursive: true, force: true });
  cpSync(backup.path, targetDir, { recursive: true });

  return {
    name, version: backup.version, timestamp: backup.timestamp, success: true,
    message: `✅ ${name} 已回滚到 v${backup.version}（${new Date(backup.timestamp).toLocaleString("zh-CN")} 的备份）\n   当前版本已备份到: ${currentBackup}`,
  };
}
