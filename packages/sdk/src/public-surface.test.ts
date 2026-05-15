import { describe, it, expect } from "vitest";
import type { DeliveryChatAPI } from "./types/index.js";

describe("window.DeliveryChat public surface", () => {
  it("DeliveryChatAPI type exposes only init, destroy, and queue", () => {
    type AllowedKeys = "init" | "destroy" | "queue";
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

  it("queue is an array", () => {
    type QueueType = DeliveryChatAPI["queue"];
    const isArray: QueueType extends unknown[] ? true : false = true;
    expect(isArray).toBe(true);
  });
});
