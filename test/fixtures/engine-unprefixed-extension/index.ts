import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "mytool",
    label: "My Tool",
    description: "A tool without namespace prefix",
    parameters: Type.Object({
      path: Type.String({ description: "File path" }),
    }),
    async execute() {
      return { content: [{ type: "text" as const, text: "ok" }], details: {} as any };
    },
  });
}
