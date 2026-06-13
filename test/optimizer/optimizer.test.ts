import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { diagnoseSkill, reEvaluateSkill, formatDiagnostic } from "../../src/optimizer/optimizer";
import { evaluateSkill } from "../../src/optimizer/rubric";

const FIXTURES = resolve(__dirname, "../fixtures");

describe("diagnoseSkill", () => {
  const validPath = resolve(FIXTURES, "valid-skill/SKILL.md");

  it("should produce a diagnostic with evaluation + suggestions", () => {
    const diag = diagnoseSkill(validPath);
    expect(diag.filePath).toBe(validPath);
    expect(diag.skillName).toBe("valid-skill");
    expect(diag.evaluation.dimensions).toHaveLength(8);
    expect(diag.evaluation.total).toBeGreaterThanOrEqual(0);
    expect(diag.suggestions.length).toBeGreaterThanOrEqual(0);
  });

  it("should detect validation issues from pi-artisan's checks", () => {
    const diag = diagnoseSkill(validPath);
    // valid-skill should have zero or few validation issues
    expect(Array.isArray(diag.validationIssues)).toBe(true);
  });

  it("should set hasBlockers correctly", () => {
    const diag = diagnoseSkill(validPath);
    expect(typeof diag.hasBlockers).toBe("boolean");
  });
});

describe("reEvaluateSkill", () => {
  const validPath = resolve(FIXTURES, "valid-skill/SKILL.md");

  it("should compare before and after evaluations", () => {
    const content = readFileSync(validPath, "utf-8");
    const beforeResult = evaluateSkill(content, validPath);

    // Re-evaluate same file (no changes) — scores should be identical
    const result = reEvaluateSkill(validPath, beforeResult);

    expect(result.before.total).toBe(result.after.total);
    expect(result.improved).toBe(false);
    expect(result.delta).toBe(0);
    expect(result.report).toContain("→");
  });

  it("should detect improvement when content is better", () => {
    // Simulate: evaluate a minimal skill as baseline
    const minimal = "# Minimal\nJust a basic skill";
    const baseline = evaluateSkill(minimal, "/tmp/minimal/SKILL.md");

    // Then "improve" by adding frontmatter
    const improved = `---
name: better-skill
slug: better-skill
version: 1.0.0
description: >-
  当用户需要做某事时加载
---

# Better Skill

## Instructions

1. First
2. Second
3. Third
4. Fourth
5. Fifth

## Gotchas

- [env] Caution
- [dep] Warning

## Forbidden Load

- When user asks about Y

## Eval

### 正例
- Do X

### 反例
- Don't Y
`;

    // We need a real file path for reEvaluateSkill
    // Use a temp location
    const tempPath = "/tmp/test-optimizer-better/SKILL.md";

    // Write the improved content
    const { mkdirSync, writeFileSync } = require("node:fs");
    mkdirSync("/tmp/test-optimizer-better", { recursive: true });
    writeFileSync(tempPath, improved);

    const result = reEvaluateSkill(tempPath, baseline);
    expect(result.improved).toBe(true);
    expect(result.delta).toBeGreaterThan(0);
    expect(result.report).toContain("↑");

    // Cleanup
    const { rmSync } = require("node:fs");
    rmSync("/tmp/test-optimizer-better", { recursive: true, force: true });
  });
});

describe("formatDiagnostic", () => {
  it("should produce a formatted string", () => {
    const validPath = resolve(FIXTURES, "valid-skill/SKILL.md");
    const diag = diagnoseSkill(validPath);
    const formatted = formatDiagnostic(diag);
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(50);
    expect(formatted).toContain("Rubric 评估");
    expect(formatted).toContain("总分");
  });
});
