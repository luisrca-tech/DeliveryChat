import { describe, it, expect, beforeEach } from "vitest";
import {
  seedDisclosureIfNeeded,
  onIncomingMessage,
  resetForNewConversation,
} from "./aiConversationLifecycle.js";
import { getState, setState } from "./state.js";
import type { ChatMessage, WidgetSettings } from "./types/index.js";

function aiMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "ai-1",
    content: "I can help with that",
    type: "text",
    senderRole: "operator",
    senderId: "",
    status: "sent",
    createdAt: "2026-01-01T00:00:00Z",
    authorType: "ai",
    ...overrides,
  };
}

function operatorMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "op-1",
    content: "Hi, I'm Maria",
    type: "text",
    senderRole: "operator",
    senderId: "op-1",
    status: "sent",
    createdAt: "2026-01-01T00:01:00Z",
    authorType: "operator",
    ...overrides,
  };
}

const enabledSettings = {
  header: { title: "Acme", subtitle: "", showLogo: false },
  ai: { enabled: true, assistantLabel: "AI Assistant" },
} as unknown as WidgetSettings;

const disabledSettings = {
  header: { title: "Acme", subtitle: "", showLogo: false },
  ai: { enabled: false },
} as unknown as WidgetSettings;

describe("aiConversationLifecycle", () => {
  beforeEach(() => {
    setState("messages", []);
    setState("humanRequested", false);
    setState("aiTakeoverAnnounced", false);
  });

  describe("seedDisclosureIfNeeded", () => {
    it("seeds the disclosure line when AI is enabled and messages are empty", () => {
      seedDisclosureIfNeeded(enabledSettings);

      const messages = getState("messages");
      expect(messages).toHaveLength(1);
      expect(messages[0]!.type).toBe("system");
      expect(messages[0]!.content).toBe(
        "Hi! I'm Acme's AI Assistant. I can help you — or connect you to a person anytime.",
      );
    });

    it("does not seed when AI is disabled", () => {
      seedDisclosureIfNeeded(disabledSettings);
      expect(getState("messages")).toEqual([]);
    });

    it("does not seed when messages already exist (aligned guard for init and startNewChat)", () => {
      setState("messages", [operatorMessage()]);

      seedDisclosureIfNeeded(enabledSettings);

      const messages = getState("messages");
      expect(messages).toHaveLength(1);
      expect(messages[0]!.authorType).toBe("operator");
    });

    it("produces identical seeding whenever it runs against the same empty state (init === startNewChat)", () => {
      // init clears messages to [] before seeding; startNewChat does the same.
      // With the unified empty-messages guard both call sites funnel through
      // this one seam, so the seeded line must match.
      setState("messages", []);
      seedDisclosureIfNeeded(enabledSettings);
      const initSeed = getState("messages").map((m) => m.content);

      setState("messages", []);
      seedDisclosureIfNeeded(enabledSettings);
      const startNewSeed = getState("messages").map((m) => m.content);

      expect(initSeed).toEqual(startNewSeed);
      expect(initSeed).toHaveLength(1);
    });
  });

  describe("onIncomingMessage — takeover moment", () => {
    it("inserts a one-time system line the first time an operator message follows an AI message", () => {
      setState("messages", [aiMessage()]);

      onIncomingMessage(operatorMessage());

      const messages = getState("messages");
      expect(messages).toHaveLength(3);
      expect(messages[1]).toMatchObject({
        type: "system",
        content: "You're now chatting with a team member.",
      });
      expect(messages[2]!.id).toBe("op-1");
      expect(getState("aiTakeoverAnnounced")).toBe(true);
    });

    it("does not insert the takeover line when there was no prior AI message", () => {
      setState("messages", []);

      onIncomingMessage(operatorMessage());

      const messages = getState("messages");
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe("op-1");
      expect(getState("aiTakeoverAnnounced")).toBe(false);
    });

    it("only announces the takeover once per conversation", () => {
      setState("messages", [aiMessage()]);

      onIncomingMessage(operatorMessage({ id: "op-1" }));
      onIncomingMessage(
        operatorMessage({ id: "op-2", content: "How can I help?" }),
      );

      const systemMessages = getState("messages").filter(
        (m) => m.type === "system",
      );
      expect(systemMessages).toHaveLength(1);
    });
  });

  describe("resetForNewConversation", () => {
    it("resets humanRequested and aiTakeoverAnnounced", () => {
      setState("humanRequested", true);
      setState("aiTakeoverAnnounced", true);

      resetForNewConversation();

      expect(getState("humanRequested")).toBe(false);
      expect(getState("aiTakeoverAnnounced")).toBe(false);
    });
  });
});
