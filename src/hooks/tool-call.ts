/**
 * tool_call hook — captures write/edit file paths for post-write validation.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Internal path tracker shared with tool-result hook */
export const pendingPaths = new Map<string, string>();

/**
 * Set up the tool_call hook that captures file paths from write/edit operations.
 */
export function setupToolCallHook(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event: any) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input?.path as string;
      if (filePath) pendingPaths.set(event.toolCallId, filePath);
    }
    return undefined;
  });
}
