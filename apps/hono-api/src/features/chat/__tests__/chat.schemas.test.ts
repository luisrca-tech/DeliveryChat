import { describe, it, expect } from "vitest";
import {
  roomJoinSchema,
  roomLeaveSchema,
  messageSendSchema,
  wsClientEventSchema,
} from "../chat.schemas.js";

describe("chat.schemas", () => {
  describe("roomJoinSchema", () => {
    it("accepts valid payload with conversationId", () => {
      const result = roomJoinSchema.safeParse({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid payload with optional lastMessageId", () => {
      const result = roomJoinSchema.safeParse({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        lastMessageId: "660e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing conversationId", () => {
      const result = roomJoinSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects invalid UUID for conversationId", () => {
      const result = roomJoinSchema.safeParse({
        conversationId: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid UUID for lastMessageId", () => {
      const result = roomJoinSchema.safeParse({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        lastMessageId: "bad-id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty string conversationId", () => {
      const result = roomJoinSchema.safeParse({ conversationId: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("roomLeaveSchema", () => {
    it("accepts valid payload", () => {
      const result = roomLeaveSchema.safeParse({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing conversationId", () => {
      const result = roomLeaveSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("messageSendSchema", () => {
    it("accepts valid payload", () => {
      const result = messageSendSchema.safeParse({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        content: "Hello, how can I help?",
        clientMessageId: "client-123-abc",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty content", () => {
      const result = messageSendSchema.safeParse({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        content: "",
        clientMessageId: "client-123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing clientMessageId", () => {
      const result = messageSendSchema.safeParse({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        content: "Hello",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty clientMessageId", () => {
      const result = messageSendSchema.safeParse({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        content: "Hello",
        clientMessageId: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects content exceeding max length", () => {
      const result = messageSendSchema.safeParse({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        content: "a".repeat(10001),
        clientMessageId: "client-123",
      });
      expect(result.success).toBe(false);
    });

    it("trims whitespace from content", () => {
      const result = messageSendSchema.safeParse({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        content: "  Hello  ",
        clientMessageId: "client-123",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe("Hello");
      }
    });
  });

  describe("wsClientEventSchema", () => {
    it("parses room:join event", () => {
      const result = wsClientEventSchema.safeParse({
        type: "room:join",
        payload: {
          conversationId: "550e8400-e29b-41d4-a716-446655440000",
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("room:join");
      }
    });

    it("parses room:leave event", () => {
      const result = wsClientEventSchema.safeParse({
        type: "room:leave",
        payload: {
          conversationId: "550e8400-e29b-41d4-a716-446655440000",
        },
      });
      expect(result.success).toBe(true);
    });

    it("parses message:send event", () => {
      const result = wsClientEventSchema.safeParse({
        type: "message:send",
        payload: {
          conversationId: "550e8400-e29b-41d4-a716-446655440000",
          content: "Hello",
          clientMessageId: "msg-1",
        },
      });
      expect(result.success).toBe(true);
    });

    it("parses ping event", () => {
      const result = wsClientEventSchema.safeParse({ type: "ping" });
      expect(result.success).toBe(true);
    });

    it("rejects unknown event type", () => {
      const result = wsClientEventSchema.safeParse({
        type: "unknown:event",
        payload: {},
      });
      expect(result.success).toBe(false);
    });

    it("rejects malformed JSON structure", () => {
      const result = wsClientEventSchema.safeParse("not an object");
      expect(result.success).toBe(false);
    });

    it("rejects room:join with invalid payload", () => {
      const result = wsClientEventSchema.safeParse({
        type: "room:join",
        payload: { conversationId: 123 },
      });
      expect(result.success).toBe(false);
    });
  });
});
