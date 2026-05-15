import { describe, it, expect } from "vitest";
import type { DeliveryChatAPI } from "./types/index.js";

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
});
