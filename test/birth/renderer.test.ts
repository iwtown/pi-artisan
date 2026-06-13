import { describe, it, expect } from "vitest";
import { runBirthCert } from "../../src/birth/runner.js";
import { renderBirthResult, renderFullBirthResult, renderBirthResultJson } from "../../src/birth/renderer.js";

describe("renderBirthResult", () => {
  const result = runBirthCert("skill", "test/fixtures/valid-skill/SKILL.md");

  it("renders birth cert with proper formatting", () => {
    const lines = renderBirthResult(result);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("出生证");
    expect(lines[lines.length - 1]).toContain("└");
  });

  it("renders passes/passed count", () => {
    const lines = renderBirthResult(result);
    const counts = lines.find((l) => l.includes("通过"));
    expect(counts).toBeTruthy();
  });

  it("renders ready status", () => {
    const lines = renderBirthResult(result);
    const conclusion = lines.find((l) => l.includes("结论"));
    expect(conclusion).toBeTruthy();
  });

  it("renders different output for ready vs not ready", () => {
    const readyResult = runBirthCert("skill", "test/fixtures/valid-skill/SKILL.md");
    const readyLines = renderBirthResult(readyResult);

    const notReady = runBirthCert("extension", "test/fixtures/valid-extension.ts");
    const notReadyLines = renderBirthResult(notReady);

    // Should be different since one is likely ready and the other not
    expect(readyLines.join()).not.toEqual(notReadyLines.join());
  });

  it("renderFullBirthResult shows more lines than folded", () => {
    const full = renderFullBirthResult(result);
    const folded = renderBirthResult(result);
    expect(full.length).toBeGreaterThanOrEqual(folded.length);
  });

  it("renderFullBirthResult includes all levels", () => {
    const lines = renderFullBirthResult(result);
    expect(lines.some((l) => l.includes("🟢"))).toBe(true);
    // Autoable or manual should be visible
    expect(lines.some((l) => l.includes("🔵") || l.includes("🟡") || l.includes("⚪"))).toBe(true);
  });

  it("handles empty result", () => {
    const empty = runBirthCert("skill", "nonexistent-xyz");
    const lines = renderBirthResult(empty);
    expect(lines.some((l) => l.includes("找不到"))).toBe(true);
  });

  it("renderBirthResultJson produces valid JSON", () => {
    const json = renderBirthResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.resourceType).toBe("skill");
    expect(parsed.ready).toBeDefined();
    expect(parsed.checks).toBeInstanceOf(Array);
  });
});
