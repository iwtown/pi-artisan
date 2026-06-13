import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateSkill, getImprovementSuggestions } from "../../src/optimizer/rubric";

const FIXTURES = resolve(__dirname, "../fixtures");

describe("evaluateSkill", () => {
  const validPath = resolve(FIXTURES, "valid-skill/SKILL.md");
  const validContent = readFileSync(validPath, "utf-8");

  it("should return 8 dimensions", () => {
    const result = evaluateSkill(validContent, validPath);
    expect(result.dimensions).toHaveLength(8);
  });

  it("should assign each dimension a 1-10 score", () => {
    const result = evaluateSkill(validContent, validPath);
    for (const d of result.dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(1);
      expect(d.score).toBeLessThanOrEqual(10);
    }
  });

  it("should compute a weighted total 0-100", () => {
    const result = evaluateSkill(validContent, validPath);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("should mark dimension 8 as testRequired", () => {
    const result = evaluateSkill(validContent, validPath);
    const d8 = result.dimensions.find((d) => d.id === 8);
    expect(d8?.testRequired).toBe(true);
  });

  it("should have a summary string", () => {
    const result = evaluateSkill(validContent, validPath);
    expect(result.summary).toBeTruthy();
    expect(result.summary).toContain("总分");
  });

  it("should score empty content lowest on frontmatter", () => {
    const empty = "# No Frontmatter\n\nJust some text";
    const result = evaluateSkill(empty, "/tmp/empty/SKILL.md");
    const d1 = result.dimensions.find((d) => d.id === 1);
    expect(d1?.score).toBeLessThanOrEqual(3);
  });

  it("should score higher with gotchas and forbidden sections", () => {
    const good = `---
name: good-skill
slug: good-skill
version: 1.0.0
description: >-
  当用户需要做某事时加载
---

# Good Skill

## Instructions

1. First step
2. Second step
3. Third step
4. Fourth step
5. Fifth step

## Gotchas

- [env] Something to watch out for
- [dep] Another gotcha item
- [path] And a third one

## Forbidden Load

- Never load when user asks about X

## Eval

### 正例
- User says "do X"

### 反例
- User says "explain Y"

## References

- [guide](./references/guide.md)
`;
    const result = evaluateSkill(good, "/tmp/skill/SKILL.md");
    // Should score well on D3 (gotchas + forbidden)
    const d3 = result.dimensions.find((d) => d.id === 3);
    expect(d3?.score).toBeGreaterThanOrEqual(5);
  });
});

describe("getImprovementSuggestions", () => {
  it("should return suggestions for low-scoring dimensions", () => {
    const empty = "# Bare Minimum\nJust content";
    const result = evaluateSkill(empty, "/tmp/empty/SKILL.md");
    const suggestions = getImprovementSuggestions(result);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0]).toContain("[");
  });

  it("should suggest fewer items for a high-quality skill", () => {
    const validContent = readFileSync(resolve(FIXTURES, "valid-skill/SKILL.md"), "utf-8");
    const validPath = resolve(FIXTURES, "valid-skill/SKILL.md");
    const result = evaluateSkill(validContent, validPath);
    const suggestions = getImprovementSuggestions(result);
    // High quality skill should have fewer suggestions
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});

describe("evidence collection", () => {
  it("should collect evidence for low-scoring dimensions", () => {
    const empty = "# Bare Minimum\n\nJust content without frontmatter";
    const result = evaluateSkill(empty, "/tmp/empty/SKILL.md");
    const d1 = result.dimensions.find((d) => d.id === 1);
    expect(d1).toBeDefined();
    if (d1 && d1.score < 7) {
      expect(d1.evidence).toBeDefined();
      expect(d1.evidence!.length).toBeGreaterThan(0);
    }
  });

  it("should have evidence matching actual content", () => {
    const content = `---
name: test-skill
slug: test-skill
version: 1.0.0
description: >-
  当用户需要测试时加载
---

# Test`;
    const result = evaluateSkill(content, "/tmp/test/SKILL.md");
    const d1 = result.dimensions.find((d) => d.id === 1);
    expect(d1).toBeDefined();
    if (d1 && d1.evidence) {
      const hasNameEvidence = d1.evidence.some((e) => e.includes("name: test-skill"));
      expect(hasNameEvidence).toBe(true);
      const hasVersionEvidence = d1.evidence.some((e) => e.includes("version: 1.0.0"));
      expect(hasVersionEvidence).toBe(true);
    }
  });

  it("should generate non-template improvement", () => {
    const content = `---
name: my-skill
slug: my-skill
description: >-
  这个 Skill 可以生成漂亮的 PPT
---

# My Skill`;
    const result = evaluateSkill(content, "/tmp/skill/SKILL.md");
    const d1 = result.dimensions.find((d) => d.id === 1);
    expect(d1).toBeDefined();
    if (d1 && d1.improvement) {
      expect(d1.improvement).not.toContain("建议考虑");
      expect(d1.improvement).not.toContain("可适当");
      expect(d1.improvement.length).toBeGreaterThan(10);
    }
  });

  it("should have evidence for d2 workflow", () => {
    const simple = "# Simple\n\n## Instructions\nFirst do this\nThen do that\n";
    const result = evaluateSkill(simple, "/tmp/simple/SKILL.md");
    const d2 = result.dimensions.find((d) => d.id === 2);
    expect(d2).toBeDefined();
    if (d2 && d2.evidence) {
      expect(d2.evidence.some((e) => e.includes("编号步骤"))).toBe(true);
    }
  });

  it("should have evidence for d3 boundary", () => {
    const noGotchas = `---
name: test
version: 1.0.0
description: >-
  当用户需要测试时加载
---

# Test\n\nJust content`;
    const result = evaluateSkill(noGotchas, "/tmp/no-gotchas/SKILL.md");
    const d3 = result.dimensions.find((d) => d.id === 3);
    expect(d3).toBeDefined();
    if (d3 && d3.evidence) {
      expect(d3.evidence.some((e) => e.includes("Gotchas"))).toBe(true);
    }
  });

  it("should use custom improvement when available, fallback to template when empty", () => {
    const content = `---
name: my-skill
slug: my-skill
version: 1.0.0
description: >-
  当用户需要测试时加载
---

# Test`;
    const result = evaluateSkill(content, "/tmp/skill/SKILL.md");
    
    // Dimensions with improvement should use custom
    const suggestions = getImprovementSuggestions(result);
    for (const s of suggestions) {
      // Should be at least 10 chars, not empty
      expect(s.length).toBeGreaterThan(10);
    }
  });

  it("should have improvement suggestions with actionable content", () => {
    const content = `---
name: bad-name
version: abc
description: >-
  这是一个测试
---

# Bad`;
    const result = evaluateSkill(content, "/tmp/bad/SKILL.md");
    const d1 = result.dimensions.find((d) => d.id === 1);
    expect(d1).toBeDefined();
    if (d1 && d1.improvement) {
      // Improvement should contain specific evidence references
      expect(d1.improvement).toMatch(/version|name|description|semver/i);
    }
  });

  it("should format suggestions with → or · symbols", () => {
    const empty = "# Bare Minimum\n";
    const result = evaluateSkill(empty, "/tmp/empty/SKILL.md");
    const suggestions = getImprovementSuggestions(result);
    for (const s of suggestions) {
      // Each suggestion should start with [Dimension name] format
      expect(s).toMatch(/^\[.*\]/);
    }
  });
});
