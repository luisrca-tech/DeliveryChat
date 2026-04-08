import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryRoomManager } from "../room-manager.js";
import type { WSConnection } from "../room-manager.js";

function createMockConnection(
  overrides: Partial<WSConnection> = {},
): WSConnection {
  return {
    id: crypto.randomUUID(),
    userId: "user-1",
    organizationId: "org-1",
    role: "operator" as const,
    ws: {
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WSConnection["ws"],
    ...overrides,
  };
}

describe("InMemoryRoomManager", () => {
  let manager: InMemoryRoomManager;

  beforeEach(() => {
    manager = new InMemoryRoomManager();
  });

  describe("join", () => {
    it("adds a connection to a room", () => {
      const conn = createMockConnection();
      manager.join("conv-1", conn);

      const connections = manager.getConnections("conv-1");
      expect(connections).toHaveLength(1);
      expect(connections[0]?.id).toBe(conn.id);
    });

    it("creates a new room if it does not exist", () => {
      const conn = createMockConnection();
      manager.join("conv-new", conn);

      expect(manager.getConnections("conv-new")).toHaveLength(1);
    });

    it("allows multiple connections in the same room", () => {
      const conn1 = createMockConnection({ userId: "user-1" });
      const conn2 = createMockConnection({ userId: "user-2" });

      manager.join("conv-1", conn1);
      manager.join("conv-1", conn2);

      expect(manager.getConnections("conv-1")).toHaveLength(2);
    });

    it("tracks user across multiple rooms", () => {
      const conn1 = createMockConnection({ userId: "user-1" });
      const conn2 = createMockConnection({
        userId: "user-1",
        id: crypto.randomUUID(),
      });

      manager.join("conv-1", conn1);
      manager.join("conv-2", conn2);

      const rooms = manager.getUserRooms("user-1");
      expect(rooms).toContain("conv-1");
      expect(rooms).toContain("conv-2");
    });
  });

  describe("leave", () => {
    it("removes a connection from a room", () => {
      const conn = createMockConnection();
      manager.join("conv-1", conn);
      manager.leave("conv-1", conn.id);

      expect(manager.getConnections("conv-1")).toHaveLength(0);
    });

    it("cleans up empty rooms", () => {
      const conn = createMockConnection();
      manager.join("conv-1", conn);
      manager.leave("conv-1", conn.id);

      expect(manager.getConnections("conv-1")).toHaveLength(0);
    });

    it("does not affect other connections in the same room", () => {
      const conn1 = createMockConnection({ userId: "user-1" });
      const conn2 = createMockConnection({ userId: "user-2" });

      manager.join("conv-1", conn1);
      manager.join("conv-1", conn2);
      manager.leave("conv-1", conn1.id);

      const connections = manager.getConnections("conv-1");
      expect(connections).toHaveLength(1);
      expect(connections[0]?.userId).toBe("user-2");
    });

    it("handles leaving a non-existent room gracefully", () => {
      expect(() => manager.leave("conv-999", "conn-999")).not.toThrow();
    });

    it("updates user room tracking on leave", () => {
      const conn = createMockConnection({ userId: "user-1" });
      manager.join("conv-1", conn);
      manager.leave("conv-1", conn.id);

      expect(manager.getUserRooms("user-1")).toHaveLength(0);
    });
  });

  describe("broadcast", () => {
    it("sends message to all connections in a room", () => {
      const conn1 = createMockConnection({ userId: "user-1" });
      const conn2 = createMockConnection({ userId: "user-2" });

      manager.join("conv-1", conn1);
      manager.join("conv-1", conn2);

      const event = JSON.stringify({
        type: "message:new",
        payload: { id: "msg-1" },
      });
      manager.broadcast("conv-1", event);

      expect(conn1.ws.send).toHaveBeenCalledWith(event);
      expect(conn2.ws.send).toHaveBeenCalledWith(event);
    });

    it("excludes a specific connection when requested", () => {
      const conn1 = createMockConnection({ userId: "user-1" });
      const conn2 = createMockConnection({ userId: "user-2" });

      manager.join("conv-1", conn1);
      manager.join("conv-1", conn2);

      const event = JSON.stringify({ type: "message:new" });
      manager.broadcast("conv-1", event, conn1.id);

      expect(conn1.ws.send).not.toHaveBeenCalled();
      expect(conn2.ws.send).toHaveBeenCalledWith(event);
    });

    it("does nothing for a non-existent room", () => {
      expect(() =>
        manager.broadcast("conv-999", JSON.stringify({ type: "pong" })),
      ).not.toThrow();
    });

    it("does not send to connections in other rooms", () => {
      const conn1 = createMockConnection({ userId: "user-1" });
      const conn2 = createMockConnection({ userId: "user-2" });

      manager.join("conv-1", conn1);
      manager.join("conv-2", conn2);

      const event = JSON.stringify({ type: "message:new" });
      manager.broadcast("conv-1", event);

      expect(conn1.ws.send).toHaveBeenCalledWith(event);
      expect(conn2.ws.send).not.toHaveBeenCalled();
    });
  });

  describe("disconnectUser", () => {
    it("removes user from all rooms", () => {
      const conn1 = createMockConnection({ userId: "user-1" });
      const conn2 = createMockConnection({
        userId: "user-1",
        id: crypto.randomUUID(),
      });

      manager.join("conv-1", conn1);
      manager.join("conv-2", conn2);

      manager.disconnectUser("user-1");

      expect(manager.getConnections("conv-1")).toHaveLength(0);
      expect(manager.getConnections("conv-2")).toHaveLength(0);
      expect(manager.getUserRooms("user-1")).toHaveLength(0);
    });

    it("does not affect other users in the same rooms", () => {
      const conn1 = createMockConnection({ userId: "user-1" });
      const conn2 = createMockConnection({ userId: "user-2" });

      manager.join("conv-1", conn1);
      manager.join("conv-1", conn2);

      manager.disconnectUser("user-1");

      const connections = manager.getConnections("conv-1");
      expect(connections).toHaveLength(1);
      expect(connections[0]?.userId).toBe("user-2");
    });

    it("handles disconnecting a user with no rooms", () => {
      expect(() => manager.disconnectUser("user-unknown")).not.toThrow();
    });
  });

  describe("getConnections", () => {
    it("returns empty array for non-existent room", () => {
      expect(manager.getConnections("conv-999")).toEqual([]);
    });

    it("returns all connections in a room", () => {
      const conn1 = createMockConnection({ userId: "user-1" });
      const conn2 = createMockConnection({ userId: "user-2" });
      const conn3 = createMockConnection({ userId: "user-3" });

      manager.join("conv-1", conn1);
      manager.join("conv-1", conn2);
      manager.join("conv-1", conn3);

      expect(manager.getConnections("conv-1")).toHaveLength(3);
    });
  });

  describe("getUserRooms", () => {
    it("returns empty array for unknown user", () => {
      expect(manager.getUserRooms("user-unknown")).toEqual([]);
    });
  });

  describe("registerConnection", () => {
    it("tracks a connection by organizationId", () => {
      const conn = createMockConnection({ organizationId: "org-1" });
      manager.registerConnection(conn);

      const orgConns = manager.getOrganizationConnections("org-1");
      expect(orgConns).toHaveLength(1);
      expect(orgConns[0]?.id).toBe(conn.id);
    });

    it("tracks multiple connections for the same organization", () => {
      const conn1 = createMockConnection({ organizationId: "org-1", userId: "user-1" });
      const conn2 = createMockConnection({ organizationId: "org-1", userId: "user-2" });
      manager.registerConnection(conn1);
      manager.registerConnection(conn2);

      expect(manager.getOrganizationConnections("org-1")).toHaveLength(2);
    });

    it("does not mix connections from different organizations", () => {
      const conn1 = createMockConnection({ organizationId: "org-1" });
      const conn2 = createMockConnection({ organizationId: "org-2" });
      manager.registerConnection(conn1);
      manager.registerConnection(conn2);

      expect(manager.getOrganizationConnections("org-1")).toHaveLength(1);
      expect(manager.getOrganizationConnections("org-2")).toHaveLength(1);
    });
  });

  describe("unregisterConnection", () => {
    it("removes a connection from organization tracking", () => {
      const conn = createMockConnection({ organizationId: "org-1" });
      manager.registerConnection(conn);
      manager.unregisterConnection(conn.id, conn.organizationId);

      expect(manager.getOrganizationConnections("org-1")).toHaveLength(0);
    });

    it("does not affect other connections in the same organization", () => {
      const conn1 = createMockConnection({ organizationId: "org-1", userId: "user-1" });
      const conn2 = createMockConnection({ organizationId: "org-1", userId: "user-2" });
      manager.registerConnection(conn1);
      manager.registerConnection(conn2);

      manager.unregisterConnection(conn1.id, conn1.organizationId);

      const orgConns = manager.getOrganizationConnections("org-1");
      expect(orgConns).toHaveLength(1);
      expect(orgConns[0]?.userId).toBe("user-2");
    });

    it("handles unregistering a non-existent connection gracefully", () => {
      expect(() => manager.unregisterConnection("conn-999", "org-1")).not.toThrow();
    });
  });

  describe("broadcastToOrganization", () => {
    it("sends event to all connections in the organization", () => {
      const conn1 = createMockConnection({ organizationId: "org-1", userId: "user-1" });
      const conn2 = createMockConnection({ organizationId: "org-1", userId: "user-2" });
      manager.registerConnection(conn1);
      manager.registerConnection(conn2);

      const event = JSON.stringify({ type: "conversation:accepted", payload: { id: "conv-1" } });
      manager.broadcastToOrganization("org-1", event);

      expect(conn1.ws.send).toHaveBeenCalledWith(event);
      expect(conn2.ws.send).toHaveBeenCalledWith(event);
    });

    it("excludes a specific connection when requested", () => {
      const conn1 = createMockConnection({ organizationId: "org-1", userId: "user-1" });
      const conn2 = createMockConnection({ organizationId: "org-1", userId: "user-2" });
      manager.registerConnection(conn1);
      manager.registerConnection(conn2);

      const event = JSON.stringify({ type: "conversation:accepted", payload: { id: "conv-1" } });
      manager.broadcastToOrganization("org-1", event, conn1.id);

      expect(conn1.ws.send).not.toHaveBeenCalled();
      expect(conn2.ws.send).toHaveBeenCalledWith(event);
    });

    it("does not send to connections in other organizations", () => {
      const conn1 = createMockConnection({ organizationId: "org-1" });
      const conn2 = createMockConnection({ organizationId: "org-2" });
      manager.registerConnection(conn1);
      manager.registerConnection(conn2);

      const event = JSON.stringify({ type: "conversation:accepted", payload: { id: "conv-1" } });
      manager.broadcastToOrganization("org-1", event);

      expect(conn1.ws.send).toHaveBeenCalledWith(event);
      expect(conn2.ws.send).not.toHaveBeenCalled();
    });

    it("does nothing for an organization with no connections", () => {
      expect(() =>
        manager.broadcastToOrganization("org-999", JSON.stringify({ type: "test" })),
      ).not.toThrow();
    });
  });

  describe("getOrganizationConnections", () => {
    it("returns empty array for unknown organization", () => {
      expect(manager.getOrganizationConnections("org-unknown")).toEqual([]);
    });
  });
});
