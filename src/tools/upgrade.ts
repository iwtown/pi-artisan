/**
 * skill_upgrade — 升级已安装 skill 到最新上游版本
 *
 * 从 upstream metadata 读取来源，拉取最新版，备份旧版，校验后切换。
 * 支持 github（经 ghproxy）和 gitee 源。
 */

import { existsSync, mkdirSync, rmSync, renameSync, readdirSync, cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { scanByType } from "../catalog/scanner.js";

const HOME = homedir();
const BACKUP_DIR = join(HOME, ".pi", "agent", ".skill-backups");

interface UpstreamMeta {
  source: string;   // "github:user/repo", "gitee:user/repo", "skillhub", "npm:pkg"
  path: string;     // relative path in the source repo
  version: string;
  license?: string;
}

interface UpgradeResult {
  name: string;
  currentVersion: string;
  latestVersion: string;
  upgraded: boolean;
  message: string;
}

function parseUpstream(skillMd: string): UpstreamMeta | null {
  const content = readFileSync(skillMd, "utf-8");
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const yaml = fm[1];
  const lines = yaml.split("\n");
  let inUpstream = false;
  let upstream: Record<string, string> = {};
  for (const line of lines) {
    if (line.trimEnd() === "upstream:") { inUpstream = true; continue; }
    if (inUpstream) {
      if (!line.startsWith("  ") && !line.startsWith("\t")) { inUpstream = false; continue; }
      const m = line.match(/^\s{2,}(\w+):\s*(.+)/);
      if (m) upstream[m[1]] = m[2].trim();
    }
  }
  if (!upstream.source) return null;
  return { source: upstream.source, path: upstream.path || "", version: upstream.version || "unknown", license: upstream.license };
}

function buildCloneDir(name: string): string {
  return join("/tmp", `pi-upgrade-${name}-${Date.now()}`);
}

function cloneLatest(meta: UpstreamMeta, tmpDir: string): string | null {
  try {
    if (meta.source.startsWith("github:")) {
      const repo = meta.source.replace("github:", "");
      const url = `https://ghproxy.net/https://github.com/${repo}.git`;
      execSync(`git clone --depth 1 "${url}" "${tmpDir}" 2>&1`, {
        timeout: 60000, stdio: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } else if (meta.source.startsWith("gitee:")) {
      const repo = meta.source.replace("gitee:", "");
      const url = `https://gitee.com/${repo}.git`;
      execSync(`git clone --depth 1 "${url}" "${tmpDir}" 2>&1`, {
        timeout: 60000, stdio: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } else {
      return `不支持的源类型: ${meta.source}`; // ponytail: only github/gitee for now
    }

    // Navigate to the skill subpath if specified
    if (meta.path) {
      const subDir = join(tmpDir, meta.path);
      if (!existsSync(subDir)) return `上游路径不存在: ${meta.path}`;
      // Move contents to tmpDir root
      const items = readdirSync(subDir);
      const staging = join(tmpDir, "_stage");
      mkdirSync(staging);
      for (const item of items) {
        renameSync(join(subDir, item), join(staging, item));
      }
      rmSync(tmpDir, { recursive: true, force: true });
      renameSync(staging, tmpDir);
    }

    return null; // success
  } catch (e: any) {
    return `克隆失败: ${e.message}`;
  }
}

/**
 * 升级指定 skill 到最新上游版本。
 * 备份旧版 → 拉取新版 → 校验 → 切 symlink → 报告。
 */
export function upgradeSkill(name: string): UpgradeResult {
  const skills = scanByType("skill");
  const skill = skills.find((s) => s.name === name);
  if (!skill) return { name, currentVersion: "", latestVersion: "", upgraded: false, message: `❌ 未找到 skill: ${name}` };

  const meta = parseUpstream(skill.path);
  if (!meta) return { name, currentVersion: "", latestVersion: "", upgraded: false, message: `❌ ${name} 没有 upstream 元数据，无法升级` };

  const currVer = meta.version;
  const skillDir = skill.path.replace(/\/SKILL\.md$/, "");

  // Clone
  const tmpDir = buildCloneDir(name);
  mkdirSync(tmpDir, { recursive: true });
  const err = cloneLatest(meta, tmpDir);
  if (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    return { name, currentVersion: currVer, latestVersion: "?", upgraded: false, message: `❌ ${err}` };
  }

  // Check new SKILL.md exists
  const newSkillMd = join(tmpDir, "SKILL.md");
  if (!existsSync(newSkillMd)) {
    rmSync(tmpDir, { recursive: true, force: true });
    return { name, currentVersion: currVer, latestVersion: "?", upgraded: false, message: "❌ 新版没有 SKILL.md，放弃" };
  }

  // Read new version
  const newMeta = parseUpstream(newSkillMd);
  const newVer = newMeta?.version || "?";

  if (newVer === currVer && currVer !== "unknown") {
    rmSync(tmpDir, { recursive: true, force: true });
    return { name, currentVersion: currVer, latestVersion: newVer, upgraded: false, message: `✅ ${name} 已是最新版本 (${currVer})` };
  }

  // Backup
  mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = join(BACKUP_DIR, `${name}-${currVer}-${Date.now()}`);
  cpSync(skillDir, backupPath, { recursive: true });

  // Replace: remove old, move new
  rmSync(skillDir, { recursive: true, force: true });
  renameSync(tmpDir, skillDir);

  return {
    name, currentVersion: currVer, latestVersion: newVer, upgraded: true,
    message: `✅ ${name} 已从 ${currVer} 升级到 ${newVer}\n   备份: ${backupPath}\n   运行 /adapt 检查兼容性`,
  };
}

/**
 * List upgrade status for all skills with upstream.
 */
export function listUpgradeStatus(): string {
  const skills = scanByType("skill");
  const lines: string[] = [];
  for (const s of skills) {
    const meta = parseUpstream(s.path);
    if (!meta) continue;
    const ver = meta.version || "?";
    const src = meta.source.split("/").slice(0, 2).join("/");
    lines.push(`  ${s.name.padEnd(24)} ${ver.padEnd(10)} ${src}`);
  }
  if (lines.length === 0) return "没有带 upstream 的 skill";
  return `📦 Skills 上游追踪（共 ${lines.length} 个）：\n${lines.join("\n")}\n用 /skill-upgrade <name> 升级`;
}

/**
 * Upgrade ALL skills with github:/gitee: upstream.
 * Returns a summary of results.
 */
export function upgradeAll(): string {
  const skills = scanByType("skill");
  const results: string[] = [];
  for (const s of skills) {
    const meta = parseUpstream(s.path);
    if (!meta) continue;
    if (!meta.source.startsWith("github:") && !meta.source.startsWith("gitee:")) continue;
    const r = upgradeSkill(s.name);
    results.push(`  ${r.upgraded ? "⬆️" : "—"} ${r.name}: ${r.currentVersion} → ${r.latestVersion}${r.upgraded ? " ✅" : ""}`);
  }
  if (results.length === 0) return "没有可批量升级的 skill（需要 github:/gitee: 上游源）";
  return `📦 批量升级结果\n${results.join("\n")}`;
}

/** B2: 依赖图 — 按上游源分组展示 skill 依赖关系 */
export function dependencyGraph(): string {
  const skills = scanByType("skill");
  const groups: Record<string, string[]> = {};
  for (const s of skills) {
    const meta = parseUpstream(s.path);
    if (!meta) {
      (groups["(无 upstream)"] ??= []).push(s.name);
      continue;
    }
    const key = meta.source.split("/").slice(0, 2).join("/");
    (groups[key] ??= []).push(s.name);
  }
  const lines: string[] = [];
  for (const [source, names] of Object.entries(groups).sort()) {
    lines.push(`  📦 ${source}`);
    for (const n of names.sort()) lines.push(`     └ ${n}`);
  }
  return `🔗 依赖图（${skills.length} skills → ${Object.keys(groups).length} 来源）\n${lines.join("\n")}`;
}
