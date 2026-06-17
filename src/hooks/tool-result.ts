/**
 * tool_result hook — 全类型适配改造检查，零遗漏
 *
 * 覆盖所有安装路径：
 *   1. write/edit → 从文件路径检测资源，运行 adaptResource + validator
 *   2. bash → 重扫全部资源目录，与快照差分，新资源自动适配检查
 *   3. settings.json 变更 → 检测 packages[] 变化
 *
 * 外部安装（skillhub/npm/git/cp）被 bash 重扫全部捕获。
 * 非阻塞：只警告，不阻止写入。-p 模式静默。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { GLOBAL_DIRS } from "../utils/path.js";
import { adaptResource, formatAdaptReport } from "../adaptation/engine.js";
import { scanResources } from "../catalog/scanner.js";
import type { ResourceInfo, ResourceType } from "../types.js";
import { validateSkill } from "../validators/skill.js";
import { validateExtensionStructure } from "../validators/extension.js";
import { pendingPaths } from "./tool-call.js";

// ─────────────────────────────────────────────
//  资源快照 — 用于检测新增资源
// ─────────────────────────────────────────────

let knownResources: Set<string> | null = null;

function snapKey(r: ResourceInfo): string {
  return `${r.type}:${r.name}`;
}

function takeSnapshot(): Set<string> {
  return new Set(scanResources().map(snapKey));
}

function ensureSnapshot(): void {
  if (knownResources === null) knownResources = takeSnapshot();
}

// ─────────────────────────────────────────────
//  文件路径 → 资源检测
// ─────────────────────────────────────────────

interface DetectedResource {
  type: ResourceType;
  name: string;
  path: string;
}

/** 判断一个文件路径是否属于某个已知资源类型 */
function detectResource(filePath: string): DetectedResource | "package" | null {
  const settingsPath = join(process.env.HOME || "/home/wtown", ".pi", "agent", "settings.json");

  if (filePath === settingsPath) return "package";

  if (filePath.startsWith(GLOBAL_DIRS.skills)) {
    const rel = relative(GLOBAL_DIRS.skills, filePath);
    const name = rel.split("/")[0];
    if (!name) return null;
    const skillPath = join(GLOBAL_DIRS.skills, name, "SKILL.md");
    return { type: "skill" as const, name, path: existsSync(skillPath) ? skillPath : filePath };
  }

  if (filePath.startsWith(GLOBAL_DIRS.extensions) && /\.(ts|js)$/.test(filePath)) {
    const rel = relative(GLOBAL_DIRS.extensions, filePath);
    if (basename(filePath) === "index.ts" || basename(filePath) === "index.js") {
      return { type: "extension" as const, name: rel.split("/")[0], path: filePath };
    }
    const name = basename(rel).replace(/\.(ts|js)$/, "");
    return { type: "extension" as const, name, path: filePath };
  }

  if (filePath.startsWith(GLOBAL_DIRS.prompts) && filePath.endsWith(".md")) {
    return { type: "prompt" as const, name: basename(filePath, ".md"), path: filePath };
  }

  if (filePath.startsWith(GLOBAL_DIRS.themes) && filePath.endsWith(".json")) {
    return { type: "theme" as const, name: basename(filePath, ".json"), path: filePath };
  }

  return null;
}

function toResourceInfo(d: DetectedResource): ResourceInfo {
  return {
    type: d.type,
    name: d.name,
    path: d.path,
    version: null,
    author: null,
    source: "local",
    lastModified: new Date().toISOString(),
    qualityScore: null,
    status: "active" as const,
  };
}

// ─────────────────────────────────────────────
//  Hook 注册
// ─────────────────────────────────────────────

export function setupToolResultHook(pi: ExtensionAPI): void {
  pi.on("tool_result", async (event: any, ctx: any) => {
    if (event.isError) return;
    ensureSnapshot();

    const toolName = event.toolName;
    const hasUI = ctx?.hasUI;
    const notify = ctx?.ui?.notify?.bind(ctx.ui);
    const sendMsg = pi.sendUserMessage?.bind(pi);

    // ── write/edit — 从文件路径检测资源 ──
    if (toolName === "write" || toolName === "edit") {
      const filePath = pendingPaths.get(event.toolCallId);
      if (!filePath) return;
      pendingPaths.delete(event.toolCallId);
      await handleWriteEdit(filePath, hasUI, notify, sendMsg);
      return;
    }

    // ── bash — 快照差分检测新增 ──
    if (toolName === "bash") {
      await handleBash(hasUI, notify, sendMsg);
      return;
    }
  });
}

// ─────────────────────────────────────────────
//  write/edit 处理
// ─────────────────────────────────────────────

async function handleWriteEdit(
  filePath: string,
  hasUI: boolean,
  notify: ((msg: string, level: "info" | "warning" | "error") => void) | undefined,
  sendMsg: ((content: string | any[], options?: any) => void) | undefined,
): Promise<void> {
  const detected = detectResource(filePath);

  // settings.json → 检测新增 package
  if (detected === "package") {
    const oldKeys = knownResources!;
    knownResources = takeSnapshot();
    const newPkgKeys = [...knownResources].filter(
      (k) => k.startsWith("package:") && !oldKeys.has(k),
    );
    if (newPkgKeys.length > 0) {
      const resources = scanResources();
      for (const key of newPkgKeys) {
        const pkgName = key.slice("package:".length);
        const pkg = resources.find((r) => r.type === "package" && r.name === pkgName);
        if (!pkg) continue;
        const report = adaptResource(pkg);
        if (hasUI && notify) {
          notify(
            `🆕 [package] ${pkgName}\n${report.allPassed ? "✅ 适配通过" : `🔴 ${report.criticalCount} critical, 🟠 ${report.errorCount} error`}`,
            report.allPassed ? "info" : "warning",
          );
        }
        if (!report.allPassed && sendMsg) {
          sendMsg(`🧰 pi-artisan: 新 package "${pkgName}" 适配检查未通过（${report.criticalCount} critical, ${report.errorCount} error）。运行 /adapt 查看详情。`, { deliverAs: "followUp" });
        }
      }
    }
    return;
  }

  if (!detected) return;

  // 标准资源类型 — 适配检查
  const resource = toResourceInfo(detected);
  const report = adaptResource(resource);

  // 格式校验（作为补充细节）
  let extraLines: string[] = [];
  if (detected.type === "skill") {
    try {
      extraLines = validateSkill(detected.path).map((i) => `  · ${i.message}`);
    } catch {}
  } else if (detected.type === "extension") {
    try {
      extraLines = validateExtensionStructure(readFileSync(detected.path, "utf-8")).map(
        (i) => `  · ${i.message}`,
      );
    } catch {}
  }

  const hasIssues = !report.allPassed || extraLines.length > 0;

  // TUI 通知
  if (hasUI && notify) {
    if (!hasIssues) {
      notify(`✅ ${detected.name} (${detected.type}) — 适配通过`, "info");
    } else {
      const lines: string[] = [];
      if (report.allPassed) {
        lines.push(`✅ ${detected.name} (${detected.type}) — 适配通过`);
      } else {
        lines.push(`⚠️ ${detected.name} (${detected.type}) — 适配未通过`);
        const summary = formatAdaptReport(report);
        for (const line of summary.split("\n").slice(1)) {
          if (!line.includes("全部")) lines.push(`  ${line.trim()}`);
        }
      }
      const capped = extraLines.slice(0, 3);
      lines.push(...capped);
      if (extraLines.length > 3) {
        lines.push(`  · ...及 ${extraLines.length - 3} 个格式问题`);
      }
      notify(lines.join("\n"), report.allPassed ? "info" : "warning");
    }
  }

  // 主动消息（-p 模式下的主动路由）
  if (hasIssues && sendMsg) {
    let msg = `🧰 pi-artisan: ${detected.type} \"${detected.name}\"`;
    if (!report.allPassed) {
      msg += ` 适配检查未通过（${report.criticalCount} critical, ${report.errorCount} error）。${extraLines.length > 0 ? `格式校验有 ${extraLines.length} 项问题。` : ""}修复后可通过 /adapt 重新检查。`;
    } else if (extraLines.length > 0) {
      msg += ` 格式校验有 ${extraLines.length} 项问题需关注。`;
    }
    sendMsg(msg, { deliverAs: "followUp" });
  }

  // 更新快照
  knownResources!.add(snapKey(resource));
}

// ─────────────────────────────────────────────
//  bash 处理 — 快照差分检测外部安装
// ─────────────────────────────────────────────

async function handleBash(
  hasUI: boolean,
  notify: ((msg: string, level: "info" | "warning" | "error") => void) | undefined,
  sendMsg: ((content: string | any[], options?: any) => void) | undefined,
): Promise<void> {
  const oldKeys = knownResources!;
  const newSnapshot = takeSnapshot();

  const newKeys: string[] = [];
  for (const key of newSnapshot) {
    if (!oldKeys.has(key)) newKeys.push(key);
  }

  if (newKeys.length === 0) {
    knownResources = newSnapshot;
    return;
  }

  const resources = scanResources();

  for (const key of newKeys) {
    const colonIdx = key.indexOf(":");
    const type = key.slice(0, colonIdx);
    const name = key.slice(colonIdx + 1);
    const resource = resources.find((r) => r.type === type && r.name === name);
    if (!resource) continue;

    const report = adaptResource(resource);
    knownResources!.add(key); // ensure it's tracked even if scan failed later

    if (hasUI && notify) {
      if (report.allPassed) {
        notify(`🆕 ${name} (${type})\n✅ 适配通过`, "info");
      } else {
        const lines = [`🆕 ${name} (${type})`];
        const summary = formatAdaptReport(report);
        for (const line of summary.split("\n").slice(1)) {
          if (!line.includes("全部")) lines.push(`  ${line.trim()}`);
        }
        notify(lines.join("\n"), "warning");
      }
    }

    // +主动路由: 新增资源有适配问题时通知 agent
    if (!report.allPassed && sendMsg) {
      sendMsg(`🧰 pi-artisan: 检测到新 ${type} "${name}"，适配检查未通过（${report.criticalCount} critical, ${report.errorCount} error）。修复后可通过 /adapt 重新检查。`, { deliverAs: "followUp" });
    }
  }

  knownResources = newSnapshot;
}
