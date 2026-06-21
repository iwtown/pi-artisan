/**
 * skill_acquire — 从外部源安装 skills 到 pi-capabilities
 *
 * 当 find-skills 发现技能后，pi-artisan 负责将技能导入本地环境：
 *   1. 从 GitHub/Gitee 克隆
 *   2. 放入 pi-capabilities/skills/<name>/
 *   3. 创建 ~/.pi/agent/skills/<name>/ 符号链接
 *   4. 运行校验 + 适配检查
 */

import { existsSync, mkdirSync, rmSync, symlinkSync, readlinkSync, unlinkSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const HOME = homedir();
const PI_CAPABILITIES = join(HOME, "projects", "pi-capabilities");
const AGENT_SKILLS = join(HOME, ".pi", "agent", "skills");
const VETTER_MD = join(AGENT_SKILLS, "skill-vetter", "SKILL.md");

const GITHUB_MIRRORS = ["ghproxy.net", "ghproxy.com", "gh-proxy.com"];

interface AcquireResult {
  name: string;
  source: string;
  targetDir: string;
  symlinked: boolean;
  validated: boolean;
  adaptPassed: boolean;
  message: string;
  vetted: boolean;
  redFlags: string[];
}

function parseCloneUrl(source: string): string {
  const mirror = GITHUB_MIRRORS[0];
  if (/^[\w.-]+\/[\w.-]+$/.test(source) && !source.includes("://")) {
    return `https://${mirror}/https://github.com/${source}.git`;
  }
  if (source.includes("github.com") && !source.includes("ghproxy")) {
    const repo = source.replace(/https?:\/\/github\.com\//, "").replace(/\.git$/, "");
    return `https://${mirror}/https://github.com/${repo}.git`;
  }
  if (source.includes("gitee.com")) {
    return source.endsWith(".git") ? source : `${source}.git`;
  }
  return source;
}

/** B4: 多镜像 fallback — 主镜像失败自动切备用 */
function cloneWithFallback(url: string, targetDir: string): void {
  let lastErr: Error | null = null;
  const candidates = url.includes("ghproxy")
    ? GITHUB_MIRRORS.map((m) => url.replace(/https:\/\/[^/]+\/https:\/\/github\.com\//, `https://${m}/https://github.com/`))
    : [url];
  for (const tryUrl of candidates) {
    try {
      execSync(`git clone --depth 1 "${tryUrl}" "${targetDir}" 2>&1`, {
        timeout: 60000, stdio: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      return;
    } catch (e: any) {
      lastErr = e;
      if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
    }
  }
  throw lastErr || new Error("所有镜像均失败");
}

/**
 * Acquire a skill from an external source and install to pi-capabilities.
 */
export function acquireSkill(name: string, source: string): AcquireResult {
  const targetDir = join(PI_CAPABILITIES, "skills", name);
  const symlinkTarget = join(AGENT_SKILLS, name);

  if (existsSync(targetDir)) {
    return {
      name, source, targetDir,
      symlinked: existsSync(symlinkTarget),
      validated: false, adaptPassed: false,
      vetted: false, redFlags: [],
      message: `⚠️ 目标目录已存在: ${targetDir}。如需重新导入，先手动移除。`,
    };
  }

  mkdirSync(targetDir, { recursive: true });
  try {
    cloneWithFallback(parseCloneUrl(source), targetDir);
    rmSync(join(targetDir, ".git"), { recursive: true, force: true });

    // A1: skill-vetter 自动门控 — 扫描克隆文件中的安全红牌
    if (existsSync(VETTER_MD)) {
      const { redFlags } = scanRedFlags(targetDir);
      if (redFlags.length > 0) {
        rmSync(targetDir, { recursive: true, force: true });
        return {
          name, source, targetDir, symlinked: false,
          validated: false, adaptPassed: false,
          vetted: false, redFlags,
          message: `❌ 安全审查未通过（${redFlags.length} 项红牌）：\n${redFlags.map(f => `  • ${f}`).join("\n")}`,
        };
      }
    }
  } catch (e: any) {
    rmSync(targetDir, { recursive: true, force: true });
    return { name, source, targetDir, symlinked: false, validated: false, adaptPassed: false, vetted: false, redFlags: [], message: `❌ 克隆失败: ${e.message}` };
  }

  try {
    if (existsSync(symlinkTarget)) {
      if (readlinkSync(symlinkTarget) !== targetDir) unlinkSync(symlinkTarget);
    }
    if (!existsSync(symlinkTarget)) symlinkSync(targetDir, symlinkTarget);
  } catch (e: any) {
    return { name, source, targetDir, symlinked: false, validated: false, adaptPassed: false, vetted: true, redFlags: [], message: `⚠️ 已克隆到 ${targetDir}，但符号链接失败: ${e.message}` };
  }

  return { name, source, targetDir, symlinked: true, validated: false, adaptPassed: false, vetted: true, redFlags: [], message: `✅ 已导入: ${name} → ${targetDir}` };
}

// ── A1: skill-vetter 自动门控 — 静态扫描红牌 ──

const RED_FLAG_PATTERNS: [RegExp, string][] = [
  [/\b(?:curl|wget)\s+https?:\/\/(?:\d{1,3}\.){3}\d{1,3}\b/, "curl/wget 指向 IP 地址（非域名）"],
  [/[~"']\/\.(?:ssh|aws|config|kube)\b/, "访问 ~/.ssh, ~/.aws 等凭据目录"],
  [/\b(?:MEMORY|USER|SOUL|IDENTITY)\.md\b/, "访问 MEMORY.md / USER.md 等隐私文件"],
  [/(?:base64|from\s+base64)\b.*(?:decode|d\s*-)/i, "base64 解码（代码混淆风险）"],
  [/\b(?:eval|exec)\s*\(/, "使用 eval/exec 执行动态代码"],
  [/\bsudo\s+/, "请求 sudo 提权"],
  [/\.bashrc|credential|\.netrc\b/, "访问凭据/认证文件"],
];

function scanRedFlags(dir: string): { redFlags: string[] } {
  const redFlags: string[] = [];

  function walk(path: string) {
    if (!statSync(path).isDirectory()) {
      if (extname(path) === ".md" || extname(path) === ".ts" || extname(path) === ".js" || extname(path) === ".sh" || extname(path) === ".yaml" || extname(path) === ".yml" || extname(path) === ".json") {
        const content = readFileSync(path, "utf-8");
        for (const [re, label] of RED_FLAG_PATTERNS) {
          if (re.test(content)) {
            redFlags.push(`${label}（${relative(dir, path)}）`);
          }
        }
      }
      return;
    }
    for (const entry of readdirSync(path)) {
      if (entry === ".git" || entry === "node_modules") continue;
      walk(join(path, entry));
    }
  }
  walk(dir);
  return { redFlags: [...new Set(redFlags)] };
}