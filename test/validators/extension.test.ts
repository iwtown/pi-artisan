import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateExtensionStructure } from "../../src/validators/extension";

const FIXTURES = resolve(__dirname, "../fixtures");

describe("validateExtensionStructure", () => {
  it("should pass valid extension", () => {
    const content = readFileSync(resolve(FIXTURES, "valid-extension.ts"), "utf-8");
    const issues = validateExtensionStructure(content);
    expect(issues.length).toBe(0);
  });

  it("should detect missing export default function", () => {
    const content = "const x = 1;\n";
    const issues = validateExtensionStructure(content);
    const entryIssue = issues.filter((i) => i.message.includes("Missing"));
    expect(entryIssue.length).toBeGreaterThanOrEqual(1);
  });

  it("should suggest namespace prefix for tool names without one", () => {
    const content = `
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "bare_tool",
    label: "Bare Tool",
    description: "A tool without namespace",
    parameters: Type.Object({}),
    async execute() { return { content: [], details: {} }; },
  });
}
`;
    const issues = validateExtensionStructure(content);
    const nsIssue = issues.filter((i) => i.message.includes("命名空间前缀"));
    expect(nsIssue.length).toBe(1);
  });

  it("should not suggest namespace for namespaced tool names", () => {
    const content = `
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "my-project/bare_tool",
    label: "Bare Tool",
    description: "A tool with namespace",
    parameters: Type.Object({}),
    async execute() { return { content: [], details: {} }; },
  });
}
`;
    const issues = validateExtensionStructure(content);
    const nsIssue = issues.filter((i) => i.message.includes("命名空间前缀"));
    expect(nsIssue.length).toBe(0);
  });
});
