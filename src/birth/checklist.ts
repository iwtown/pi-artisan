/**
 * Birth certificate checklists — define what "ready to publish" means
 * for each of the 5 resource types.
 *
 * Four levels:
 *   auto     (🟢) — fully automatic check via existing validators/catalog
 *   autoable (🔵) — can be automated (file existence), not yet in validators
 *   manual   (🟡) — requires user to manually run/confirm
 *   missing  (⚪) — needs human to create content
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename as pBasename } from "node:path";
import { execSync } from "node:child_process";
import { parseFrontmatter } from "../utils/yaml.js";
import { checkRadiantDirs } from "../validators/skill.js";
import { evaluateSkill } from "../optimizer/rubric.js";
import { validateThemeColors } from "../validators/theme.js";
import { validatePackage as validatePkg } from "../validators/package.js";

export type ResourceType = "skill" | "extension" | "prompt" | "theme" | "package";
export type CheckLevel = "auto" | "autoable" | "manual" | "missing";

export interface BirthCheckFn {
  (resourcePath: string): { pass: boolean; detail: string };
}

export interface BirthItem {
  id: string;
  label: string;
  level: CheckLevel;
  check: BirthCheckFn;
}

// ── Shared helpers ──

function fileExists(p: string): boolean {
  return existsSync(p);
}

function hasReadme(dir: string): boolean {
  return existsSync(join(dir, "README.md"));
}

function hasLicense(dir: string): boolean {
  return existsSync(join(dir, "LICENSE"));
}

function frontmatterHas(content: string, field: string): boolean {
  const fm = parseFrontmatter(content);
  if (!fm) return false;
  const re = new RegExp(`^${field}:\\s*(.+)$`, "m");
  return re.test(fm);
}

function dirHasNonGitkeepFiles(dir: string): { pass: boolean; detail: string } {
  if (!existsSync(dir)) return { pass: false, detail: "目录不存在" };
  const entries = readdirSync(dir).filter((f) => f !== ".gitkeep" && !f.startsWith("."));
  if (entries.length === 0) return { pass: false, detail: "目录为空（仅 .gitkeep）" };
  return { pass: true, detail: `有 ${entries.length} 个文件` };
}

// ── Skill checklist (20 items) ──

export function skillChecklist(resourcePath: string): BirthItem[] {
  const dir = resourcePath.endsWith("SKILL.md") ? resourcePath.slice(0, -8) : resourcePath;
  const skillMd = join(dir, "SKILL.md");
  const content = fileExists(skillMd) ? readFileSync(skillMd, "utf-8") : "";

  return [
    // 🟢 auto (9)
    {
      id: "skill-frontmatter",
      label: "SKILL.md frontmatter 齐全",
      level: "auto",
      check: () => {
        const fm = parseFrontmatter(content);
        return fm ? { pass: true, detail: "frontmatter 存在" } : { pass: false, detail: "缺少 frontmatter" };
      },
    },
    {
      id: "skill-version",
      label: "version semver 格式",
      level: "auto",
      check: () => {
        const has = frontmatterHas(content, "version");
        if (!has) return { pass: false, detail: "缺少 version 字段" };
        const match = content.match(/^version:\s*(.+)$/m);
        const ver = match ? match[1].trim() : "";
        const semver = /^\d+\.\d+\.\d+$/;
        return semver.test(ver)
          ? { pass: true, detail: `version ${ver}` }
          : { pass: false, detail: `"${ver}" 不是 semver 格式` };
      },
    },
    {
      id: "skill-description",
      label: "description 路由触发格式",
      level: "auto",
      check: () => {
        const has = frontmatterHas(content, "description");
        if (!has) return { pass: false, detail: "缺少 description" };
        const isTrigger = /当用户|用户需要|用户想要|when.*user/i.test(content);
        return isTrigger
          ? { pass: true, detail: "description 含路由触发词" }
          : { pass: false, detail: "description 建议用路由触发格式" };
      },
    },
    {
      id: "skill-gotchas",
      label: "gotchas 有实际条目",
      level: "auto",
      check: () => {
        const section = content.match(/## Gotchas?\n([\s\S]*?)(?=\n## |$)/);
        if (!section) return { pass: false, detail: "缺少 ## Gotchas 节" };
        const entries = section[1].split("\n").filter((l) => /^[-*]\s/.test(l) && !l.includes("<!--"));
        return entries.length > 0
          ? { pass: true, detail: `${entries.length} 条实际条目` }
          : { pass: false, detail: "Gotchas 无实际条目" };
      },
    },
    {
      id: "skill-eval",
      label: "Eval 正例/反例",
      level: "auto",
      check: () => {
        const hasPros = /## 正例|## Pros/i.test(content);
        const hasCons = /## 反例|## Cons/i.test(content);
        if (hasPros && hasCons) return { pass: true, detail: "正例+反例均存在" };
        if (hasPros) return { pass: false, detail: "缺少反例 (## 反例)" };
        if (hasCons) return { pass: false, detail: "缺少正例 (## 正例)" };
        return { pass: false, detail: "缺少 ## Eval 的正例/反例子节" };
      },
    },
    {
      id: "skill-forbidden",
      label: "Forbidden Load 有内容",
      level: "auto",
      check: () => {
        const section = content.match(/## Forbidden Load\n([\s\S]*?)(?=\n##|$)/);
        if (!section) return { pass: false, detail: "缺少 ## Forbidden Load 节" };
        const lines = section[1].split("\n").filter((l) => /^[-*]\s/.test(l) && !l.includes("<!--"));
        return lines.length > 0
          ? { pass: true, detail: `${lines.length} 条条件` }
          : { pass: false, detail: "Forbidden Load 无实际条件" };
      },
    },
    {
      id: "skill-radiant-dirs",
      label: "辐射目录（refs/scripts/assets）",
      level: "auto",
      check: () => {
        const issues = checkRadiantDirs(skillMd);
        return issues.length === 0
          ? { pass: true, detail: "references/ scripts/ assets/ 均存在且有内容" }
          : { pass: false, detail: issues.map((i) => i.message).join("；") };
      },
    },
    {
      id: "skill-rubric",
      label: "Rubric 评分 ≥ 60",
      level: "auto",
      check: () => {
        try {
          const result = evaluateSkill(content, skillMd);
          return result.total >= 60
            ? { pass: true, detail: `Rubric ${result.total}/100` }
            : { pass: false, detail: `Rubric ${result.total}/100，低于 60 门槛` };
        } catch {
          return { pass: false, detail: "Rubric 评分执行失败" };
        }
      },
    },
    {
      id: "skill-tested-models",
      label: "tested-models 有记录",
      level: "auto",
      check: () => {
        const has = frontmatterHas(content, "tested-models");
        return has
          ? { pass: true, detail: "tested-models 存在" }
          : { pass: false, detail: "建议记录 tested-models" };
      },
    },
    // 🔵 autoable (1)
    {
      id: "skill-readme",
      label: "README 存在",
      level: "autoable",
      check: () => {
        const exists = hasReadme(dir);
        return exists ? { pass: true, detail: "README.md 存在" } : { pass: false, detail: "缺少 README.md" };
      },
    },
    // 🟡 manual (3)
    {
      id: "skill-manual-test",
      label: "实测验证",
      level: "manual",
      check: () => ({
        pass: false,
        detail: "设计 2-3 个测试 prompt 跑典型场景，验证输出质量",
      }),
    },
    {
      id: "skill-install-test",
      label: "安装测试",
      level: "autoable",
      check: () => {
        // Extract slug from SKILL.md
        const skPath = join(dir, "SKILL.md");
        if (!existsSync(skPath)) return { pass: false, detail: "SKILL.md 不存在" };
        const content = readFileSync(skPath, "utf-8");
        const slugMatch = content.match(/^slug:\s*(\S+)$/m);
        const slug = slugMatch ? slugMatch[1].trim() : null;
        if (!slug) return { pass: false, detail: "SKILL.md 中未设置 slug 字段" };

        // Try dry-run install
        try {
          execSync(`skillhub install "${slug}" --dry-run 2>/dev/null`, {
            timeout: 10000,
            encoding: "utf-8",
          });
          return { pass: true, detail: `skillhub install ${slug} 验证通过` };
        } catch {
          return { pass: false, detail: `skillhub install ${slug} 安装验证失败（确认 slug 正确、skillhub CLI 已安装）` };
        }
      },
    },
    {
      id: "skill-demo",
      label: "demo 截图/GIF",
      level: "manual",
      check: () => {
        const assets = join(dir, "assets");
        if (!existsSync(assets)) return { pass: false, detail: "assets/ 目录不存在" };
        const media = readdirSync(assets).filter((f) => /\.(gif|png|jpg|mp4|webm)$/i.test(f));
        return media.length > 0
          ? { pass: true, detail: `${media.length} 个媒体文件` }
          : { pass: false, detail: "assets/ 下无截图或 GIF" };
      },
    },
    // ⚪ missing (7)
    {
      id: "skill-license",
      label: "LICENSE 文件",
      level: "missing",
      check: () => (hasLicense(dir) ? { pass: true, detail: "LICENSE 存在" } : { pass: false, detail: "建议添加 MIT LICENSE" }),
    },
    {
      id: "skill-safety",
      label: "安全边界节",
      level: "missing",
      check: () => {
        const has = /## 安全|## Safety|安全边界|不会做/i.test(content);
        return has ? { pass: true, detail: "已有安全边界描述" } : { pass: false, detail: "建议添加安全边界节（什么情况下会停手问用户）" };
      },
    },
    {
      id: "skill-credits",
      label: "致谢节",
      level: "missing",
      check: () => {
        const has = /## 致谢|## Credits|## 参考|## References|方法论/i.test(content);
        return has ? { pass: true, detail: "已有致谢/参考" } : { pass: false, detail: "建议添加方法论文献致谢" };
      },
    },
    {
      id: "skill-zero-api",
      label: "零 API 底线声明",
      level: "missing",
      check: () => {
        const has = /API.?[Kk]ey|零.?API|需配置|前置条件/i.test(content);
        return has ? { pass: true, detail: "已有 API/前置条件说明" } : { pass: false, detail: "建议声明 API Key 需求和前置条件" };
      },
    },
    {
      id: "skill-badge",
      label: "skills.sh 徽章",
      level: "missing",
      check: () => {
        const readmePath = join(dir, "README.md");
        if (!existsSync(readmePath)) return { pass: false, detail: "README 不存在，无法检查徽章" };
        const readmeContent = readFileSync(readmePath, "utf-8");
        return /skills\.sh/.test(readmeContent)
          ? { pass: true, detail: "skills.sh 徽章存在" }
          : { pass: false, detail: "README 中建议添加 skills.sh 徽章" };
      },
    },
    {
      id: "skill-marketplace",
      label: "marketplace.json",
      level: "missing",
      check: () => {
        const mp = join(dir, ".claude-plugin", "marketplace.json");
        return fileExists(mp)
          ? { pass: true, detail: "marketplace.json 存在" }
          : { pass: false, detail: "建议添加 .claude-plugin/marketplace.json" };
      },
    },
    {
      id: "skill-examples",
      label: "真实示例目录",
      level: "missing",
      check: () => {
        const examples = join(dir, "examples");
        return existsSync(examples)
          ? dirHasNonGitkeepFiles(examples)
          : { pass: false, detail: "建议创建 examples/ 目录放真实运行案例" };
      },
    },
    {
      id: "skill-observation",
      label: "回炉观察记录",
      level: "manual",
      check: () => {
        const skPath = join(dir, "SKILL.md");
        if (!existsSync(skPath)) return { pass: false, detail: "SKILL.md 不存在" };
        const content = readFileSync(skPath, "utf-8");
        const slugMatch = content.match(/^slug:\s*(\S+)$/m);
        const slug = slugMatch ? slugMatch[1].trim() : pBasename(dir);
        const obsPath = join(process.env.HOME || "/home/wtown", ".pi", "agent", "pi-artisan-observations.json");
        if (!existsSync(obsPath)) return { pass: false, detail: "尚未记录发布信息 — 发布后自动生成回炉观察清单" };
        try {
          const raw = readFileSync(obsPath, "utf-8");
          const data = JSON.parse(raw);
          const entry = data.entries?.find((e: any) => e.slug === slug);
          if (!entry) return { pass: false, detail: `"${slug}" 尚未发布 — 发布后自动记录回炉观察` };
          return { pass: true, detail: `上次发布: v${entry.publishedVersion} (${entry.publishedAt.slice(0, 10)})` };
        } catch {
          return { pass: false, detail: "无法读取观察记录文件" };
        }
      },
    },
  ];
}

// ── Extension checklist (9 items) ──

export function extensionChecklist(resourcePath: string): BirthItem[] {
  const content = fileExists(resourcePath) ? readFileSync(resourcePath, "utf-8") : "";
  const dir = resourcePath.replace(/\/[^/]+$/, "");

  return [
    {
      id: "ext-export",
      label: "export default function",
      level: "auto",
      check: () => {
        const ok = /export\s+default\s+(async\s+)?function/.test(content);
        return ok ? { pass: true, detail: "export default function 存在" } : { pass: false, detail: "缺少 export default function" };
      },
    },
    {
      id: "ext-sdk-import",
      label: "SDK import",
      level: "auto",
      check: () => {
        const ok = /@earendil-works\/pi-coding-agent/.test(content);
        return ok ? { pass: true, detail: "SDK import 存在" } : { pass: false, detail: "缺少 @earendil-works/pi-coding-agent" };
      },
    },
    {
      id: "ext-snake-case",
      label: "tool name snake_case",
      level: "auto",
      check: () => {
        const names = content.match(/name:\s*['"]([^'"]+)['"]/g) || [];
        const bad = names.filter((n) => /[A-Z-]/.test(n) && !n.includes("/"));
        return bad.length === 0
          ? { pass: true, detail: "工具名符合 snake_case" }
          : { pass: false, detail: `工具名含大写/连字符: ${bad.join(", ")}` };
      },
    },
    {
      id: "ext-no-js-import",
      label: "无 .js import",
      level: "auto",
      check: () => {
        const jsImports = content.match(/from\s+['"]\.[/.]+?\.js['"]/g);
        return !jsImports || jsImports.length === 0
          ? { pass: true, detail: "无 .js 后缀 import" }
          : { pass: false, detail: `存在 .js import: ${jsImports.join(", ")}` };
      },
    },
    {
      id: "ext-readme",
      label: "README 存在",
      level: "autoable",
      check: () => {
        const ok = hasReadme(dir) || hasReadme(resourcePath.replace(/\.ts$/, ""));
        return ok ? { pass: true, detail: "README 存在" } : { pass: false, detail: "缺少 README" };
      },
    },
    {
      id: "ext-install-doc",
      label: "安装说明可读",
      level: "manual",
      check: () => ({ pass: false, detail: "检查 README 中安装步骤是否清晰可执行" }),
    },
    {
      id: "ext-license",
      label: "LICENSE",
      level: "missing",
      check: () => (hasLicense(dir) ? { pass: true, detail: "LICENSE 存在" } : { pass: false, detail: "建议添加 LICENSE" }),
    },
    {
      id: "ext-examples",
      label: "使用示例",
      level: "missing",
      check: () => ({ pass: false, detail: "建议添加使用示例代码片段" }),
    },
    {
      id: "ext-version",
      label: "版本号",
      level: "missing",
      check: () => ({ pass: false, detail: "建议在文件头注释或 package.json 中声明版本号" }),
    },
  ];
}

// ── Prompt checklist (7 items) ──

export function promptChecklist(resourcePath: string): BirthItem[] {
  const content = fileExists(resourcePath) ? readFileSync(resourcePath, "utf-8") : "";
  const fileName = pBasename(resourcePath);

  return [
    {
      id: "prompt-frontmatter",
      label: "frontmatter 存在",
      level: "auto",
      check: () => {
        const fm = parseFrontmatter(content);
        return fm ? { pass: true, detail: "frontmatter 存在" } : { pass: true, detail: "（可选：prompt 无 frontmatter 也可用）" };
      },
    },
    {
      id: "prompt-desc-length",
      label: "description ≤ 200",
      level: "auto",
      check: () => {
        const fm = parseFrontmatter(content);
        if (!fm) return { pass: true, detail: "无 frontmatter，跳过" };
        const match = fm.match(/^description:\s*(.+)$/m);
        if (!match) return { pass: true, detail: "无 description（可选）" };
        return match[1].trim().length <= 200
          ? { pass: true, detail: `${match[1].trim().length} 字符 ≤ 200` }
          : { pass: false, detail: `${match[1].trim().length} 字符 > 200` };
      },
    },
    {
      id: "prompt-arg-hint",
      label: "argument-hint 格式正确",
      level: "auto",
      check: () => {
        const fm = parseFrontmatter(content);
        if (!fm) return { pass: true, detail: "无 frontmatter，跳过" };
        const match = fm.match(/^argument-hint:\s*(.+)$/m);
        if (!match) return { pass: true, detail: "无 argument-hint（可选）" };
        const hint = match[1].trim();
        const ok = /^<[^>]+>$/.test(hint) || /^\[[^\]]+\]$/.test(hint);
        return ok ? { pass: true, detail: `argument-hint: ${hint}` } : { pass: false, detail: `argument-hint 格式建议 <required> 或 [optional]` };
      },
    },
    {
      id: "prompt-filename",
      label: "文件名合规",
      level: "auto",
      check: () => {
        const name = pBasename(fileName, ".md");
        const ok = /^[a-zA-Z0-9_-]+$/.test(name);
        return ok ? { pass: true, detail: `文件名 "${name}" 合规` } : { pass: false, detail: `文件名含非法字符（仅允许字母/数字/连字符/下划线）` };
      },
    },
    {
      id: "prompt-example",
      label: "使用示例",
      level: "manual",
      check: () => ({ pass: false, detail: "确认 prompt 的输入输出格式在 README 或有注释说明" }),
    },
    {
      id: "prompt-tags",
      label: "tags 分类",
      level: "missing",
      check: () => {
        const has = frontmatterHas(content, "tags");
        return has ? { pass: true, detail: "tags 存在" } : { pass: false, detail: "建议添加 tags 分类" };
      },
    },
    {
      id: "prompt-version",
      label: "版本号",
      level: "missing",
      check: () => {
        const has = frontmatterHas(content, "version");
        return has ? { pass: true, detail: "version 存在" } : { pass: false, detail: "建议添加 version 字段" };
      },
    },
  ];
}

// ── Theme checklist (6 items) ──

export function themeChecklist(resourcePath: string): BirthItem[] {
  const content = fileExists(resourcePath) ? readFileSync(resourcePath, "utf-8") : "";
  const dir = resourcePath.replace(/\/[^/]+$/, "");
  const fileName = pBasename(resourcePath);

  return [
    {
      id: "theme-filename",
      label: "文件名 kebab-case",
      level: "auto",
      check: () => {
        const name = pBasename(fileName, ".json");
        const ok = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
        return ok ? { pass: true, detail: `"${name}" 符合 kebab-case` } : { pass: false, detail: `"${name}" 不是 kebab-case` };
      },
    },
    {
      id: "theme-json-valid",
      label: "JSON 有效",
      level: "auto",
      check: () => {
        try { JSON.parse(content); return { pass: true, detail: "JSON 有效" }; }
        catch (e: any) { return { pass: false, detail: `JSON 解析失败: ${e.message}` }; }
      },
    },
    {
      id: "theme-tokens",
      label: "51 tokens 完整",
      level: "auto",
      check: () => {
        const issues = validateThemeColors(content);
        const tokenIssues = issues.filter((i) => i.message.includes("Missing"));
        return tokenIssues.length === 0
          ? { pass: true, detail: "51 tokens 齐全" }
          : { pass: false, detail: tokenIssues.map((i) => i.message).join("；") };
      },
    },
    {
      id: "theme-colors",
      label: "颜色值有效",
      level: "auto",
      check: () => {
        const issues = validateThemeColors(content);
        const valueIssues = issues.filter((i) => !i.message.includes("Missing"));
        return valueIssues.length === 0
          ? { pass: true, detail: "颜色值均有效" }
          : { pass: false, detail: valueIssues.map((i) => i.message).join("；") };
      },
    },
    {
      id: "theme-preview",
      label: "预览截图",
      level: "manual",
      check: () => ({ pass: false, detail: "建议提供主题预览截图" }),
    },
    {
      id: "theme-readme",
      label: "README 说明",
      level: "missing",
      check: () => {
        const ok = hasReadme(dir) || hasReadme(resourcePath.replace(/\.json$/, ""));
        return ok ? { pass: true, detail: "README 存在" } : { pass: false, detail: "建议添加 README 说明配色灵感与应用场景" };
      },
    },
  ];
}

// ── Package checklist (8 items) ──

export function packageChecklist(resourcePath: string): BirthItem[] {
  const dir = resourcePath;
  const pkgPath = join(dir, "package.json");
  const pkg = fileExists(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf-8")) : null;

  return [
    {
      id: "pkg-json-exists",
      label: "package.json 存在",
      level: "auto",
      check: () => (pkg ? { pass: true, detail: "package.json 存在" } : { pass: false, detail: "缺少 package.json" }),
    },
    {
      id: "pkg-json-valid",
      label: "JSON 有效",
      level: "auto",
      check: () => {
        if (!pkg) return { pass: false, detail: "package.json 不存在" };
        try { JSON.parse(readFileSync(pkgPath, "utf-8")); return { pass: true, detail: "JSON 有效" }; }
        catch (e: any) { return { pass: false, detail: `JSON 解析失败: ${e.message}` }; }
      },
    },
    {
      id: "pkg-description",
      label: "description ≤ 80",
      level: "auto",
      check: () => {
        if (!pkg) return { pass: false, detail: "package.json 不存在" };
        const desc = pkg.description || "";
        return desc.length <= 80
          ? { pass: true, detail: `${desc.length} 字符` }
          : { pass: false, detail: `${desc.length} 字符 > 80` };
      },
    },
    {
      id: "pkg-keywords",
      label: "pi-package keywords",
      level: "auto",
      check: () => {
        if (!pkg) return { pass: false, detail: "package.json 不存在" };
        const keywords: string[] = pkg.keywords || [];
        return keywords.includes("pi-package")
          ? { pass: true, detail: '"pi-package" 在 keywords 中' }
          : { pass: false, detail: '建议添加 "pi-package" 到 keywords' };
      },
    },
    {
      id: "pkg-pi-manifest",
      label: "pi manifest 路径可解析",
      level: "auto",
      check: () => {
        if (!pkg) return { pass: false, detail: "package.json 不存在" };
        const issues = validatePkg(dir);
        const manifestIssues = issues.filter((i) => i.message.includes("pi.") || i.message.includes("path"));
        return manifestIssues.length === 0
          ? { pass: true, detail: "pi manifest 路径全部有效" }
          : { pass: false, detail: manifestIssues.map((i) => i.message).join("；") };
      },
    },
    {
      id: "pkg-install-test",
      label: "安装测试（pi install）",
      level: "manual",
      check: () => ({ pass: false, detail: "运行 pi install <name> 验证可安装" }),
    },
    {
      id: "pkg-readme",
      label: "README",
      level: "missing",
      check: () => (hasReadme(dir) ? { pass: true, detail: "README 存在" } : { pass: false, detail: "建议添加 README" }),
    },
    {
      id: "pkg-license",
      label: "LICENSE",
      level: "missing",
      check: () => (hasLicense(dir) ? { pass: true, detail: "LICENSE 存在" } : { pass: false, detail: "建议添加 LICENSE" }),
    },
  ];
}

// ── Dispatch ──

const CHECKLISTS: Record<ResourceType, (path: string) => BirthItem[]> = {
  skill: skillChecklist,
  extension: extensionChecklist,
  prompt: promptChecklist,
  theme: themeChecklist,
  package: packageChecklist,
};

export function getChecklist(type: ResourceType, resourcePath: string): BirthItem[] {
  return CHECKLISTS[type](resourcePath);
}
