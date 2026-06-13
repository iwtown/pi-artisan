/**
 * Skill optimization workflow — diagnose, suggest, verify improvement.
 *
 * This module follows the darwin-skill "human-in-the-loop" principle:
 *   🔍 diagnose   → find weakest dimension
 *   💡 suggest    → generate actionable improvement plan
 *   ✅ re-evaluate → user edits, then re-score to verify improvement
 *   📊 report     → before/after comparison
 *
 * pi-artisan does NOT auto-edit SKILL.md files. All improvements are
 * proposed as suggestions for the user to implement.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { evaluateSkill, getImprovementSuggestions, type RubricResult } from "./rubric.js";
import type { ValidationIssue } from "../types.js";
import { validateSkill } from "../validators/skill.js";

// ── Types ──

export interface DiagnosticResult {
  filePath: string;
  skillName: string;
  evaluation: RubricResult;
  suggestions: string[];
  validationIssues: ValidationIssue[];
  hasBlockers: boolean;    // validation issues that prevent publishing
}

export interface ReEvaluationResult {
  filePath: string;
  before: RubricResult;
  after: RubricResult;
  improved: boolean;
  delta: number;           // total score change
  report: string;          // human-readable comparison
}

// ── Public API ──

/**
 * Run a full diagnostic on a SKILL.md file.
 *
 * 1. Validates structure (pi-artisan's standard checks)
 * 2. Evaluates 8-dimension Rubric
 * 3. Generates improvement suggestions
 *
 * Does NOT edit files.
 */
export function diagnoseSkill(filePath: string): DiagnosticResult {
  const content = readFileSync(filePath, "utf-8");
  const skillName = basename(filePath.replace(/\/SKILL\.md$/, ""));

  // Step 1: Standard validation
  const validationIssues = validateSkill(filePath);
  const hasBlockers = validationIssues.length > 0;

  // Step 2: Rubric evaluation
  const evaluation = evaluateSkill(content, filePath);

  // Step 3: Improvement suggestions
  const suggestions = getImprovementSuggestions(evaluation);

  return {
    filePath,
    skillName,
    evaluation,
    suggestions,
    validationIssues,
    hasBlockers,
  };
}

/**
 * Re-evaluate after user edits. Compares before/after scores.
 */
export function reEvaluateSkill(
  filePath: string,
  beforeResult: RubricResult,
): ReEvaluationResult {
  const content = readFileSync(filePath, "utf-8");
  const after = evaluateSkill(content, filePath);

  const delta = after.total - beforeResult.total;
  const improved = delta > 0;

  const report = buildReport(beforeResult, after, delta);
  return { filePath, before: beforeResult, after, improved, delta, report };
}

// ── Report formatting ──

function buildReport(before: RubricResult, after: RubricResult, delta: number): string {
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const lines: string[] = [];

  lines.push(`┌─ 📊 优化前后对比 ───────────────────────────────────┐`);
  lines.push(`│ ${basename(after.filePath)}                        `);
  lines.push(`├────────────────────────────────────────────────────┤`);
  lines.push(`│ 总分: ${before.total} → ${after.total}  ${arrow}${Math.abs(delta)}        │`);
  lines.push(`├────┬──────────┬──────┬──────┬──────┬──────────────┤`);
  lines.push(`│ #  │ 维度     │ 权重 │ 前   │ 后   │ Δ            │`);
  lines.push(`├────┼──────────┼──────┼──────┼──────┼──────────────┤`);

  for (const aDim of after.dimensions) {
    const bDim = before.dimensions.find((d) => d.id === aDim.id);
    const bScore = bDim?.score ?? aDim.score;
    const d = aDim.score - bScore;
    const dStr = d > 0 ? `+${d}` : d === 0 ? " 0" : `${d}`;
    const testNote = aDim.testRequired ? " (需实测)" : "";
    lines.push(
      `│ ${String(aDim.id).padStart(2)} │ ${aDim.label.padEnd(8)} │  ${String(aDim.weight).padStart(3)} │  ${bScore}/10 │  ${aDim.score}/10 │ ${dStr}${testNote}        │`,
    );
  }

  lines.push(`├────┴──────────┴──────┴──────┴──────┴──────────────┤`);

  // Top/bottom dimensions
  const sortedAfter = [...after.dimensions].filter((d) => !d.testRequired).sort((a, b) => a.score - b.score);
  const weakest = sortedAfter.slice(0, 2);
  const strongest = sortedAfter.slice(-2).reverse();
  if (weakest.length > 0) {
    lines.push(`│ 待改进: ${weakest.map((d) => `${d.label}(${d.score}/10)`).join(", ")}`);
  }
  if (strongest.length > 0) {
    lines.push(`│ 优势:   ${strongest.map((d) => `${d.label}(${d.score}/10)`).join(", ")}`);
  }

  lines.push(`└────────────────────────────────────────────────────┘`);
  return lines.join("\n");
}

/**
 * Format a diagnostic result as a human-readable TUI string.
 */
export function formatDiagnostic(diag: DiagnosticResult): string {
  const lines: string[] = [];

  lines.push(`┌─ 🔍 Rubric 评估: ${diag.skillName} ${'─'.repeat(Math.max(2, 56 - diag.skillName.length))}┐`);
  lines.push(`│ 总分: ${diag.evaluation.total}/100${' '.repeat(40)}│`);
  lines.push(`├────┬──────────┬──────┬──────┬──────────────────────────┤`);
  lines.push(`│ #  │ 维度     │ 权重 │ 得分 │ 理由                     │`);
  lines.push(`├────┼──────────┼──────┼──────┼──────────────────────────┤`);

  for (const d of diag.evaluation.dimensions) {
    const testMark = d.testRequired ? " ⚠" : "  ";
    const reason = d.reason.length > 25 ? d.reason.slice(0, 22) + "…" : d.reason;
    lines.push(
      `│ ${String(d.id).padStart(2)} │ ${d.label.padEnd(8)} │  ${String(d.weight).padStart(3)} │  ${d.score}/10${testMark} │ ${reason.padEnd(25)} │`,
    );
  }

  lines.push(`├────┴──────────┴──────┴──────┴──────────────────────────┤`);
  lines.push(`│ ${diag.evaluation.summary}`);
  lines.push(`├────────────────────────────────────────────────────┤`);

  // Evidence details for each dimension
  const hasEvidence = diag.evaluation.dimensions.some((d) => d.evidence && d.evidence.length > 0);
  if (hasEvidence) {
    for (const d of diag.evaluation.dimensions) {
      if (!d.evidence || d.evidence.length === 0) continue;
      lines.push(`│ ${d.label} (${d.score}/10):`);
      for (const e of d.evidence) {
        for (const line of e.split("\n")) {
          const wrapped = line.length > 74 ? line.slice(0, 71) + "..." : line;
          lines.push(`│   · ${wrapped}`);
        }
      }
    }
    lines.push(`├────────────────────────────────────────────────────┤`);
  }

  if (diag.validationIssues.length > 0) {
    lines.push(`│ ⚠️ 校验问题 (${diag.validationIssues.length}):`);
    for (const issue of diag.validationIssues.slice(0, 5)) {
      const msg = issue.message.length > 68 ? issue.message.slice(0, 65) + "..." : issue.message;
      lines.push(`│   - ${msg}`);
    }
    if (diag.validationIssues.length > 5) {
      lines.push(`│   ... 还有 ${diag.validationIssues.length - 5} 个问题`);
    }
    lines.push(`├────────────────────────────────────────────────────┤`);
  }

  lines.push(`│ 💡 改进建议:`);
  for (const s of diag.suggestions) {
    for (const line of s.split("\n")) {
      const wrapped = line.length > 74 ? line.slice(0, 71) + "..." : line;
      lines.push(`│   ${wrapped}`);
    }
  }

  lines.push(`└────────────────────────────────────────────────────┘`);
  return lines.join("\n");
}
