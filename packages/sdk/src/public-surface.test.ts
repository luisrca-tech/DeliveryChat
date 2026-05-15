import { describe, it, expect } from "vitest";
import type { DeliveryChatAPI, InitOptions, ChatMessage, IdentifyParams, IdentityResult } from "./types/index.js";

describe("window.DeliveryChat public surface", () => {
  it("DeliveryChatAPI type exposes the expected methods", () => {
    type AllowedKeys =
      | "init"
      | "destroy"
      | "open"
      | "close"
      | "toggle"
      | "hideWidget"
      | "showWidget"
      | "on"
      | "off"
      | "sendMessage"
      | "identify"
      | "getConversation"
      | "queue";
    type ActualKeys = keyof DeliveryChatAPI;

    type ExtraKeys = Exclude<ActualKeys, AllowedKeys>;
    type MissingKeys = Exclude<AllowedKeys, ActualKeys>;

    const noExtras: ExtraKeys extends never ? true : false = true;
    const noMissing: MissingKeys extends never ? true : false = true;

    expect(noExtras).toBe(true);
    expect(noMissing).toBe(true);
  });

  it("init accepts an options argument", () => {
    type Params = Parameters<DeliveryChatAPI["init"]>;
    const hasOneParam: Params["length"] extends 1 ? true : false = true;
    expect(hasOneParam).toBe(true);
  });

  it("destroy takes no arguments and returns void", () => {
    type Params = Parameters<DeliveryChatAPI["destroy"]>;
    type Return = ReturnType<DeliveryChatAPI["destroy"]>;
    const noParams: Params["length"] extends 0 ? true : false = true;
    const returnsVoid: Return extends void ? true : false = true;
    expect(noParams).toBe(true);
    expect(returnsVoid).toBe(true);
  });

  it("control methods take no arguments and return void", () => {
    type OpenReturn = ReturnType<DeliveryChatAPI["open"]>;
    type CloseReturn = ReturnType<DeliveryChatAPI["close"]>;
    type ToggleReturn = ReturnType<DeliveryChatAPI["toggle"]>;
    type HideReturn = ReturnType<DeliveryChatAPI["hideWidget"]>;
    type ShowReturn = ReturnType<DeliveryChatAPI["showWidget"]>;

    const openVoid: OpenReturn extends void ? true : false = true;
    const closeVoid: CloseReturn extends void ? true : false = true;
    const toggleVoid: ToggleReturn extends void ? true : false = true;
    const hideVoid: HideReturn extends void ? true : false = true;
    const showVoid: ShowReturn extends void ? true : false = true;

    expect(openVoid).toBe(true);
    expect(closeVoid).toBe(true);
    expect(toggleVoid).toBe(true);
    expect(hideVoid).toBe(true);
    expect(showVoid).toBe(true);
  });

  it("queue is an array", () => {
    type QueueType = DeliveryChatAPI["queue"];
    const isArray: QueueType extends unknown[] ? true : false = true;
    expect(isArray).toBe(true);
  });

  it("InitOptions accepts headless option", () => {
    const opts: InitOptions = { appId: "test", headless: true };
    expect(opts.headless).toBe(true);

    const optsDefault: InitOptions = { appId: "test" };
    expect(optsDefault.headless).toBeUndefined();
  });

  it("sendMessage returns Promise<ChatMessage>", () => {
    type SendReturn = ReturnType<DeliveryChatAPI["sendMessage"]>;
    const isPromise: SendReturn extends Promise<ChatMessage> ? true : false = true;
    expect(isPromise).toBe(true);
  });

  it("identify returns Promise<IdentityResult>", () => {
    type IdentifyReturn = ReturnType<DeliveryChatAPI["identify"]>;
    const isPromise: IdentifyReturn extends Promise<IdentityResult> ? true : false = true;
    expect(isPromise).toBe(true);

    type IdentifyArg = Parameters<DeliveryChatAPI["identify"]>[0];
    const matchesParams: IdentifyArg extends IdentifyParams ? true : false = true;
    expect(matchesParams).toBe(true);
  });

  it("getConversation returns conversation state or null", () => {
    type GetReturn = ReturnType<DeliveryChatAPI["getConversation"]>;
    type Expected = { id: string; status: string; messages: ChatMessage[] } | null;
    const matchesShape: GetReturn extends Expected ? true : false = true;
    expect(matchesShape).toBe(true);
  });
});
