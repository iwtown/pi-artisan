import { describe, it, expect } from "vitest";
import { validateThemeColors } from "../../src/validators/theme";

function makeValidColors(): Record<string, string> {
  return {
    accent: "#ff6600", border: "#333333", borderAccent: "#ff6600", borderMuted: "#222222",
    success: "#00cc00", error: "#cc0000", warning: "#ffaa00", muted: "#888888",
    dim: "#555555", text: "#ffffff", thinkingText: "#aaaaaa",
    selectedBg: "#333333", userMessageBg: "#2a2a2a", userMessageText: "#ffffff",
    customMessageBg: "#1a1a1a", customMessageText: "#ffffff", customMessageLabel: "#ff6600",
    toolPendingBg: "#2a2a2a", toolSuccessBg: "#1a3a1a", toolErrorBg: "#3a1a1a",
    toolTitle: "#ffffff", toolOutput: "#cccccc",
    mdHeading: "#ff6600", mdLink: "#00aaff", mdLinkUrl: "#888888",
    mdCode: "#ffaa00", mdCodeBlock: "#1a1a1a", mdCodeBlockBorder: "#333333",
    mdQuote: "#cccccc", mdQuoteBorder: "#ff6600", mdHr: "#444444", mdListBullet: "#ff6600",
    toolDiffAdded: "#00cc00", toolDiffRemoved: "#cc0000", toolDiffContext: "#888888",
    syntaxComment: "#6a9955", syntaxKeyword: "#569cd6", syntaxFunction: "#dcdcaa",
    syntaxVariable: "#9cdcfe", syntaxString: "#ce9178", syntaxNumber: "#b5cea8",
    syntaxType: "#4ec9b0", syntaxOperator: "#d4d4d4", syntaxPunctuation: "#d4d4d4",
    thinkingOff: "#333333", thinkingMinimal: "#444444", thinkingLow: "#555555",
    thinkingMedium: "#666666", thinkingHigh: "#777777", thinkingXhigh: "#888888",
    bashMode: "#1a1a1a",
  };
}

describe("validateThemeColors", () => {
  it("should pass valid theme JSON", () => {
    const issues = validateThemeColors(JSON.stringify({ name: "dark-theme", colors: makeValidColors() }));
    expect(issues.length).toBe(0);
  });

  it("should flag invalid JSON", () => {
    const issues = validateThemeColors("{invalid}");
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toContain("Invalid JSON");
  });

  it("should flag missing colors", () => {
    const issues = validateThemeColors(JSON.stringify({ name: "test" }));
    expect(issues.some((i) => i.message.includes("colors"))).toBe(true);
  });

  it("should accept valid kebab-case filename", () => {
    const issues = validateThemeColors(JSON.stringify({ name: "t", colors: makeValidColors() }), "my-dark-theme.json");
    const namingIssue = issues.filter((i) => i.message.includes("kebab-case"));
    expect(namingIssue.length).toBe(0);
  });

  it("should flag non-kebab-case filename", () => {
    const issues = validateThemeColors(JSON.stringify({ name: "t", colors: makeValidColors() }), "Dark Theme.json");
    expect(issues.some((i) => i.message.includes("kebab-case"))).toBe(true);
  });
});
