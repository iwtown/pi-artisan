import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSkillFrontmatter, checkRadiantDirs, validateSkill } from "../../src/validators/skill";

const FIXTURES = resolve(__dirname, "../fixtures");

describe("validateSkillFrontmatter", () => {
  // ── Version check ──
  describe("version field", () => {
    it("should pass valid semver version", () => {
      const content = readFileSync(resolve(FIXTURES, "valid-skill/SKILL.md"), "utf-8");
      const issues = validateSkillFrontmatter(content);
      const versionIssues = issues.filter((i) => i.message.includes("version"));
      expect(versionIssues.length).toBe(0);
    });

    it("should fail on missing version", () => {
      const content = readFileSync(resolve(FIXTURES, "invalid-skill/SKILL.md"), "utf-8");
      const issues = validateSkillFrontmatter(content);
      const versionIssues = issues.filter((i) => i.message.includes("version"));
      expect(versionIssues.length).toBeGreaterThanOrEqual(1);
      expect(versionIssues[0].message).toContain("Missing required field: version");
    });
  });

  // ── Gotchas check ──
  describe("gotchas section", () => {
    it("should pass valid gotchas with actual entries", () => {
      const content = readFileSync(resolve(FIXTURES, "valid-skill/SKILL.md"), "utf-8");
      const issues = validateSkillFrontmatter(content);
      const gotchaPlaceholderIssues = issues.filter((i) => i.message.includes("占位符") || i.message.includes("缺少实际条目"));
      expect(gotchaPlaceholderIssues.length).toBe(0);
    });

    it("should detect placeholder gotchas", () => {
      const content = readFileSync(resolve(FIXTURES, "invalid-skill/SKILL.md"), "utf-8");
      const issues = validateSkillFrontmatter(content);
      const gotchaIssues = issues.filter(
        (i) => i.message.includes("占位符") || i.message.includes("缺少实际条目") || i.message.includes("为空"),
      );
      expect(gotchaIssues.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Eval section ──
  describe("eval section", () => {
    it("should pass valid eval with 正例 and 反例 subsections", () => {
      const content = readFileSync(resolve(FIXTURES, "valid-skill/SKILL.md"), "utf-8");
      const issues = validateSkillFrontmatter(content);
      const prosIssues = issues.filter((i) => i.message.includes("正例"));
      const consIssues = issues.filter((i) => i.message.includes("反例"));
      expect(prosIssues.length).toBe(0);
      expect(consIssues.length).toBe(0);
    });

    it("should fail eval without 正例 and 反例 subsections", () => {
      const content = readFileSync(resolve(FIXTURES, "invalid-skill/SKILL.md"), "utf-8");
      const issues = validateSkillFrontmatter(content);
      const evalIssues = issues.filter((i) => i.message.includes("Eval") || i.message.includes("正例") || i.message.includes("反例"));
      expect(evalIssues.length).toBeGreaterThanOrEqual(1);
      const hasProsCheck = evalIssues.some((i) => i.message.includes("正例"));
      expect(hasProsCheck).toBe(true);
    });
  });

  // ── Forbidden Load ──
  describe("forbidden load section", () => {
    it("should pass valid forbidden load with actual entries", () => {
      const content = readFileSync(resolve(FIXTURES, "valid-skill/SKILL.md"), "utf-8");
      const issues = validateSkillFrontmatter(content);
      const fbIssues = issues.filter((i) => i.message.includes("Forbidden") || i.message.includes("不加载"));
      const placeholderIssues = fbIssues.filter((i) => i.message.includes("占位符") || i.message.includes("缺少实际条目"));
      expect(placeholderIssues.length).toBe(0);
    });

    it("should detect placeholder forbidden load", () => {
      const content = readFileSync(resolve(FIXTURES, "invalid-skill/SKILL.md"), "utf-8");
      const issues = validateSkillFrontmatter(content);
      const fbIssues = issues.filter((i) => i.message.includes("占位符") || i.message.includes("缺少实际条目"));
      expect(fbIssues.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("checkRadiantDirs", () => {
  it("should pass valid skill with non-empty radiant dirs", () => {
    const issues = checkRadiantDirs(resolve(FIXTURES, "valid-skill/SKILL.md"));
    const emptyDirIssues = issues.filter((i) => i.message.includes("为空"));
    expect(emptyDirIssues.length).toBe(0);
  });

  it("should suggest radiant dirs for skill without them", () => {
    // invalid-skill has no radiant dirs
    const issues = checkRadiantDirs(resolve(FIXTURES, "invalid-skill/SKILL.md"));
    const dirIssues = issues.filter((i) => i.message.includes("建议添加"));
    expect(dirIssues.length).toBeGreaterThanOrEqual(1);
  });
});

  // ── allowed-tools regex fix ──
  describe("allowed-tools format", () => {
    it("should accept tool names with underscores", () => {
      const content = `---\nname: test-skill\nversion: 1.0.0\ndescription: "当用户需要 X 时加载"\nallowed-tools: read_file write_file Bash(opencli:*)\ntested-models: [gpt-4]\n---\n# Test\n## Eval\n### 正例\n- test\n### 反例\n- test\n## Forbidden Load\n- not relevant\n`;
      const issues = validateSkillFrontmatter(content);
      const formatIssues = issues.filter((i) => i.message.includes("allowed-tools format"));
      expect(formatIssues.length).toBe(0);
    });
  });

  // ── YAML list in tested-models ──
  describe("tested-models YAML list", () => {
    it("should handle YAML list syntax for tested-models", () => {
      const content = `---\nname: test-skill\nversion: 1.0.0\ndescription: "当用户需要 X 时加载"\ntested-models:\n  - gpt-4\n  - claude-3\n---\n# Test\n## Gotchas\n- real failure\n## Eval\n### 正例\n- test\n### 反例\n- test\n## Forbidden Load\n- not relevant\n`;
      const issues = validateSkillFrontmatter(content);
      // Should NOT produce "suggested format" error for list format
      const formatIssue = issues.filter((i) => i.message.includes("建议使用"));
      expect(formatIssue.length).toBe(0);
    });
  });

  // ── <!-- placeholder fix ──
  describe("gotchas placeholder detection", () => {
    it("should NOT flag legitimate HTML comments", () => {
      const content = `---\nname: test-skill\nversion: 1.0.0\ndescription: "当用户需要 X 时加载"\ntested-models: [gpt-4]\n---\n# Test\n## Gotchas\n- real failure case\n<!-- this is a legitimate comment -->\n## Eval\n### 正例\n- test\n### 反例\n- test\n## Forbidden Load\n- not relevant\n`;
      const issues = validateSkillFrontmatter(content);
      const placeholderIssue = issues.filter((i) => i.message.includes("占位符"));
      expect(placeholderIssue.length).toBe(0);
    });

    it("should flag <!-- TODO --> as placeholder", () => {
      const content = `---\nname: test-skill\nversion: 1.0.0\ndescription: "当用户需要 X 时加载"\ntested-models: [gpt-4]\n---\n# Test\n## Gotchas\n<!-- TODO: add real failures -->\n## Eval\n### 正例\n- test\n### 反例\n- test\n## Forbidden Load\n- not relevant\n`;
      const issues = validateSkillFrontmatter(content);
      const placeholderIssue = issues.filter((i) => i.message.includes("占位符"));
      expect(placeholderIssue.length).toBeGreaterThanOrEqual(1);
    });
  });

describe("validateSkill (integration)", () => {
  it("should pass valid skill with minimal issues", () => {
    const issues = validateSkill(resolve(FIXTURES, "valid-skill/SKILL.md"));
    // A few suggestions like tested-models result format may still appear
    // but no hard errors for the valid fixture
    const hardErrors = issues.filter((i) => i.message.includes("Missing required"));
    expect(hardErrors.length).toBe(0);
  });

  it("should flag issues on invalid skill", () => {
    const issues = validateSkill(resolve(FIXTURES, "invalid-skill/SKILL.md"));
    expect(issues.length).toBeGreaterThanOrEqual(5);
  });
});
