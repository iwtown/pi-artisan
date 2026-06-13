/**
 * 8-dimension Rubric scoring for SKILL.md quality evaluation.
 *
 * Inspired by darwin-skill's autonomous SKILL.md optimizer.
 * Dimensions 1-7 are static analysis (pure code). Dimension 8 is
 * test_required (needs actual test prompt execution).
 */

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, extractFieldValue } from "../utils/yaml.js";

// ── Types ──

export interface RubricDimension {
  id: number;
  label: string;
  weight: number;
  score: number;       // 1-10
  reason: string;
  testRequired: boolean;
  evidence?: string[];      // ← 可选：每个分支的具体证据
  improvement?: string;     // ← 可选：可复制的改进方案
}

export interface RubricResult {
  filePath: string;
  dimensions: RubricDimension[];
  total: number;        // 0-100 weighted
  summary: string;
}

const DIMENSIONS: { id: number; label: string; weight: number; testRequired: boolean }[] = [
  { id: 1, label: "Frontmatter质量",   weight: 8,  testRequired: false },
  { id: 2, label: "工作流清晰度",      weight: 15, testRequired: false },
  { id: 3, label: "边界条件覆盖",      weight: 10, testRequired: false },
  { id: 4, label: "检查点设计",        weight: 7,  testRequired: false },
  { id: 5, label: "指令具体性",        weight: 15, testRequired: false },
  { id: 6, label: "资源整合度",        weight: 5,  testRequired: false },
  { id: 7, label: "整体架构",          weight: 15, testRequired: false },
  { id: 8, label: "实测表现",          weight: 25, testRequired: true },
];

function score1to10(value: number, min: number, max: number): number {
  if (value >= max) return 10;
  if (value <= min) return 1;
  return 1 + Math.round(((value - min) / (max - min)) * 9);
}

function clampScore(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

// ── Dimension scoring functions ──

function d1FrontmatterQuality(content: string): { score: number; reason: string; evidence: string[]; improvement: string } {
  const fm = parseFrontmatter(content);
  if (!fm) {
    return { score: 1, reason: "缺少 YAML frontmatter", evidence: ["YAML frontmatter: 缺失"], improvement: "在文件顶部添加 YAML frontmatter，包含 name、version、description 字段" };
  }

  let points = 0;
  const details: string[] = [];
  const evidence: string[] = [];

  // name exists + kebab-case
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  if (nameMatch) {
    const n = nameMatch[1].trim();
    if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n)) { points += 2; details.push("name 格式正确"); evidence.push(`name: ${n} (kebab-case ✅)`); }
    else { points += 1; details.push("name 存在但非 kebab-case"); evidence.push(`name: ${n} (非 kebab-case ❌，应改用小写字母+连字符)`); }
  } else {
    details.push("缺少 name"); evidence.push("name: 缺失");
  }

  // version exists + semver
  const versionMatch = fm.match(/^version:\s*(\S+)$/m);
  const semverRe = /^\d+\.\d+\.\d+$/;
  if (versionMatch) {
    const v = versionMatch[1].trim();
    if (semverRe.test(v)) { points += 2; details.push("version 格式正确"); evidence.push(`version: ${v} (semver ✅)`); }
    else { points += 1; details.push("version 存在但非 semver"); evidence.push(`version: ${v} (非 semver ❌，应使用 x.y.z 格式)`); }
  } else {
    details.push("缺少 version 或格式不对"); evidence.push("version: 缺失");
  }

  // description exists + routing format
  const desc = extractFieldValue(fm, "description");
  if (desc) {
    points += 1;
    const descPreview = desc.length > 60 ? desc.slice(0, 57) + "..." : desc;
    if (/当用户|用户需要|用户想要|when.*user/i.test(desc)) { points += 1; details.push("description 路由格式好"); evidence.push(`description: "${descPreview}" (路由触发格式 ✅)`); }
    else { points += 0; details.push("description 存在但非路由触发格式"); evidence.push(`description: "${descPreview}" (非路由触发格式 ❌，建议以"当用户需要…时加载"开头)`); }
    if (desc.length <= 1024) { points += 1; details.push("description 长度合规"); }
    else { points += 0; details.push("description 超 1024 字符"); evidence.push(`description 长度 ${desc.length}/1024 (超限 ❌)`); }
  } else {
    details.push("缺少 description"); evidence.push("description: 缺失");
  }

  // tested-models
  const tm = extractFieldValue(fm, "tested-models");
  if (tm) { points += 1; details.push("有 tested-models"); evidence.push("tested-models: 存在 ✅"); }
  else { evidence.push("tested-models: 缺失（建议添加跨模型测试记录）"); }

  const score = score1to10(points, 0, 8);

  // Generate improvement from most critical missing item
  let improvement = "";
  if (!nameMatch) {
    improvement = "在 frontmatter 中添加 name 字段，使用 kebab-case 格式（如 my-skill-name）";
  } else if (!versionMatch || !semverRe.test(versionMatch[1].trim())) {
    improvement = `添加 version 字段：version: 1.0.0（semver 格式 x.y.z）`;
  } else if (!desc) {
    improvement = `添加 description 字段，以"当用户需要…时加载"的触发路由格式描述`;
  } else if (!/当用户|用户需要|用户想要|when.*user/i.test(desc)) {
    improvement = `description 改为触发路由格式："当用户需要【具体场景】时加载。用于【具体功能】。触发词："`;
  } else if (desc.length > 1024) {
    improvement = `description 长度 ${desc.length}，超过 1024 字符上限。精简至 1024 以内`;
  } else if (!tm) {
    improvement = `建议添加 tested-models 字段记录跨模型测试结果，格式：tested-models: [model1, model2]`;
  }

  return { score, reason: details.join("；") || "frontmatter 需要完善", evidence, improvement };
}

function d2WorkflowClarity(content: string): { score: number; reason: string; evidence: string[]; improvement: string } {
  let points = 0;
  const details: string[] = [];
  const evidence: string[] = [];

  // Numbered steps (1. 2. 3. or 1) 2) 3))
  const numberedSteps = (content.match(/^\d+[\.\)]\s/gm) || []).length;
  if (numberedSteps >= 5) { points += 3; details.push(`${numberedSteps} 个编号步骤`); }
  else if (numberedSteps >= 2) { points += 2; details.push(`${numberedSteps} 个编号步骤`); }
  else { points += 1; details.push("缺少编号步骤"); }
  evidence.push(`编号步骤: ${numberedSteps} 个${numberedSteps < 2 ? "（建议 ≥5 个）" : ""}`);

  // Section headers
  const headers = (content.match(/^#{2,4}\s/gm) || []).length;
  if (headers >= 6) { points += 2; details.push("结构清晰（多级标题）"); }
  else if (headers >= 3) { points += 1; details.push("有基本章节划分"); }
  else { details.push("缺少章节划分"); }
  evidence.push(`章节标题: ${headers} 个${headers < 3 ? "（建议 ≥3 个分级标题）" : ""}`);

  // Input/output mentions
  const hasIO = /输入|输出|input|output|产生|生成|结果|产出/i.test(content);
  if (hasIO) { points += 2; details.push("有明确输入/输出描述"); evidence.push("输入/输出: 有说明 ✅"); }
  else { evidence.push("输入/输出: 未明确说明（建议描述每步的输入/输出）"); }

  // Phase/Stage divisions
  if (/阶段|步骤|phase|step|Stage/i.test(content)) points += 1;

  // Tables or lists for structure
  if (content.includes("|--")) { points += 1; details.push("使用了表格"); }
  if (/^- /m.test(content)) { points += 1; details.push("使用了列表"); }

  const score = score1to10(points, 0, 10);

  let improvement = "";
  if (numberedSteps < 2) {
    improvement = `将流程拆分为编号步骤（1. 2. 3.），每步描述一个具体的操作。示例：\n1. 读取用户输入的内容\n2. 调用 API 获取数据\n3. 格式化输出结果`;
  } else if (headers < 3) {
    improvement = `用 ## 和 ### 划分章节。示例：## 前置准备 → ## 执行流程 → ## 输出处理`;
  } else if (!hasIO) {
    improvement = `在每个步骤中明确输入和输出。示例："步骤 1: 读取用户提供的 URL（输入）→ 获取页面内容（输出）"`;
  }

  return { score, reason: details.join("；") || "工作流结构不够清晰", evidence, improvement };
}

function d3BoundaryConditions(content: string): { score: number; reason: string; evidence: string[]; improvement: string } {
  let points = 0;
  const details: string[] = [];
  const evidence: string[] = [];

  // Has Gotchas section with content
  const gotchaMatch = content.match(/## Gotchas?\n([\s\S]*?)(?=\n## |$)/);
  if (gotchaMatch) {
    const text = gotchaMatch[1].trim();
    const entries = (text.match(/^[-*]\s/gm) || []).length;
    if (entries >= 3) { points += 3; details.push(`gotchas 有 ${entries} 条`); evidence.push(`Gotchas: ${entries} 条 ✅`); }
    else if (entries >= 1) { points += 2; details.push("gotchas 有内容"); evidence.push(`Gotchas: ${entries} 条（建议 ≥3 条）`); }
    else { points += 1; evidence.push("Gotchas: 仅有占位符，无实际条目"); }
  } else {
    evidence.push("Gotchas 节: 缺失（这是最有价值的内容，记录真实失败案例）");
  }

  // Has Forbidden Load
  if (/## Forbidden Load|绝不加载|不应加载/i.test(content)) { points += 2; details.push("有 Forbidden Load"); evidence.push("Forbidden Load: 存在 ✅"); }
  else { evidence.push("Forbidden Load: 缺失（明确声明什么场景不加载）"); }

  // Error handling keywords
  const errorPatterns = /如果.*失败|错误|异常|fallback|兜底|报错|try|catch|超时|timeout/i;
  if (errorPatterns.test(content)) { points += 2; details.push("有错误处理描述"); evidence.push("错误处理: 有描述 ✅"); }
  else { evidence.push("错误处理: 未涉及（建议补充 if-失败-则 的 fallback 路径）"); }

  // "如果" conditionals
  const ifCount = (content.match(/如果/g) || []).length;
  if (ifCount >= 3) { points += 1; details.push("多条件分支处理"); }

  // Edge case mentions
  if (/边界|特殊情况|注意|警告|限制|注意|注意|⚠️/i.test(content)) { points += 2; details.push("有边界条件说明"); evidence.push("边界条件: 有说明 ✅"); }
  else { evidence.push("边界条件: 未明确说明（建议列出已知的边界情况）"); }

  const score = score1to10(points, 0, 10);

  let improvement = "";
  if (!gotchaMatch) {
    improvement = `添加 ## Gotchas 节，每行一条真实失败案例：\n## Gotchas\n- [场景] 当 XXX 时，模型会 YYY，需要在 ZZZ 中处理`;
  } else if (!/## Forbidden Load|绝不加载|不应加载/i.test(content)) {
    improvement = `添加 ## Forbidden Load 节，声明不加载的场景：\n## Forbidden Load\n- 当用户只需要简单概念解释时\n- 当输出要求为纯 JSON 时`;
  } else if (!errorPatterns.test(content)) {
    improvement = `补充错误处理描述。示例："如果 API 返回 429（限流），等待 5 秒后重试，最多 3 次"`;
  }

  return { score, reason: details.join("；") || "缺少边界条件处理", evidence, improvement };
}

function d4CheckpointDesign(content: string): { score: number; reason: string; evidence: string[]; improvement: string } {
  let points = 0;
  const details: string[] = [];
  const evidence: string[] = [];

  // User confirmation keywords
  if (/确认|确认后|用户确认|请确认|是否继续|等用户|暂停/i.test(content)) { points += 3; details.push("有用户确认点"); evidence.push("用户确认: 有确认点 ✅"); }
  else { evidence.push("用户确认: 无确认点（建议在关键决策前添加）"); }

  // Checklist or quality gate
  if (/质检|检查|验证|确认|checklist|自检/i.test(content) && /\[.?\]|[-*]\s+\w/i.test(content)) {
    points += 2; details.push("有质检清单"); evidence.push("质检清单: 存在 ✅");
  }

  // Review step
  if (/审查|review|回顾|检查阶段/i.test(content)) { points += 2; details.push("有审查步骤"); evidence.push("审查步骤: 存在 ✅"); }

  // Phase divisions with human in loop
  if (/Phase|阶段.*[0-9]|Step.*[0-9]/i.test(content) && /确认|审核/i.test(content)) {
    points += 2; details.push("分阶段含人工参与");
  }

  // Eval section (suggests testability)
  if (/## Eval|## 评估/i.test(content)) { points += 1; details.push("有 Eval 评估节"); evidence.push("Eval 节: 存在 ✅"); }
  else { evidence.push("Eval 节: 缺失（建议添加正例/反例用于测试）"); }

  const score = score1to10(points, 0, 10);

  let improvement = "";
  if (!/确认|确认后|用户确认|请确认|是否继续|等用户|暂停/i.test(content)) {
    improvement = `在关键决策点前添加用户确认。示例："步骤 3 完成后，展示生成结果并询问用户是否满意，确认后再继续"`;
  } else if (!/## Eval|## 评估/i.test(content)) {
    improvement = `添加 ## Eval 节，包含正例和反例：\n## Eval\n### 正例\n- 用户说"帮我研究一下 X" → 应触发\n### 反例\n- 用户说"解释一下 X" → 不应触发`;
  }

  return { score, reason: details.join("；") || "缺少检查点和用户确认设计", evidence, improvement };
}

function d5InstructionSpecificity(content: string): { score: number; reason: string; evidence: string[]; improvement: string } {
  let points = 0;
  const details: string[] = [];
  const evidence: string[] = [];

  // Code blocks
  const codeBlocks = (content.match(/```/g) || []).length / 2;
  if (codeBlocks >= 3) { points += 2; details.push(`${codeBlocks} 个代码块`); }
  else if (codeBlocks >= 1) { points += 1; details.push("有代码块"); }
  evidence.push(`代码块: ${codeBlocks} 个${codeBlocks < 1 ? "（建议添加可执行代码示例）" : codeBlocks < 3 ? "（建议 ≥3 个）" : ""}`);

  // Examples
  if (/## Example|示例|例子|例如/i.test(content)) { points += 2; details.push("有示例"); evidence.push("示例: 存在 ✅"); }
  else { evidence.push("示例: 缺失（建议添加使用示例）"); }

  // Concrete parameters/paths/formats
  if (/路径|文件名|格式|参数|--\w|port|host|url/i.test(content)) { points += 2; details.push("有具体参数/路径/格式"); evidence.push("具体参数: 有 ✅"); }
  else { evidence.push("具体参数: 未给出（建议给出参数名、格式、路径）"); }

  // Commands
  if (/\$ |```bash|```shell/i.test(content)) { points += 2; details.push("有可执行命令"); evidence.push("可执行命令: 有 ✅"); }
  else { evidence.push("可执行命令: 无（建议给出可直接运行的命令）"); }

  // Specific version numbers or constraints
  if (/\d+\.\d+\.\d+|\d{4}-\d{2}-\d{2}|>=|<=/i.test(content)) { points += 1; details.push("有版本/日期约束"); }

  // File paths
  if (/\/(\w+\/)+|~\//i.test(content)) { points += 1; details.push("有文件路径引用"); }

  const score = score1to10(points, 0, 10);

  let improvement = "";
  if (codeBlocks < 1) {
    improvement = `添加代码块示例，展示关键命令和参数：\n\`\`\`bash\nopencli web search --query "关键词" --limit 10\n\`\`\``;
  } else if (!/## Example|示例|例子|例如/i.test(content)) {
    improvement = `添加 ## Examples 节，展示至少 2 个典型使用示例，包括输入和输出`;
  } else if (!/\$ |```bash|```shell/i.test(content)) {
    improvement = `在指令中添加可直接运行的命令：\`\`\`bash\nskillhub search "关键词" --json\n\`\`\``;
  }

  return { score, reason: details.join("；") || "指令偏抽象，缺少具体性", evidence, improvement };
}

function d6ResourceIntegration(content: string, filePath: string): { score: number; reason: string; evidence: string[]; improvement: string } {
  let points = 0;
  const details: string[] = [];
  const evidence: string[] = [];
  const dir = filePath.replace(/\/[^/]+$/, "");

  // Check references/
  const refDir = join(dir, "references");
  if (existsSync(refDir)) {
    try {
      const files = readdirSync(refDir).filter((f) => f !== ".gitkeep");
      if (files.length > 0) { points += 2; details.push(`references/ 有 ${files.length} 个文件`); evidence.push(`references/: ${files.length} 文件 ✅`); }
      else { evidence.push("references/: 空目录（建议放入实际文档/指南）"); }
    } catch { evidence.push("references/: 无法读取"); }
  } else {
    evidence.push("references/: 缺失（建议创建并放入领域参考文档）");
  }

  // Check scripts/
  const scrDir = join(dir, "scripts");
  if (existsSync(scrDir)) {
    try {
      const files = readdirSync(scrDir).filter((f) => f !== ".gitkeep");
      if (files.length > 0) { points += 2; details.push(`scripts/ 有 ${files.length} 个文件`); evidence.push(`scripts/: ${files.length} 文件 ✅`); }
      else { evidence.push("scripts/: 空目录"); }
    } catch { /* empty */ }
  } else {
    evidence.push("scripts/: 缺失（建议创建并放入确定性逻辑脚本）");
  }

  // Check assets/
  const astDir = join(dir, "assets");
  if (existsSync(astDir)) {
    try {
      const files = readdirSync(astDir).filter((f) => f !== ".gitkeep");
      if (files.length > 0) { points += 2; details.push(`assets/ 有 ${files.length} 个文件`); evidence.push(`assets/: ${files.length} 文件 ✅`); }
      else { evidence.push("assets/: 空目录"); }
    } catch { /* empty */ }
  } else {
    evidence.push("assets/: 缺失（建议创建并放入模板/版式骨架）");
  }

  // References section in SKILL.md
  if (/## References|## 参考/i.test(content)) { points += 2; details.push("有 References 节"); evidence.push("References 节: 存在 ✅"); }
  else { evidence.push("References 节: 缺失（建议引用外部资源）"); }

  // Wiki/other skill links
  if (/\[\[.*\]\]|wikilink|\.\/.*\.md/i.test(content)) { points += 1; details.push("有交叉引用"); }

  // Ensure dir paths are mentioned in content
  if (/references|scripts|assets/i.test(content)) { points += 1; details.push("SKILL.md 引用了辐射目录"); }

  const score = score1to10(points, 0, 10);

  let improvement = "";
  if (!existsSync(refDir)) {
    improvement = `创建 references/ 目录并放入领域参考文档。示例：\nreferences/\n  guide.md\n  schema.json\n  faq.md`;
  } else if (!existsSync(scrDir)) {
    improvement = `创建 scripts/ 目录并放入确定性逻辑脚本。示例：\nscripts/\n  convert.sh\n  validate.py`;
  } else if (!/## References|## 参考/i.test(content)) {
    improvement = `在 SKILL.md 末尾添加 ## References 节，引用相关文档和关联 skill`;
  }

  return { score, reason: details.join("；") || "缺少辐射目录或引用", evidence, improvement };
}

function d7OverallArchitecture(content: string): { score: number; reason: string; evidence: string[]; improvement: string } {
  let points = 0;
  const details: string[] = [];
  const evidence: string[] = [];

  // Has clear Overview
  if (/## Overview|## 概述|## 简介|#\s+\w+/i.test(content)) { points += 1; details.push("有概述"); evidence.push("概述: 存在 ✅"); }
  else { evidence.push("概述: 缺失（建议添加简短概述说明 skill 用途）"); }

  // All critical sections present
  let sectionCount = 0;
  if (/## Gotchas/i.test(content)) sectionCount++;
  if (/## Eval|## 评估/i.test(content)) sectionCount++;
  if (/## Forbidden Load|## Forbidden|绝不加载/i.test(content)) sectionCount++;
  if (/## References|## 参考/i.test(content)) sectionCount++;
  if (sectionCount >= 4) { points += 2; details.push("关键章节完整"); evidence.push("关键章节: 全部存在 ✅"); }
  else if (sectionCount >= 2) { points += 1; details.push("部分关键章节存在"); evidence.push(`关键章节: ${sectionCount}/4（建议补充缺失的章节）`); }
  else { evidence.push(`关键章节: ${sectionCount}/4（建议添加 Gotchas、Eval、Forbidden Load、References）`); }

  // Line count check (not too long, not too short)
  const lines = content.split("\n").length;
  if (lines >= 30 && lines <= 300) { points += 2; details.push(`篇幅适中 (${lines} 行)`); evidence.push(`篇幅: ${lines} 行 ✅`); }
  else if (lines < 30) { points += 0; details.push("篇幅过短"); evidence.push(`篇幅: ${lines} 行（偏短，建议充实到 ≥30 行）`); }
  else { points += 1; details.push("篇幅偏长"); evidence.push(`篇幅: ${lines} 行（偏长，建议精简到 ≤300 行）`); }

  // Has clear trigger/user scenario in description
  const fm = parseFrontmatter(content);
  if (fm) {
    const desc = extractFieldValue(fm, "description");
    if (desc && /当|when|触发/i.test(desc)) { points += 1; details.push("description 含触发条件"); }
  }

  // Non-redundancy check: no repeated section headers
  const headers = content.match(/^## .+$/gm) || [];
  const uniqueHeaders = new Set(headers);
  if (headers.length === uniqueHeaders.size) { points += 1; details.push("章节不重复"); }
  else { details.push("有重复章节标题"); evidence.push("章节标题: 有重复（建议合并或删除重复章节）"); }

  // Thin Harness principle
  if (!/harness|基础设施|运行时/i.test(content)) { points += 1; details.push("聚焦领域逻辑"); }

  // Trailing newline
  if (content.endsWith("\n")) points += 1;

  // Code blocks with language specified
  const langBlocks = content.match(/```\w+/g) || [];
  if (langBlocks.length > 0) { points += 1; details.push("代码块指定了语言"); }

  const score = score1to10(points, 0, 10);

  let improvement = "";
  if (sectionCount < 2) {
    improvement = `补充缺失的关键章节。必需的章节：\n## Gotchas — 真实失败案例\n## Eval — 正例/反例\n## Forbidden Load — 不加载的场景\n## References — 引用和关联`;
  } else if (lines < 30) {
    improvement = `当前仅 ${lines} 行，建议充实内容到至少 60 行，确保覆盖关键章节`;
  } else if (!/## Overview|## 概述|## 简介/i.test(content)) {
    improvement = `在文件开头添加 ## Overview 节，用 2-3 句话概述这个 skill 做什么`;
  }

  return { score, reason: details.join("；") || "架构结构需要优化", evidence, improvement };
}



/**
 * Evaluate a SKILL.md file using the 8-dimension Rubric.
 *
 * Dimensions 1-7 are computed via static analysis.
 * Dimension 8 is test_required and returns a placeholder score.
 *
 * @param content - Full text content of SKILL.md
 * @param filePath - File path (needed for D6 directory checks)
 * @returns RubricResult with per-dimension scores and weighted total
 */
export function evaluateSkill(content: string, filePath: string): RubricResult {
  const d1 = d1FrontmatterQuality(content);
  const d2 = d2WorkflowClarity(content);
  const d3 = d3BoundaryConditions(content);
  const d4 = d4CheckpointDesign(content);
  const d5 = d5InstructionSpecificity(content);
  const d6 = d6ResourceIntegration(content, filePath);
  const d7 = d7OverallArchitecture(content);
  const d8: { score: number; reason: string; evidence?: string[]; improvement?: string } = { score: 5, reason: "需运行测试 prompt 评估（test_required），当前为占位分" };

  const rawScores = [d1, d2, d3, d4, d5, d6, d7, d8];

  const dimensions: RubricDimension[] = DIMENSIONS.map((def, i) => ({
    id: def.id,
    label: def.label,
    weight: def.weight,
    score: clampScore(rawScores[i].score),
    reason: rawScores[i].reason,
    testRequired: def.testRequired,
    evidence: rawScores[i].evidence,
    improvement: rawScores[i].improvement,
  }));

  // Weighted total (each dimension contributes (score/10) * weight points, max = sum(weight) = 100)
  const total = Math.round(
    dimensions.reduce((s, d) => s + (d.score / 10) * d.weight, 0),
  );

  // Summary
  const lowest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  const highest = [...dimensions].sort((a, b) => b.score - a.score)[0];
  const summary = `总分 ${total}/100 — 最强: ${highest.label}(${highest.score}/10)，最弱: ${lowest.label}(${lowest.score}/10)`;

  return { filePath, dimensions, total, summary };
}

/**
 * Get improvement suggestions based on the Rubric evaluation.
 * Returns specific, actionable suggestions for low-scoring dimensions.
 */
export function getImprovementSuggestions(result: RubricResult): string[] {
  const suggestions: string[] = [];

  const sorted = [...result.dimensions]
    .filter((d) => !d.testRequired)
    .sort((a, b) => a.score - b.score);

  for (const dim of sorted.slice(0, 3)) {
    if (dim.score >= 7) continue;

    // Prefer custom improvement if available
    if (dim.improvement) {
      suggestions.push(`[${dim.label} ${dim.score}/10] ${dim.improvement}`);
      continue;
    }

    // Fallback to template suggestions
    switch (dim.id) {
      case 1:
        suggestions.push(`[Frontmatter质量 ${dim.score}/10] 检查 name(kebab-case)、version(semver)、description(路由触发格式)、tested-models`);
        break;
      case 2:
        suggestions.push(`[工作流清晰度 ${dim.score}/10] 添加编号步骤、明确每步的输入/输出、用表格或列表组织`);
        break;
      case 3:
        suggestions.push(`[边界条件覆盖 ${dim.score}/10] 补充 Gotchas(真实失败案例)、Forbidden Load、错误处理(fallback/异常)`);
        break;
      case 4:
        suggestions.push(`[检查点设计 ${dim.score}/10] 在关键决策前添加用户确认步骤、补充质检清单`);
        break;
      case 5:
        suggestions.push(`[指令具体性 ${dim.score}/10] 添加代码示例、具体参数、文件路径、可执行命令`);
        break;
      case 6:
        suggestions.push(`[资源整合度 ${dim.score}/10] 创建 references/ scripts/ assets/ 目录并填充实际内容`);
        break;
      case 7:
        suggestions.push(`[整体架构 ${dim.score}/10] 补充缺失的关键章节(Gotchas/Eval/Forbidden/References)，精简冗余内容`);
        break;
    }
  }

  // Dimension 8
  const d8 = result.dimensions.find((d) => d.id === 8);
  if (d8) {
    if (d8.improvement) {
      suggestions.push(`[实测表现 ${d8.score}/10] ${d8.improvement}`);
    } else {
      suggestions.push(`[实测表现 ${d8.score}/10] 设计 2-3 个测试 prompt，运行带 skill vs 不带 skill 的对比测试`);
    }
  }

  return suggestions;
}

// ── Future: pi-llm-wiki Gene integration ──

/**
 * 从 pi-llm-wiki 获取与 skill 相关的 Gene 经验（失败模式）。
 *
 * 当 Gene 数据积累到阈值后实现此函数，用于增强 optimize-skill 的 gotchas 建议：
 * 从模板"当前 gotchas 仅含占位符" → "从实际使用数据中发现常见失败模式：X、Y、Z"
 *
 * 查询方式：读 wiki/基因/ 目录下所有 .md 文件
 * → 解析 frontmatter 提取 gene_skill_slug, gene_pattern, gene_trigger, gene_action
 * → 过滤 gene_skill_slug === slug, gene_pattern === "failure", gene_confidence > 0.7
 * → 提取 gene_trigger + gene_action 作为 gotchas 建议
 *
 * 降级策略：目录不存在 / 读取失败 / 无匹配 → 静默返回 []，模板建议继续工作
 * 隔离原则：只用于 suggestion 增强，不参与 validate/birth-cert 决策路径
 *
 * @see FUTURE.md — pi-llm-wiki Gene 集成计划
 */
export async function getRelatedGenes(_slug: string, _dir: string): Promise<string[]> {
  // TODO: 当 Gene 数量积累到 >50 条且匹配当前 skill 时实现
  // 实现前确认：FUTURE.md 中定义的条件是否已满足
  return [];
}
