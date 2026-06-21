/**
 * skill_git_deploy — Deploy a skill to Gitee pi-capabilities repository
 *
 * Push a skill from local path to ~/projects/pi-capabilities/skills/<name>/,
 * git add/commit/push, and optionally symlink to runtime.
 *
 * Relies on:
 *   - ~/projects/pi-capabilities/ being a git repo cloned from Gitee
 *   - git CLI (no third-party deps)
 *   - SKILL.md frontmatter `name` field
 */

import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { Type } from "typebox";

const CAPABILITIES_DIR = join(homedir(), "projects", "pi-capabilities");
const SKILLS_DIR = join(CAPABILITIES_DIR, "skills");

export type DeployableType = "skill" | "extension" | "prompt" | "theme" | "package";

export const TYPE_DIR_MAP: Record<DeployableType, string> = {
  skill: "skills",
  extension: "extensions",
  prompt: "prompts",
  theme: "themes",
  package: "packages",
};

interface DeployParams {
  path: string;
  message?: string;
  link?: boolean;
}

interface DeployResult {
  content: { type: "text"; text: string }[];
  details: Record<string, any>;
}

function fail(msg: string): DeployResult {
  return { content: [{ type: "text", text: `❌ ${msg}` }], details: { error: msg } };
}

function ok(msg: string, details: Record<string, any>): DeployResult {
  return { content: [{ type: "text", text: msg }], details };
}

/**
 * Extract `name` from SKILL.md frontmatter.
 */
function extractSkillName(skillDir: string): string | null {
  const mdPath = join(skillDir, "SKILL.md");
  if (!existsSync(mdPath)) return null;
  try {
    const content = readFileSync(mdPath, "utf-8");
    const match = content.match(/^name:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Find the parent directory containing SKILL.md.
 * Accepts: path to SKILL.md, skill directory, or parent directory.
 */
function resolveSkillDir(inputPath: string): string | null {
  let dir = inputPath;
  if (dir.endsWith("SKILL.md")) dir = dir.replace(/\/SKILL\.md$/, "");
  if (!existsSync(dir)) return null;
  if (existsSync(join(dir, "SKILL.md"))) return dir;
  return null;
}

/**
 * Copy directory contents, excluding .git.
 */
function copyContents(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src);
  for (const entry of entries) {
    if (entry === ".git") continue;
    const s = join(src, entry);
    const d = join(dest, entry);
    if (existsSync(d)) rmSync(d, { recursive: true });
    cpSync(s, d, { recursive: true });
  }
}

/**
 * Revert a previous deploy commit in the pi-capabilities repository.
 */
export function revertDeploy(hash: string): DeployResult {
  if (!hash || !/^[a-f0-9]{4,40}$/i.test(hash)) {
    return fail(`Invalid commit hash: "${hash}". Expected a git hash (hex string).`);
  }
  if (!existsSync(join(CAPABILITIES_DIR, ".git"))) {
    return fail(`pi-capabilities repo not found at ${CAPABILITIES_DIR}`);
  }
  try {
    execSync(`git revert --no-edit ${hash}`, { cwd: CAPABILITIES_DIR, stdio: "pipe", timeout: 30000 });
    execSync(`git push`, { cwd: CAPABILITIES_DIR, stdio: "pipe", timeout: 60000 });
    return ok(`✅ 已回滚提交 ${hash} 并推送到 Gitee`, { hash, reverted: true, pushed: true });
  } catch (e: any) {
    return fail(`Revert failed: ${e.message}`);
  }
}

/**
 * Show last 5 deploy commits in the pi-capabilities repository.
 */
export function listDeploys(): DeployResult {
  if (!existsSync(join(CAPABILITIES_DIR, ".git"))) {
    return fail(`pi-capabilities repo not found at ${CAPABILITIES_DIR}`);
  }
  try {
    const log = execSync(`git log --oneline -5`, { cwd: CAPABILITIES_DIR, encoding: "utf-8", stdio: "pipe" }).trim();
    return ok(log || "(no commits)", { log });
  } catch (e: any) {
    return fail(`Git log failed: ${e.message}`);
  }
}

/**
 * Check that the pi-capabilities repo exists and is a git repo.
 */
function checkRepo(): string | null {
  if (!existsSync(CAPABILITIES_DIR)) {
    return `pi-capabilities repo not found at ${CAPABILITIES_DIR}. Clone it first:\n  git clone https://gitee.com/wtown/pi-capabilities.git ${CAPABILITIES_DIR}`;
  }
  if (!existsSync(join(CAPABILITIES_DIR, ".git"))) {
    return `${CAPABILITIES_DIR} is not a git repository`;
  }
  return null;
}

/**
 * Deploy any resource type to pi-capabilities Gitee repo.
 *
 * type: skill | extension | prompt | theme | package
 * sourcePath: path to the resource file or directory
 * options.message: optional custom commit message
 * options.link: symlink to runtime (skill only, ignored for other types)
 */
export function deployToGitee(
  type: DeployableType,
  sourcePath: string,
  options?: { message?: string; link?: boolean }
): DeployResult {
  const repoErr = checkRepo();
  if (repoErr) return fail(repoErr);

  const subDir = TYPE_DIR_MAP[type];
  if (!subDir) return fail(`Unknown resource type: "${type}". Use skill/extension/prompt/theme/package.`);

  // Resolve source path
  let src = sourcePath.replace(/\/+$/, "");
  if (!existsSync(src)) return fail(`Source not found at ${src}`);

  const isDir = statSync(src).isDirectory();
  const basename = src.split("/").pop() || "";

  // Determine target path and name
  let targetPath: string;
  let gitPath: string;
  let resourceName: string;

  if (type === "prompt" || type === "theme") {
    // Single file types: prompts/<name>.md, themes/<name>.json
    if (isDir) return fail(`${type} must be a single file (.${type === "prompt" ? "md" : "json"}), not a directory`);
    targetPath = join(CAPABILITIES_DIR, subDir, basename);
    gitPath = `${subDir}/${basename}`;
    resourceName = basename.replace(/\.(md|json)$/, "");
    mkdirSync(join(CAPABILITIES_DIR, subDir), { recursive: true });
    cpSync(src, targetPath);
  } else if (type === "extension") {
    // Can be single .ts file or a directory
    if (!isDir) {
      targetPath = join(CAPABILITIES_DIR, subDir, basename);
      gitPath = `${subDir}/${basename}`;
      resourceName = basename.replace(/\.ts$/, "");
      mkdirSync(join(CAPABILITIES_DIR, subDir), { recursive: true });
      cpSync(src, targetPath);
    } else {
      resourceName = basename;
      targetPath = join(CAPABILITIES_DIR, subDir, resourceName);
      gitPath = `${subDir}/${resourceName}/`;
      copyContents(src, targetPath);
    }
  } else {
    // Directory types: skill, package
    if (!isDir) return fail(`${type} must be a directory, not a single file`);
    resourceName = basename;
    targetPath = join(CAPABILITIES_DIR, subDir, resourceName);
    gitPath = `${subDir}/${resourceName}/`;
    copyContents(src, targetPath);
  }

  // git add + commit
  const commitMsg = options?.message || `feat: add ${type} ${resourceName}`;
  let committed = false;
  try {
    execSync(`git add ${gitPath}`, { cwd: CAPABILITIES_DIR, stdio: "pipe" });
    execSync(`git commit -m "${commitMsg}"`, { cwd: CAPABILITIES_DIR, stdio: "pipe" });
    committed = true;
  } catch {
    // ponytail: no changes to commit (already up to date)
  }

  // git push
  let pushed = false;
  if (committed) {
    try {
      execSync(`git push`, { cwd: CAPABILITIES_DIR, stdio: "pipe", timeout: 60000 });
      pushed = true;
    } catch (e: any) {
      return fail(`Git push failed: ${e.message}\nTry: cd ~/projects/pi-capabilities && git pull --rebase && git push`);
    }
  }

  // Build result
  const lines: string[] = [`✅ ${resourceName} (${type}) 已部署到 pi-capabilities`];
  lines.push(`  ${subDir}/${type === "prompt" || (type === "extension" && !isDir) || type === "theme" ? basename : resourceName + "/"}`);

  if (committed) {
    const hash = execSync(`git rev-parse --short HEAD`, { cwd: CAPABILITIES_DIR, encoding: "utf-8" }).trim();
    lines.push(`  提交: ${hash}`);
    lines.push(`  消息: ${commitMsg}`);
  } else {
    lines.push(`  无变更 — 内容与仓库一致`);
  }

  if (pushed) lines.push(`  已推送到 Gitee`);

  return ok(lines.join("\n"), {
    resourceName,
    type,
    targetPath,
    committed,
    pushed,
  });
}

/**
 * Deploy a skill to the pi-capabilities repository.
 */
export function deploySkillToGitee(params: DeployParams): DeployResult {
  const { path: inputPath, message, link } = params;

  // 1. Resolve skill directory
  const skillDir = resolveSkillDir(inputPath);
  if (!skillDir) {
    return fail(`SKILL.md not found at ${inputPath}`);
  }

  // 2. Extract skill name
  const skillName = extractSkillName(skillDir);
  if (!skillName) {
    return fail(`Cannot extract 'name' from SKILL.md frontmatter in ${skillDir}`);
  }

  // 3. Check pi-capabilities repo exists
  if (!existsSync(CAPABILITIES_DIR)) {
    return fail(`pi-capabilities repo not found at ${CAPABILITIES_DIR}. Clone it first:\n  git clone https://gitee.com/wtown/pi-capabilities.git ${CAPABILITIES_DIR}`);
  }
  if (!existsSync(join(CAPABILITIES_DIR, ".git"))) {
    return fail(`${CAPABILITIES_DIR} is not a git repository`);
  }

  // 4. Copy skill to pi-capabilities/skills/<name>/
  const targetDir = join(SKILLS_DIR, skillName);
  copyContents(skillDir, targetDir);

  // 5. git add + commit
  const commitMsg = message || `feat: add ${skillName} skill`;
  let committed = false;
  try {
    execSync(`git add skills/${skillName}/`, { cwd: CAPABILITIES_DIR, stdio: "pipe" });
    execSync(`git commit -m "${commitMsg}"`, { cwd: CAPABILITIES_DIR, stdio: "pipe" });
    committed = true;
  } catch {
    // ponytail: no changes to commit (already up to date)
  }

  // 6. git push
  let pushed = false;
  let pushOutput = "";
  if (committed) {
    try {
      pushOutput = execSync(`git push`, { cwd: CAPABILITIES_DIR, stdio: "pipe", encoding: "utf-8", timeout: 60000 }).trim();
      pushed = true;
    } catch (e: any) {
      return fail(`Git push failed: ${e.message}\nTry: cd ~/projects/pi-capabilities && git pull --rebase && git push`);
    }
  }

  // 7. Optionally symlink to runtime via link.sh
  let linked = false;
  if (link) {
    const linkScript = join(CAPABILITIES_DIR, "_tools", "link.sh");
    if (existsSync(linkScript)) {
      try {
        execSync(`bash "${linkScript}" "skills/${skillName}"`, { cwd: CAPABILITIES_DIR, stdio: "pipe" });
        linked = true;
      } catch {
        // link failure is non-fatal
      }
    }
  }

  // 8. Build result
  const lines: string[] = [`✅ ${skillName} 已部署到 pi-capabilities`];
  lines.push(`  技能目录: skills/${skillName}/`);
  lines.push(`  本地路径: ${targetDir}`);

  if (committed) {
    const hash = execSync(`git rev-parse --short HEAD`, { cwd: CAPABILITIES_DIR, encoding: "utf-8" }).trim();
    lines.push(`  提交: ${hash}`);
    lines.push(`  消息: ${commitMsg}`);
  } else {
    lines.push(`  无变更 — skill 内容与仓库一致`);
  }

  if (pushed) lines.push(`  已推送到 Gitee`);
  if (linked) lines.push(`  已链接到运行时 (~/.pi/agent/skills/${skillName})`);

  if (!linked && link) {
    lines.push(`  ⚠ 链接失败，手动运行: cd ~/projects/pi-capabilities && ./_tools/link.sh skills/${skillName}`);
  }

  lines.push(`\n提示: 运行 /reload 激活新 skill`);

  return ok(lines.join("\n"), {
    skillName,
    localPath: targetDir,
    committed,
    pushed,
    linked,
    gitMessage: commitMsg,
    gitOutput: pushOutput,
  });
}

/**
 * Tool definition for pi-artisan registration.
 */
export const skillGitDeployTool = {
  name: "skill_git_deploy",
  label: "Skill Git Deploy",
  description: "Deploy a skill to Gitee pi-capabilities repository. Copies skill to ~/projects/pi-capabilities/skills/<name>/, git add/commit/push. Optionally symlinks to runtime. Requires pi-capabilities git repo.",
  parameters: Type.Object({
    path: Type.String({ description: "Path to skill directory (containing SKILL.md)" }),
    message: Type.Optional(Type.String({ description: "Commit message (auto-generated if omitted)" })),
    link: Type.Optional(Type.Boolean({ description: "Run link.sh after deploy to activate locally (default: false)" })),
  }),
  execute: (_id: string, params: { path: string; message?: string; link?: boolean }) => {
    return Promise.resolve(deploySkillToGitee(params));
  },
};

/**
 * Tool definition for generic resource deploy (all 5 types).
 */
export const resourceGitDeployTool = {
  name: "resource_git_deploy",
  label: "Resource Git Deploy",
  description: "Deploy any resource type (skill/extension/prompt/theme/package) to Gitee pi-capabilities repository. Copies file(s) to the correct subdirectory, git add/commit/push.",
  parameters: Type.Object({
    type: Type.String({ description: "Resource type: skill/extension/prompt/theme/package" }),
    path: Type.String({ description: "Path to resource file or directory" }),
    message: Type.Optional(Type.String({ description: "Custom commit message" })),
  }),
  execute: (_id: string, params: { type: string; path: string; message?: string }) => {
    return Promise.resolve(deployToGitee(params.type as any, params.path, { message: params.message }));
  },
};