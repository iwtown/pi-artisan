/**
 * Tests for tool-call hook — pendingPaths and TTL cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupToolCallHook, pendingPaths } from "../../src/hooks/tool-call.js";

describe("pendingPaths TTL cleanup", () => {
  let handlers: Record<string, Function>;

  beforeEach(() => {
    vi.useFakeTimers();
    handlers = {};
  });

  afterEach(() => {
    pendingPaths.clear();
    vi.useRealTimers();
  });

  it("sets pending path on write tool call", () => {
    const mockPi = { on: (event: string, handler: Function) => { handlers[event] = handler; } };
    setupToolCallHook(mockPi as any);

    handlers["tool_call"]({
      toolName: "write",
      toolCallId: "test-123",
      input: { path: "/tmp/test.md" },
    });

    expect(pendingPaths.get("test-123")).toBe("/tmp/test.md");
  });

  it("sets pending path on edit tool call", () => {
    const mockPi = { on: (event: string, handler: Function) => { handlers[event] = handler; } };
    setupToolCallHook(mockPi as any);

    handlers["tool_call"]({
      toolName: "edit",
      toolCallId: "test-456",
      input: { path: "/tmp/test.ts" },
    });

    expect(pendingPaths.get("test-456")).toBe("/tmp/test.ts");
  });

  it("does not set pending path for non-file operations", () => {
    const mockPi = { on: (event: string, handler: Function) => { handlers[event] = handler; } };
    setupToolCallHook(mockPi as any);

    handlers["tool_call"]({
      toolName: "bash",
      toolCallId: "test-789",
      input: { command: "ls" },
    });

    expect(pendingPaths.has("test-789")).toBe(false);
  });

  it("cleans up pending path after TTL", () => {
    const mockPi = { on: (event: string, handler: Function) => { handlers[event] = handler; } };
    setupToolCallHook(mockPi as any);

    handlers["tool_call"]({
      toolName: "write",
      toolCallId: "test-ttl",
      input: { path: "/tmp/ephemeral.md" },
    });

    expect(pendingPaths.has("test-ttl")).toBe(true);

    vi.advanceTimersByTime(30000);

    expect(pendingPaths.has("test-ttl")).toBe(false);
  });

  it("entry survives within TTL window", () => {
    const mockPi = { on: (event: string, handler: Function) => { handlers[event] = handler; } };
    setupToolCallHook(mockPi as any);

    handlers["tool_call"]({
      toolName: "write",
      toolCallId: "test-alive",
      input: { path: "/tmp/live.md" },
    });

    // Still alive before TTL expires
    vi.advanceTimersByTime(29999);
    expect(pendingPaths.has("test-alive")).toBe(true);
  });

  it("multiple entries each have independent TTLs", () => {
    const mockPi = { on: (event: string, handler: Function) => { handlers[event] = handler; } };
    setupToolCallHook(mockPi as any);

    handlers["tool_call"]({
      toolName: "write",
      toolCallId: "first",
      input: { path: "/tmp/a.md" },
    });

    vi.advanceTimersByTime(15000);

    handlers["tool_call"]({
      toolName: "write",
      toolCallId: "second",
      input: { path: "/tmp/b.md" },
    });

    // Before first expires, both alive
    expect(pendingPaths.has("first")).toBe(true);
    expect(pendingPaths.has("second")).toBe(true);

    // Advance past first TTL but not second
    vi.advanceTimersByTime(15001);
    expect(pendingPaths.has("first")).toBe(false);
    expect(pendingPaths.has("second")).toBe(true);

    // Advance past second TTL
    vi.advanceTimersByTime(15000);
    expect(pendingPaths.has("second")).toBe(false);
  });
});
