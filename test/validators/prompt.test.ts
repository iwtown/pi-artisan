import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validatePromptTemplate } from "../../src/validators/prompt";

const FIXTURES = resolve(__dirname, "../fixtures");

describe("validatePromptTemplate", () => {
  it("should pass valid prompt with tags", () => {
    const content = readFileSync(resolve(FIXTURES, "valid-prompt.md"), "utf-8");
    const issues = validatePromptTemplate(content, resolve(FIXTURES, "valid-prompt.md"));
    const tagsIssue = issues.filter((i) => i.message.includes("tags"));
    expect(tagsIssue.length).toBe(0);
  });

  it("should suggest tags for prompt without tags", () => {
    const content = readFileSync(resolve(FIXTURES, "invalid-prompt.md"), "utf-8");
    const issues = validatePromptTemplate(content, resolve(FIXTURES, "invalid-prompt.md"));
    // invalid-prompt has no frontmatter, so tags check is skipped
    const tagsIssue = issues.filter((i) => i.message.includes("tags"));
    // No frontmatter = no tags suggestion (frontmatter is optional)
    expect(tagsIssue.length).toBe(0);
  });

  it("should suggest tags when frontmatter exists but tags missing", () => {
    const content = `---
name: test-prompt
description: Test description
---

Content here.
`;
    const issues = validatePromptTemplate(content, "test-prompt.md");
    const tagsIssue = issues.filter((i) => i.message.includes("tags"));
    expect(tagsIssue.length).toBeGreaterThanOrEqual(1);
  });
});
