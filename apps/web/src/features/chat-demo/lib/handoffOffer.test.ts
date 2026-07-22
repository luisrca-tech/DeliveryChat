import { describe, it, expect } from "vitest";
import { handoffOffer, type HandoffMessage } from "./handoffOffer";
import type { Conversation } from "../chat-client";

const VISITOR = "visitor-1";

function conversation(status = "active"): Conversation {
  return {
    id: "conv-1",
    status,
    subject: "Demo",
    assignedTo: null,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
  };
}

function visitorMessage(): HandoffMessage {
  return { senderId: VISITOR, type: "text" };
}

function operatorMessage(): HandoffMessage {
  return { senderId: "operator-9", type: "text" };
}

function systemMessage(): HandoffMessage {
  return { senderId: "system", type: "system" };
}

describe("handoffOffer — demo 'Talk to a human' button rule", () => {
  it("hides the button when AI is disabled for the application", () => {
    expect(
      handoffOffer({
        aiEnabled: false,
        conversation: conversation(),
        messages: [visitorMessage()],
        visitorUserId: VISITOR,
        humanRequested: false,
      }),
    ).toEqual({ hidden: true, disabled: false });
  });

  it("hides the button while no conversation is selected", () => {
    expect(
      handoffOffer({
        aiEnabled: true,
        conversation: undefined,
        messages: [],
        visitorUserId: VISITOR,
        humanRequested: false,
      }),
    ).toEqual({ hidden: true, disabled: false });
  });

  it("shows and enables the button on an AI-handled conversation", () => {
    expect(
      handoffOffer({
        aiEnabled: true,
        conversation: conversation(),
        messages: [visitorMessage()],
        visitorUserId: VISITOR,
        humanRequested: false,
      }),
    ).toEqual({ hidden: false, disabled: false });
  });

  it("disables the button once a human has been requested", () => {
    expect(
      handoffOffer({
        aiEnabled: true,
        conversation: conversation(),
        messages: [visitorMessage()],
        visitorUserId: VISITOR,
        humanRequested: true,
      }),
    ).toEqual({ hidden: false, disabled: true });
  });

  it("disables the button once an operator message has arrived", () => {
    expect(
      handoffOffer({
        aiEnabled: true,
        conversation: conversation(),
        messages: [visitorMessage(), operatorMessage()],
        visitorUserId: VISITOR,
        humanRequested: false,
      }),
    ).toEqual({ hidden: false, disabled: true });
  });

  it("does not treat system messages as an operator takeover", () => {
    // Escalation itself emits a system message; counting it as an operator
    // would disable the button for the wrong reason.
    expect(
      handoffOffer({
        aiEnabled: true,
        conversation: conversation(),
        messages: [visitorMessage(), systemMessage()],
        visitorUserId: VISITOR,
        humanRequested: false,
      }),
    ).toEqual({ hidden: false, disabled: false });
  });

  it("disables the button on a closed conversation", () => {
    // The server answers 409 for a closed conversation — don't offer the click.
    expect(
      handoffOffer({
        aiEnabled: true,
        conversation: conversation("closed"),
        messages: [visitorMessage()],
        visitorUserId: VISITOR,
        humanRequested: false,
      }),
    ).toEqual({ hidden: false, disabled: true });
  });

  it("cannot detect an operator takeover before the visitor id is known", () => {
    // visitorUserId is null on first paint; every senderId would look foreign.
    // Staying enabled is safe because escalation is idempotent server-side.
    expect(
      handoffOffer({
        aiEnabled: true,
        conversation: conversation(),
        messages: [operatorMessage()],
        visitorUserId: null,
        humanRequested: false,
      }),
    ).toEqual({ hidden: false, disabled: false });
  });
});
