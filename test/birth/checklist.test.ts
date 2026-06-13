import { describe, it, expect } from "vitest";
import { getChecklist } from "../../src/birth/checklist.js";

describe("birth checklist", () => {
  function getSkillChecklist() {
    return getChecklist("skill", "test/fixtures/valid-skill/SKILL.md");
  }
  function getExtChecklist() {
    return getChecklist("extension", "test/fixtures/valid-extension.ts");
  }
  function getPromptChecklist() {
    return getChecklist("prompt", "test/fixtures/valid-prompt.md");
  }
  function getThemeChecklist() {
    return getChecklist("theme", "test/fixtures/valid-theme.json");
  }
  function getPkgChecklist() {
    return getChecklist("package", ".");
  }

  it("skill checklist has 21 items", () => {
    expect(getSkillChecklist()).toHaveLength(21);
  });

  it("extension checklist has 9 items", () => {
    expect(getExtChecklist()).toHaveLength(9);
  });

  it("prompt checklist has 7 items", () => {
    expect(getPromptChecklist()).toHaveLength(7);
  });

  it("theme checklist has 6 items", () => {
    expect(getThemeChecklist()).toHaveLength(6);
  });

  it("package checklist has 8 items", () => {
    expect(getPkgChecklist()).toHaveLength(8);
  });

  it("each item has required fields", () => {
    for (const list of [getSkillChecklist(), getExtChecklist(), getPromptChecklist(), getThemeChecklist(), getPkgChecklist()]) {
      for (const item of list) {
        expect(item.id).toBeTruthy();
        expect(item.label).toBeTruthy();
        expect(["auto", "autoable", "manual", "missing"]).toContain(item.level);
        expect(typeof item.check).toBe("function");
      }
    }
  });

  it("skill auto check: frontmatter passes for valid file", () => {
    const fm = getSkillChecklist().find((c) => c.id === "skill-frontmatter")!;
    const result = fm.check("test/fixtures/valid-skill/SKILL.md");
    expect(result.pass).toBe(true);
  });

  it("skill auto check: version passes for valid file", () => {
    const ver = getSkillChecklist().find((c) => c.id === "skill-version")!;
    const result = ver.check("test/fixtures/valid-skill/SKILL.md");
    expect(result.pass).toBe(true);
  });

  it("extension auto check: export default passes for valid file", () => {
    const extCheck = getExtChecklist().find((c) => c.id === "ext-export")!;
    const result = extCheck.check("test/fixtures/valid-extension.ts");
    expect(result.pass).toBe(true);
  });

  it("theme auto check: JSON valid passes for valid file", () => {
    const jsonCheck = getThemeChecklist().find((c) => c.id === "theme-json-valid")!;
    const result = jsonCheck.check("test/fixtures/valid-theme.json");
    expect(result.pass).toBe(true);
  });

  it("package auto check: package.json exists", () => {
    const pkgCheck = getPkgChecklist().find((c) => c.id === "pkg-json-exists")!;
    const result = pkgCheck.check(".");
    expect(result.pass).toBe(true);
  });

  it("all check functions can run without throwing", () => {
    for (const item of getSkillChecklist()) {
      expect(() => item.check("test/fixtures/valid-skill/SKILL.md")).not.toThrow();
    }
  });

  it("prompt checklist includes tags suggestion", () => {
    const tags = getPromptChecklist().find((c) => c.id === "prompt-tags")!;
    expect(tags.level).toBe("missing");
  });

  it("skill checklist includes safety section check", () => {
    const safety = getSkillChecklist().find((c) => c.id === "skill-safety")!;
    expect(safety.level).toBe("missing");
    expect(safety.check("test/fixtures/valid-skill/SKILL.md").pass).toBe(false);
  });

  it("skill checklist includes license check", () => {
    const license = getSkillChecklist().find((c) => c.id === "skill-license")!;
    expect(license.level).toBe("missing");
  });
});
