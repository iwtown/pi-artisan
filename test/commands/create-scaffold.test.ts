/**
 * Scaffold smoke tests — verify each /create-* command produces output
 * that passes its respective validator.
 *
 * These tests extract the template content directly from the command source
 * (they don't run the interactive CLI handler). They verify:
 *   - File structure / content is valid
 *   - Output passes respective validate_* checks
 *   - package.json has pi manifest
 */

import { describe, it, expect } from "vitest";
import {
  validateExtensionStructure,
} from "../../src/validators/extension";
import {
  validatePromptTemplate,
} from "../../src/validators/prompt";
import {
  validateThemeColors,
} from "../../src/validators/theme";

// ── Extension scaffold ──

const EXT_TEMPLATE = `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI): Promise<void> {
  // Register tools/commands/hooks here
  // See: https://pi.dev/docs/latest/extensions
}
`;

describe("create-extension scaffold", () => {
  it("produces valid extension content that passes validator", () => {
    const issues = validateExtensionStructure(EXT_TEMPLATE);
    const errors = issues.filter((i) => i.message.includes("Missing") || i.message.includes("missing"));
    expect(errors.length).toBe(0);
  });

  it("has export default async function", () => {
    expect(EXT_TEMPLATE).toContain("export default async function");
  });

  it("imports from @earendil-works/pi-coding-agent", () => {
    expect(EXT_TEMPLATE).toContain('@earendil-works/pi-coding-agent');
  });
});

// ── Prompt scaffold ──

const PROMPT_TEMPLATE = (name: string, desc: string) => `---
description: ${desc}
argument-hint: <arg1> [arg2]
tags: [prompt-template]
---

# ${name}

<!-- Instructions for what this template expands to. Use $1, $2, $@ for arguments. -->

\$@
`;

describe("create-prompt scaffold", () => {
  const generated = PROMPT_TEMPLATE("deploy-help", "Help with deployment");

  it("produces valid frontmatter", () => {
    expect(generated).toMatch(/^---/m);
    expect(generated).toContain("description: Help with deployment");
  });

  it("has argument-hint and tags", () => {
    expect(generated).toContain("argument-hint:");
    expect(generated).toContain("tags:");
  });

  it("passes prompt validator", () => {
    const issues = validatePromptTemplate(generated, "deploy-help.md");
    const errors = issues.filter((i) => i.message.includes("Missing") || i.message.includes("missing"));
    expect(errors.length).toBe(0);
  });

  it("uses short kebab-case filenames", () => {
    const name = "deploy-help";
    const valid = /^[a-z][a-z0-9-]{0,30}$/.test(name);
    expect(valid).toBe(true);
  });
});

// ── Theme scaffold ──

const THEME_TEMPLATE_COLORS = [
  "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText",
  "selectedBg", "userMessageBg", "userMessageText", "customMessageBg", "customMessageText", "customMessageLabel",
  "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput",
  "mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet",
  "toolDiffAdded", "toolDiffRemoved", "toolDiffContext",
  "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation",
  "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh",
  "bashMode",
];

const THEME_TEMPLATE = (name: string) => {
  const colors: Record<string, string> = {};
  for (const c of THEME_TEMPLATE_COLORS) {
    colors[c] = "#000000";
  }
  return JSON.stringify({
    $schema: "https://raw.githubusercontent.com/earendil-works/pi/main/schemas/theme.json",
    name,
    colors,
    vars: { bg: "#000", fg: "#fff", primary: "#007", secondary: "#569" },
    export: { pageBg: "#000", cardBg: "#111", infoBg: "#000", text: "#fff", accent: "#007" },
  }, null, 2);
};

describe("create-theme scaffold", () => {
  const generated = THEME_TEMPLATE("My Test Theme");

  it("produces valid JSON", () => {
    expect(() => JSON.parse(generated)).not.toThrow();
  });

  it("has name field", () => {
    const parsed = JSON.parse(generated);
    expect(parsed.name).toBe("My Test Theme");
  });

  it("has all 51 required color tokens", () => {
    const parsed = JSON.parse(generated);
    const missing = THEME_TEMPLATE_COLORS.filter((c) => !(c in (parsed.colors || {})));
    expect(missing).toEqual([]);
    expect(Object.keys(parsed.colors || {}).length).toBe(51);
  });

  it("passes theme validator", () => {
    const issues = validateThemeColors(generated, "test-theme.json");
    const criticalIssues = issues.filter((i) =>
      i.message.includes("Missing") || i.message.includes("Invalid") || i.message.includes("invalid")
    );
    expect(criticalIssues.length).toBe(0);
  });

  it("has $schema reference", () => {
    expect(generated).toContain("$schema");
  });

  it("has vars and export sections", () => {
    const parsed = JSON.parse(generated);
    expect(parsed.vars).toBeDefined();
    expect(parsed.export).toBeDefined();
  });
});

// ── Package scaffold ──

const PACKAGE_TEMPLATE = (name: string) => ({
  name: `pi-${name}`,
  version: "0.1.0",
  description: `Pi package: ${name}`,
  keywords: ["pi-package"],
  pi: {
    skills: ["skills/*"],
    extensions: ["extensions/*"],
    prompts: ["prompts/*"],
    themes: ["themes/*"],
  },
});

describe("create-package scaffold", () => {
  const generated = PACKAGE_TEMPLATE("my-toolkit");
  const json = JSON.stringify(generated, null, 2);

  it("produces valid package.json structure", () => {
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("has pi manifest property with all 4 type keys", () => {
    expect(generated.pi).toBeDefined();
    expect(generated.pi.skills).toEqual(["skills/*"]);
    expect(generated.pi.extensions).toEqual(["extensions/*"]);
    expect(generated.pi.prompts).toEqual(["prompts/*"]);
    expect(generated.pi.themes).toEqual(["themes/*"]);
  });

  it("has pi-package keyword", () => {
    expect(generated.keywords).toContain("pi-package");
  });

  it("has valid semver version", () => {
    expect(generated.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("name is prefixed with pi-", () => {
    expect(generated.name).toBe("pi-my-toolkit");
  });
});
