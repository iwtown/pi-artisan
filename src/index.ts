/**
 * Meta-Validator Extension
 *
 * 🧬 元编程 L3 强制校验层 — 管理 Pi Agent 所有扩展机制。
 *
 * 自动校验（write/edit 后触发）：
 *   SKILL.md  → frontmatter 字段
 *   .ts       → export/import/命名
 *
 * 手动校验（命令 + 工具）：
 *   /validate-skill      validate_skill      SKILL.md
 *   /validate-extension  validate_extension  .ts 扩展
 *   /validate-prompt     validate_prompt     提示词模板
 *   /validate-theme      validate_theme      主题配色
 *   /validate-package    validate_package    Pi Package 目录
 *
 * 非阻塞：只警告，不阻止写入。-p 模式静默。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync, existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve, join, dirname } from "node:path";

// ── Track file paths from tool_call → tool_result ──
const pendingPaths = new Map<string, string>();

export default function (pi: ExtensionAPI) {
	// ── tool_call: capture path for write/edit ──
	pi.on("tool_call", async (event: any, _ctx: any) => {
		if (event.toolName === "write" || event.toolName === "edit") {
			const filePath = event.input?.path as string;
			if (filePath) pendingPaths.set(event.toolCallId, filePath);
		}
		return undefined;
	});

	// ── tool_result: auto-validate after successful write/edit ──
	pi.on("tool_result", async (event: any, ctx: any) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return;
		if (event.isError) return;

		const filePath = pendingPaths.get(event.toolCallId);
		if (!filePath) return;
		pendingPaths.delete(event.toolCallId);

		const fileName = basename(filePath);
		let issues: string[];
		let type: string;

		if (fileName === "SKILL.md") {
			issues = validateSkillFrontmatter(readFileSync(filePath, "utf-8"));
			const dirIssues = checkRadiantDirs(filePath);
			issues.push(...dirIssues);
			type = "SKILL.md";
		} else if (fileName.endsWith(".ts")) {
			issues = validateExtensionStructure(readFileSync(filePath, "utf-8"));
			type = "extension";
		} else {
			return;
		}

		// TUI only — silent in -p mode
		if (ctx.hasUI) {
			if (issues.length === 0) {
				ctx.ui.notify(`✅ ${type}: ${basename(filePath)}`, "info");
			} else {
				ctx.ui.notify(`⚠️ ${type}: ${issues.length} issues in ${basename(filePath)}`, "warning");
			}
		}
		return undefined;
	});

	// ─────────────────────────────────────────────────────────
	//  Slash Commands (interactive TUI)
	// ─────────────────────────────────────────────────────────

	pi.registerCommand("validate-skill", {
		description: "Validate a SKILL.md file (frontmatter + directory checks)",
		handler: async (args: string, ctx: any) => {
			const filePath = resolvePath(args.trim(), ctx);
			if (!existsSync(filePath)) { ctx.ui.notify(`File not found: ${filePath}`, "error"); return; }
			const issues = validateSkillFrontmatter(readFileSync(filePath, "utf-8"));
			const dirIssues = checkRadiantDirs(filePath);
			issues.push(...dirIssues);
			notifyResults("SKILL.md", filePath, issues, locationHint(filePath, "skills"), ctx);
		},
	});

	pi.registerCommand("validate-extension", {
		description: "Validate a .ts extension file (export/import checks)",
		handler: async (args: string, ctx: any) => {
			const filePath = resolvePath(args.trim(), ctx);
			if (!existsSync(filePath)) { ctx.ui.notify(`File not found: ${filePath}`, "error"); return; }
			const issues = validateExtensionStructure(readFileSync(filePath, "utf-8"));
			notifyResults("extension", filePath, issues, locationHint(filePath, "extensions"), ctx);
		},
	});

	pi.registerCommand("validate-prompt", {
		description: "Validate a prompt template (.md file in prompts/)",
		handler: async (args: string, ctx: any) => {
			const filePath = resolvePath(args.trim(), ctx);
			if (!existsSync(filePath)) { ctx.ui.notify(`File not found: ${filePath}`, "error"); return; }
			const issues = validatePromptTemplate(readFileSync(filePath, "utf-8"), filePath);
			notifyResults("prompt template", filePath, issues, locationHint(filePath, "prompts"), ctx);
		},
	});

	pi.registerCommand("validate-theme", {
		description: "Validate a theme file (.json in themes/)",
		handler: async (args: string, ctx: any) => {
			const filePath = resolvePath(args.trim(), ctx);
			if (!existsSync(filePath)) { ctx.ui.notify(`File not found: ${filePath}`, "error"); return; }
			const issues = validateThemeColors(readFileSync(filePath, "utf-8"));
			notifyResults("theme", filePath, issues, locationHint(filePath, "themes"), ctx);
		},
	});

	pi.registerCommand("validate-package", {
		description: "Validate a Pi Package directory (package.json structure)",
		handler: async (args: string, ctx: any) => {
			const dirPath = resolvePath(args.trim(), ctx);
			if (!existsSync(dirPath)) { ctx.ui.notify(`Directory not found: ${dirPath}`, "error"); return; }
			if (!statSync(dirPath).isDirectory()) { ctx.ui.notify(`Not a directory: ${dirPath}`, "error"); return; }
			const issues = validatePackage(dirPath);
			notifyResults("package", dirPath, issues, "", ctx);
		},
	});

	// ─────────────────────────────────────────────────────────
	//  Tools (LLM-callable, works in -p mode)
	// ─────────────────────────────────────────────────────────

	// validate_skill 使用自定义 validateFn 同时校验 frontmatter 和目录结构
	pi.registerTool({
		name: "validate_skill",
		label: "Validate Skill",
		description: "Validate a SKILL.md file's frontmatter and directory structure. Checks required fields (name, description), kebab-case name format, description length, gotchas/eval sections, radiant dirs (references/ scripts/ assets/). Returns pass/fail with issue list.",
		parameters: Type.Object({
			path: Type.String({ description: "Absolute or relative path to the SKILL.md file" }),
		}),
		async execute(_id: any, params: any, _sig: any, _upd: any, ctx: any) {
			const filePath = resolvePath(params.path, ctx);
			if (!existsSync(filePath)) {
				return { content: [{ type: "text", text: `❌ File not found: ${filePath}` }], details: {} };
			}
			const issues = validateSkillFrontmatter(readFileSync(filePath, "utf-8"));
			const dirIssues = checkRadiantDirs(filePath);
			issues.push(...dirIssues);
			const pass = issues.length === 0;
			const typeLabel = "SKILL.md";
			let result = pass
				? `✅ ${typeLabel} validation passed: ${basename(filePath)}`
				: `⚠️ ${typeLabel} validation: ${issues.length} issue${issues.length > 1 ? "s" : ""} in ${basename(filePath)}\n${issues.map((i) => `  - ${i}`).join("\n")}`;
			const hint = locationHint(filePath, "skills");
			if (hint) result += `\n${hint}`;
			return { content: [{ type: "text", text: result }], details: { filePath, issues } };
		},
	});

	registerValidatorTool(pi, "validate_extension", "Validate Extension",
		"Validate a .ts Pi extension file. Checks: has export default function, imports from @earendil-works/pi-coding-agent, tool names use snake_case convention, no .js imports.",
		(f) => validateExtensionStructure(readFileSync(f, "utf-8")), "extension",
	);

	registerValidatorTool(pi, "validate_prompt", "Validate Prompt Template",
		"Validate a Pi prompt template (.md). Checks: valid frontmatter, description length, argument-hint format, filename valid as /command.",
		(f) => validatePromptTemplate(readFileSync(f, "utf-8"), f), "prompt template",
	);

	registerValidatorTool(pi, "validate_theme", "Validate Theme",
		"Validate a Pi theme file (.json). Checks: valid JSON, has name, all 51 required color tokens present, color values valid (hex/rgb/vars ref).",
		(f) => validateThemeColors(readFileSync(f, "utf-8")), "theme",
	);

	registerValidatorTool(pi, "validate_package", "Validate Package",
		"Validate a Pi Package directory. Checks: package.json exists, pi manifest paths resolve, or conventional directories present.",
		(f) => validatePackage(dirname(f)), "package",
	);
}

// ═══════════════════════════════════════════════════════════
//  Registration Helper
// ═══════════════════════════════════════════════════════════

function registerValidatorTool(
	pi: ExtensionAPI,
	name: string,
	label: string,
	description: string,
	validateFn: (filePath: string) => string[],
	typeLabel: string,
) {
	pi.registerTool({
		name,
		label,
		description,
		parameters: Type.Object({
			path: Type.String({ description: "Absolute or relative path to the file or directory" }),
		}),
		async execute(_id: any, params: any, _sig: any, _upd: any, ctx: any) {
			const filePath = resolvePath(params.path, ctx);
			if (!existsSync(filePath)) {
				return { content: [{ type: "text", text: `❌ File not found: ${filePath}` }], details: {} };
			}
			const issues = validateFn(filePath);
			const pass = issues.length === 0;
			let result = pass
				? `✅ ${typeLabel} validation passed: ${basename(filePath)}`
				: `⚠️ ${typeLabel} validation: ${issues.length} issue${issues.length > 1 ? "s" : ""} in ${basename(filePath)}\n${issues.map((i) => `  - ${i}`).join("\n")}`;
			// Location hint for single-file types
			if (!pass || typeLabel === "package") {
				// pass-through
			} else {
				const hint = locationHint(filePath, inferredDir(typeLabel));
				if (hint) result += `\n${hint}`;
			}
			return { content: [{ type: "text", text: result }], details: { filePath, issues } };
		},
	});
}

function inferredDir(typeLabel: string): string {
	const map: Record<string, string> = {
		"SKILL.md": "skills",
		"extension": "extensions",
		"prompt template": "prompts",
		"theme": "themes",
	};
	return map[typeLabel] || "";
}

// ═══════════════════════════════════════════════════════════
//  Path Resolution & Location Hints
// ═══════════════════════════════════════════════════════════

const HOME = process.env.HOME || "/home/wtown";
const GLOBAL_DIRS: Record<string, string> = {
	extensions: join(HOME, ".pi", "agent", "extensions"),
	skills:     join(HOME, ".pi", "agent", "skills"),
	prompts:    join(HOME, ".pi", "agent", "prompts"),
	themes:     join(HOME, ".pi", "agent", "themes"),
};

function resolvePath(arg: string, ctx: any): string {
	if (!arg) return "";
	if (isAbsolute(arg)) return arg;
	if (arg.startsWith("~")) return arg.replace("~", HOME);
	const cwd = ctx.cwd || ctx.sessionManager?.cwd || process.cwd();
	return resolve(cwd, arg);
}

/** If file is not in a standard Pi directory, suggest the right global path. */
function locationHint(filePath: string, subdir: string): string {
	if (!subdir || !GLOBAL_DIRS[subdir]) return "";
	const absPath = resolve(filePath);
	if (absPath.startsWith(GLOBAL_DIRS[subdir]) || absPath.includes(`/.pi/${subdir}`)) return "";
	return `💡 放到 ${GLOBAL_DIRS[subdir]}/ 可被 Pi 全局自动发现`;
}

// ═══════════════════════════════════════════════════════════
//  YAML Field Extraction Helpers
// ═══════════════════════════════════════════════════════════

/**
 * Extract a YAML field value from frontmatter, handling folded/block scalars.
 * Supports: simple values, >-, >, |, >+, |+ block scalars.
 */
function extractFieldValue(fm: string, field: string): string | null {
	const lines = fm.split("\n");
	const prefix = field + ":";
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (!trimmed.startsWith(prefix)) continue;
		let val = trimmed.slice(prefix.length).trim();
		// Check if it's a block scalar marker
		if (val === ">-" || val === ">" || val === "|-" || val === "|" || val === ">+" || val === "|+") {
			// Collect continuation lines (indented with spaces)
			const parts: string[] = [];
			for (let j = i + 1; j < lines.length; j++) {
				if (lines[j].startsWith(" ") || lines[j].startsWith("\t")) {
					parts.push(lines[j].trim());
				} else {
					break;
				}
			}
			// Folded scalar (>- etc.) joins with space; literal (|) joins with newline
			if (val.startsWith("|")) {
				val = parts.join("\n");
			} else {
				val = parts.join(" ");
			}
		}
		return val;
	}
	return null;
}

// ═══════════════════════════════════════════════════════════
//  SKILL.md Frontmatter Validation
// ═══════════════════════════════════════════════════════════

function validateSkillFrontmatter(content: string): string[] {
	const issues: string[] = [];

	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) {
		issues.push("Missing YAML frontmatter (should start with --- ... ---)");
		return issues;
	}
	const fm = fmMatch[1];

	const nameMatch = fm.match(/^name:\s*(.+)$/m);
	if (!nameMatch) {
		issues.push('Missing required field: name');
	} else {
		const name = nameMatch[1].trim();
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
			issues.push(`name "${name}" is not kebab-case (use only lowercase a-z, 0-9, hyphens)`);
		}
		if (name.length < 1 || name.length > 64) {
			issues.push(`name length ${name.length} (valid: 1-64 chars)`);
		}
	}

	// Extract description content, handling folded/block scalars (>-, |, etc.)
	const descRaw = extractFieldValue(fm, 'description');
	if (!descRaw) {
		issues.push('Missing required field: description');
	} else {
		const desc = descRaw;
		if (desc.length > 1024) {
			issues.push(`description exceeds 1024 characters (${desc.length})`);
		}
		// Description 路由式检查
		if (/^(Generate|Create|Provide|Handle|Manage|Interact|Use|This skill)/i.test(desc)) {
			issues.push('description 建议改为路由触发格式：以"当用户需要…时加载"开头，非功能说明');
		}
		// 路由触发词检测：需要一个明确的触发条件，避免误报「不需要」
		if (!/当用户|用户需要|用户想要|用户提到|用户要求|用户输入|when.*user|when.*need/i.test(desc)) {
			issues.push('description 应描述触发场景（"当用户需要…时加载"），非功能说明');
		}
	}

	// Optional fields: just check format
	const compatMatch = fm.match(/^compatibility:\s*(.+)$/m);
	if (compatMatch && compatMatch[1].trim().length > 500) {
		issues.push(`compatibility exceeds 500 characters (${compatMatch[1].trim().length})`);
	}

	const toolsMatch = fm.match(/^allowed-tools:\s*(.+)$/m);
	if (toolsMatch) {
		const tools = toolsMatch[1].trim();
		if (!/^[A-Za-z0-9*()/,:-]+(?:\s+[A-Za-z0-9*()/,:-]+)*$/.test(tools)) {
			issues.push(`allowed-tools format: space-delimited tool names, got: "${tools.slice(0, 60)}"`);
		}
	}

	// Optional: tested-models 跨模型测试标记
	const testedRaw = extractFieldValue(fm, 'tested-models');
	if (testedRaw) {
		// Validate format: should be array-like [model1, model2] or comma-separated
		if (!/^\[[^\]]+\]$/.test(testedRaw) && !testedRaw.includes(',')) {
			issues.push('tested-models 格式建议使用 [model1, model2] 数组格式');
		}
	} else {
		issues.push('建议添加 tested-models 字段记录跨模型测试结果（如: [gpt-4, claude-3, deepseek-v4]）');
	}

	// Basic YAML validity — skip continuation lines of folded/block scalars
	const lines = fm.split("\n");
	let inBlockScalar = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		// Folded scalar continuation: lines beginning with spaces
		if (inBlockScalar && trimmed === line) {
			// Line has no leading space => block scalar ended
			inBlockScalar = false;
		} else if (inBlockScalar) {
			// Continuation line (starts with spaces) — skip
			continue;
		}
		if (!trimmed.includes(":")) {
			issues.push(`Invalid YAML line (no colon): "${trimmed.slice(0, 60)}"`);
		} else {
			// Check if value starts block scalar marker (>- | etc)
			const val = trimmed.split(":").slice(1).join(":").trim();
			if (val === ">-" || val === ">" || val === "|-" || val === "|" || val === ">+" || val === "|+") {
				inBlockScalar = true;
			}
		}
	}

	if (content.length > 0 && !content.endsWith("\n")) {
		issues.push("File should end with a trailing newline");
	}

	// Gotchas 节存在性检查
	if (!content.includes('## Gotchas') && !content.includes('## Gotcha')) {
		issues.push('建议添加 ## Gotchas 节（记录真实失败案例，gotchas 是最有价值的内容）');
	} else {
		const gotchaSection = content.match(/## Gotchas?\n([\s\S]*?)(?=\n## |$)/);
		if (gotchaSection && gotchaSection[1].trim().length < 10) {
			issues.push('Gotchas 节内容为空或仅占位符，建议追加真实失败案例');
		}
	}

	// Eval 节存在性检查
	if (!content.includes('## Eval') && !content.includes('## 评估')) {
		issues.push('建议添加 ## Eval 节（包含正例、反例、forbidden load 三类）');
	}

	// Forbidden Load 检查
	if (!content.includes('Forbidden') && !content.includes('不加载') && !content.includes('绝不')) {
		issues.push('建议添加 Forbidden Load 条件：什么场景下本 skill 不加载');
	} else {
		const forbiddenSection = content.match(/## Forbidden Load\n([\s\S]*?)(?=\n##|$)/);
		if (forbiddenSection && forbiddenSection[1].trim().length < 15) {
			issues.push('Forbidden Load 节内容过短，建议明确列出不应加载的场景');
		}
	}

	// SKILL.md 行数检查（每个 Skill 都是一种税）
	const lineCount = content.split('\n').length;
	if (lineCount > 300) {
		issues.push('SKILL.md ' + lineCount + ' 行，建议精简或拆分到 references/（每个 Skill 都是一种税，没有这句 Agent 会不会做错？不会就删）');
	}

	return issues;
}

// ═══════════════════════════════════════════════════════════
//  Skill 目录结构检查（中心短辐射厚）
// ═══════════════════════════════════════════════════════════

function checkRadiantDirs(filePath: string): string[] {
	const issues: string[] = [];
	const dir = dirname(filePath);
	const dirs = ['references', 'scripts', 'assets'];
	const missing = dirs.filter(d => !existsSync(join(dir, d)));
	if (missing.length === dirs.length) {
		issues.push('建议添加 references/ scripts/ assets/ 目录实现「辐射厚」架构（当前仅有 SKILL.md）');
	} else if (missing.length > 0) {
		issues.push('建议添加 ' + missing.join('/ ') + ' 目录完善 Skill 架构');
	}
	return issues;
}

// ═══════════════════════════════════════════════════════════
//  .ts Extension Structure Validation
// ═══════════════════════════════════════════════════════════

function validateExtensionStructure(content: string): string[] {
	const issues: string[] = [];

	if (!/export\s+default\s+(async\s+)?function/.test(content)) {
		issues.push("Missing: 'export default function (pi: ExtensionAPI)' — extension entry point");
	}

	if (!/@earendil-works\/pi-coding-agent/.test(content)) {
		issues.push("Missing import from '@earendil-works/pi-coding-agent'");
	}

	const toolPattern = /name:\s*['"]([^'"]+)['"]/g;
	let match;
	while ((match = toolPattern.exec(content)) !== null) {
		const toolName = match[1];
		if (/[A-Z-]/.test(toolName) && !toolName.includes("/")) {
			issues.push(`Tool name "${toolName}" should be snake_case (lowercase, underscores, no hyphens)`);
		}
	}

	const jsImports = content.match(/from\s+['"]\.[/.]+?\.js['"]/g);
	if (jsImports) {
		issues.push(`Use .ts imports (jiti handles TypeScript): ${jsImports.join(", ")}`);
	}

	return issues;
}

// ═══════════════════════════════════════════════════════════
//  Prompt Template Validation  (新增)
// ═══════════════════════════════════════════════════════════

function validatePromptTemplate(content: string, filePath: string): string[] {
	const issues: string[] = [];

	const fileName = basename(filePath, ".md");
	if (!/^[a-zA-Z0-9_-]+$/.test(fileName)) {
		issues.push(`Filename "${fileName}.md" contains invalid chars — only letters, digits, hyphens, underscores (becomes /command name)`);
	}

	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) {
		// No frontmatter is valid — Pi uses first non-empty line as description
		return issues;
	}
	const fm = fmMatch[1];

	const descMatch = fm.match(/^description:\s*(.+)$/m);
	if (descMatch && descMatch[1].trim().length > 200) {
		issues.push(`description exceeds 200 characters (${descMatch[1].trim().length})`);
	}

	const hintMatch = fm.match(/^argument-hint:\s*(.+)$/m);
	if (hintMatch) {
		const hint = hintMatch[1].trim();
		if (!/^<[^>]+>$/.test(hint) && !/^\[[^\]]+\]$/.test(hint)) {
			issues.push(`argument-hint should use <required> or [optional] format, got: "${hint}"`);
		}
	}

	if (content.length > 0 && !content.endsWith("\n")) {
		issues.push("File should end with a trailing newline");
	}

	return issues;
}

// ═══════════════════════════════════════════════════════════
//  Theme Validation  (新增)
// ═══════════════════════════════════════════════════════════

/** All 51 required color tokens, grouped by category for readable error messages. */
const REQUIRED_TOKENS: Record<string, string[]> = {
	"Core UI":        ["accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText"],
	"Backgrounds":    ["selectedBg", "userMessageBg", "userMessageText", "customMessageBg", "customMessageText", "customMessageLabel", "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput"],
	"Markdown":       ["mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet"],
	"Diffs":          ["toolDiffAdded", "toolDiffRemoved", "toolDiffContext"],
	"Syntax":         ["syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation"],
	"Thinking":       ["thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh"],
	"Bash Mode":      ["bashMode"],
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validateThemeColors(raw: string): string[] {
	const issues: string[] = [];

	let json: any;
	try {
		json = JSON.parse(raw);
	} catch (e: any) {
		issues.push(`Invalid JSON: ${e.message}`);
		return issues;
	}

	if (!json.name || typeof json.name !== "string") {
		issues.push('Missing or invalid "name" field (must be a string)');
	}

	if (!json.colors || typeof json.colors !== "object") {
		issues.push('Missing "colors" object');
		return issues;
	}

	const vars = json.vars || {};
	const colors = json.colors;

	// Check each group for missing tokens
	for (const [group, tokens] of Object.entries(REQUIRED_TOKENS)) {
		const missing = tokens.filter((t) => !(t in colors));
		if (missing.length > 0) {
			issues.push(`Missing ${group} color(s): ${missing.join(", ")}`);
		}
	}

	// Validate color values
	for (const [key, value] of Object.entries(colors)) {
		if (value === "") continue; // empty = terminal default
		if (typeof value === "number") {
			if (value < 0 || value > 255 || !Number.isInteger(value)) {
				issues.push(`${key} = ${value} (must be 0-255 integer for 256-color mode)`);
			}
			continue;
		}
		if (typeof value !== "string") {
			issues.push(`${key} = ${JSON.stringify(value)} (must be hex, number, empty string, or var ref)`);
			continue;
		}
		if (HEX_RE.test(value)) continue;
		// Check if it's a reference to a var
		if (vars && typeof vars === "object" && value in vars) continue;
		issues.push(`${key} = "${value}" (not a valid hex color or var reference)`);
	}

	return issues;
}

// ═══════════════════════════════════════════════════════════
//  Package Validation  (新增)
// ═══════════════════════════════════════════════════════════

function validatePackage(dirPath: string): string[] {
	const issues: string[] = [];

	const pkgPath = join(dirPath, "package.json");
	if (!existsSync(pkgPath)) {
		issues.push("Missing package.json — Pi packages need a package.json with 'pi' manifest or conventional directories");
		return issues;
	}

	let pkg: any;
	try {
		pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	} catch (e: any) {
		issues.push(`Invalid package.json: ${e.message}`);
		return issues;
	}

	// Check keywords
	const keywords: string[] = pkg.keywords || [];
	if (!keywords.includes("pi-package")) {
		issues.push('Suggested: add "pi-package" to "keywords" for gallery discoverability');
	}

	// Check pi manifest paths
	const pi: any = pkg.pi;
	if (pi && typeof pi === "object") {
		for (const resource of ["extensions", "skills", "prompts", "themes"]) {
			const paths = pi[resource];
			if (!paths) continue;
			const list = Array.isArray(paths) ? paths : [paths];
			for (const p of list) {
				if (typeof p !== "string") continue;
				const resolved = join(dirPath, p);
				if (!existsSync(resolved)) {
					issues.push(`pi.${resource} path "${p}" does not exist`);
				}
			}
		}
	} else {
		// No pi manifest — check conventional directories
		for (const dir of ["extensions", "skills", "prompts", "themes"]) {
			const fullPath = join(dirPath, dir);
			if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
				// conventional dir exists — all good
			}
		}
		// If none of the conventional directories exist, it might not be a Pi package
		const hasAnyConventional = ["extensions", "skills", "prompts", "themes"].some(
			(d) => existsSync(join(dirPath, d)),
		);
		if (!hasAnyConventional && !pi) {
			issues.push('No pi manifest or conventional directories found. Add "pi" key to package.json or create extensions/skills/prompts/themes directories.');
		}
	}

	return issues;
}

// ═══════════════════════════════════════════════════════════
//  Output Formatting
// ═══════════════════════════════════════════════════════════

function formatResult(type: string, filePath: string, issues: string[]): string {
	if (issues.length === 0) return `✅ ${type} validation passed: ${basename(filePath)}`;
	return `⚠️ ${type} validation: ${issues.length} issue${issues.length > 1 ? "s" : ""} in ${basename(filePath)}\n${issues.map((i) => `  - ${i}`).join("\n")}`;
}

function notifyResults(type: string, filePath: string, issues: string[], hint: string, ctx: any) {
	const fileName = basename(filePath);
	if (issues.length === 0) {
		let msg = `✅ ${type} validation passed: ${fileName}`;
		if (hint) msg += `\n${hint}`;
		ctx.ui.notify(msg, "info");
		ctx.ui.setWidget("meta-validator", [`✅ ${type}: ${fileName} — all checks passed`]);
		return;
	}

	ctx.ui.notify(`⚠️ ${type}: ${issues.length} issue${issues.length > 1 ? "s" : ""}`, "warning");
	const report = [`⚠️ ${type} (${issues.length}):`, ...issues.map((i) => `  - ${i}`)];
	if (hint) report.push(`\n${hint}`);
	ctx.ui.setWidget("meta-validator", report);
}
