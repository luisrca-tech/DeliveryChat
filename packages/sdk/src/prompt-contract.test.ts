import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SDK_PROMPT = readFileSync(
  resolve(__dirname, "../../../apps/docs/src/features/CopyPrompt/constants/SdkPrompt.ts"),
  "utf-8",
);

const EMBED_PROMPT = readFileSync(
  resolve(__dirname, "../../../apps/docs/src/features/CopyPrompt/constants/EmbedPrompt.ts"),
  "utf-8",
);

const SDK_PUBLIC_METHODS = [
  "init",
  "destroy",
  "getSdkApi",
  "open",
  "close",
  "toggle",
  "hideWidget",
  "showWidget",
  "sendMessage",
  "identify",
  "on",
  "off",
  "getConversation",
] as const;

const WIDGET_GLOBAL_METHODS = [
  "init",
  "destroy",
  "open",
  "close",
  "toggle",
  "hideWidget",
  "showWidget",
  "sendMessage",
  "identify",
  "on",
  "off",
  "getConversation",
] as const;

const SDK_EVENTS = [
  "ready",
  "open",
  "close",
  "message:received",
  "message:sent",
  "conversation:started",
  "conversation:resolved",
  "unread:changed",
] as const;

describe("prompt contract: SDK prompt mentions all public API", () => {
  it.each(SDK_PUBLIC_METHODS)("mentions method: %s", (method) => {
    expect(SDK_PROMPT).toContain(method);
  });

  it.each(SDK_EVENTS)("mentions event: %s", (event) => {
    expect(SDK_PROMPT).toContain(event);
  });
});

describe("prompt contract: Embed prompt mentions all widget global methods", () => {
  it.each(WIDGET_GLOBAL_METHODS)("mentions method: %s", (method) => {
    expect(EMBED_PROMPT).toContain(method);
  });

  it.each(SDK_EVENTS)("mentions event: %s", (event) => {
    expect(EMBED_PROMPT).toContain(event);
  });
});
