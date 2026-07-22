import { describe, it, expect } from "vitest";
import { disclosureText, shouldSeedDisclosure } from "./aiDisclosure";

describe("disclosureText", () => {
  it("names the tenant and the assistant, matching the widget copy", () => {
    expect(
      disclosureText({
        header: { title: "Chat with us" },
        ai: { assistantLabel: "AI Assistant" },
      }),
    ).toBe(
      "Hi! I'm Chat with us's AI Assistant. I can help you — or connect you to a person anytime.",
    );
  });

  it("honours a custom assistant label", () => {
    expect(
      disclosureText({
        header: { title: "Acme" },
        ai: { assistantLabel: "Acme Bot" },
      }),
    ).toBe(
      "Hi! I'm Acme's Acme Bot. I can help you — or connect you to a person anytime.",
    );
  });

  it("falls back to 'AI Assistant' when no label is configured", () => {
    expect(disclosureText({ header: { title: "Acme" } })).toContain(
      "Acme's AI Assistant",
    );
  });

  it("falls back to 'our' when the header has no title", () => {
    // settings is free-form JSONB — the title may simply not be there.
    // Note the awkward "our's": the SDK builds `${tenantName}'s` and falls
    // back to "our", producing the same string. Matching the widget verbatim
    // matters more here than grammar; fix it in the SDK first if at all.
    expect(disclosureText({})).toBe(
      "Hi! I'm our's AI Assistant. I can help you — or connect you to a person anytime.",
    );
  });

  it("treats an empty title as missing", () => {
    expect(disclosureText({ header: { title: "" } })).toContain("I'm our's AI");
  });
});

describe("shouldSeedDisclosure", () => {
  const base = {
    aiEnabled: true,
    conversationId: "conv-1",
    messageCount: 0,
    loadingMessages: false,
    alreadySeeded: false,
  };

  it("seeds on a brand-new AI conversation", () => {
    expect(shouldSeedDisclosure(base)).toBe(true);
  });

  it("does not seed when AI is off for the application", () => {
    expect(shouldSeedDisclosure({ ...base, aiEnabled: false })).toBe(false);
  });

  it("does not seed before a conversation is selected", () => {
    expect(shouldSeedDisclosure({ ...base, conversationId: null })).toBe(false);
  });

  it("does not seed into a conversation that already has history", () => {
    // Reopening an old thread must not prepend a fresh greeting.
    expect(shouldSeedDisclosure({ ...base, messageCount: 3 })).toBe(false);
  });

  it("waits for history to finish loading before deciding", () => {
    // Mid-load the count is 0 but unknown — seeding here would flash a
    // greeting onto a thread that turns out to have history.
    expect(shouldSeedDisclosure({ ...base, loadingMessages: true })).toBe(
      false,
    );
  });

  it("does not seed twice into the same conversation", () => {
    expect(shouldSeedDisclosure({ ...base, alreadySeeded: true })).toBe(false);
  });
});
