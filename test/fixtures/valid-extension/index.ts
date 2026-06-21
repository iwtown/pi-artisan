import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "test-project/my_tool",
    label: "My Tool",
    description: "A valid test tool",
    parameters: Type.Object({
      path: Type.String({ description: "File path" }),
    }),
    async execute() {
      return { content: [{ type: "text" as const, text: "ok" }], details: {} as any };
    },
  });

  pi.registerCommand("my-command", {
    description: "A valid test command",
    handler: async () => {},
  });
}
