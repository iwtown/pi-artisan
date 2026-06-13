import { describe, it, expect } from "vitest";
import { validateSkillFrontmatter } from "../../src/validators/skill";
import { validatePromptTemplate } from "../../src/validators/prompt";

describe("Edge cases — skill validator", () => {
  it("handles empty content", () => {
    const issues = validateSkillFrontmatter("");
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toContain("Missing");
  });

  it("handles no frontmatter", () => {
    const issues = validateSkillFrontmatter("Just markdown\n\nWith content");
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toContain("Missing YAML frontmatter");
  });

  it("accepts version with pre-release suffix", () => {
    const issues = validateSkillFrontmatter("---\nname: test-skill\nversion: 1.0.0-beta.1\ndescription: 当用户需要测试时加载。\n---");
    expect(issues.filter(i => i.message.includes("version")).every(i => !i.message.includes("not valid semver"))).toBe(true);
  });

  it("accepts 当用户 in middle of description", () => {
    const issues = validateSkillFrontmatter("---\nname: test-skill\nversion: 1.0.0\ndescription: 这个工具当用户需要代码审查时自动加载。\n---");
    const triggerIssues = issues.filter(i => i.message.includes("触发场景") || i.message.includes("功能说明"));
    expect(triggerIssues.length).toBe(0);
  });

  it("detects Eval with ### subheadings (not ##)", () => {
    const content = `---
name: test-skill
version: 1.0.0
description: 当用户需要测试时加载。
---

## Eval
### 正例
- User asks

### 反例
- User writes
`;
    const issues = validateSkillFrontmatter(content);
    expect(issues.filter(i => i.message.includes("正例") && i.message.includes("缺少"))).toHaveLength(0);
    expect(issues.filter(i => i.message.includes("反例") && i.message.includes("缺少"))).toHaveLength(0);
  });

  it("detects Forbidden Load with heading", () => {
    const content = `---
name: test-skill
version: 1.0.0
description: 当用户需要测试时加载。
---

## Forbidden Load
- Not when chatting
`;
    const issues = validateSkillFrontmatter(content);
    const fbIssues = issues.filter(i => i.message.includes("Forbidden") && i.message.includes("建议"));
    expect(fbIssues).toHaveLength(0);
  });

  it("accepts block scalar description with >-", () => {
    const content = `---
name: test-skill
version: 1.0.0
description: >-
  当用户需要测试质量门控功能时加载。
---
`;
    const issues = validateSkillFrontmatter(content);
    const descIssues = issues.filter(i => i.message.includes("description"));
    expect(descIssues.filter(i => i.message.includes("Missing"))).toHaveLength(0);
  });
});

describe("Edge cases — prompt validator", () => {
  it("suggests tags when frontmatter exists but no tags field", () => {
    const content = "---\ndescription: Test\n---\n\nContent";
    const issues = validatePromptTemplate(content, "test-prompt.md");
    expect(issues.some(i => i.message.includes("tags"))).toBe(true);
  });

  it("does not suggest tags when there is no frontmatter", () => {
    const content = "Just content";
    const issues = validatePromptTemplate(content, "test-prompt.md");
    expect(issues.some(i => i.message.includes("tags"))).toBe(false);
  });
});
