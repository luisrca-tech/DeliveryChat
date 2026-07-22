import { describe, it, expect } from "vitest";
import { isHumanRequest } from "../humanRequest.js";

describe("isHumanRequest", () => {
  it("detects an explicit English request for a person", () => {
    expect(isHumanRequest("I want to talk to a human")).toBe(true);
    expect(isHumanRequest("can I speak to an agent?")).toBe(true);
    expect(isHumanRequest("please connect me with someone")).toBe(true);
  });

  it("detects an explicit Portuguese request", () => {
    expect(isHumanRequest("quero falar com um atendente")).toBe(true);
    expect(isHumanRequest("posso falar com uma pessoa?")).toBe(true);
  });

  it("does not fire on ordinary product questions", () => {
    expect(isHumanRequest("do you have this shirt in stock?")).toBe(false);
    expect(isHumanRequest("what is my order status?")).toBe(false);
  });

  it("requires BOTH a person noun and a contact verb", () => {
    // noun without verb
    expect(isHumanRequest("is there a human resources page?")).toBe(false);
    // verb without noun
    expect(isHumanRequest("I want to talk about my refund")).toBe(false);
  });

  it("handles empty / nullish input", () => {
    expect(isHumanRequest("")).toBe(false);
    expect(isHumanRequest(null)).toBe(false);
    expect(isHumanRequest(undefined)).toBe(false);
  });
});
