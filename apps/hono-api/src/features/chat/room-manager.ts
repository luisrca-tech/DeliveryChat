import type { WSContext } from "hono/ws";
import type { ParticipantRole } from "@repo/types";

export interface WSConnection {
  id: string;
  userId: string;
  organizationId: string;
  role: ParticipantRole;
  ws: WSContext;
}

export interface IRoomManager {
  join(conversationId: string, connection: WSConnection): void;
  leave(conversationId: string, connectionId: string): void;
  broadcast(
    conversationId: string,
    event: string,
    excludeConnectionId?: string,
  ): void;
  getConnections(conversationId: string): WSConnection[];
  getUserRooms(userId: string): string[];
  disconnectUser(userId: string): void;
}

export class InMemoryRoomManager implements IRoomManager {
  private rooms = new Map<string, Map<string, WSConnection>>();
  private userConnections = new Map<string, Set<string>>();

  join(conversationId: string, connection: WSConnection): void {
    if (!this.rooms.has(conversationId)) {
      this.rooms.set(conversationId, new Map());
    }
    this.rooms.get(conversationId)!.set(connection.id, connection);

    if (!this.userConnections.has(connection.userId)) {
      this.userConnections.set(connection.userId, new Set());
    }
    this.userConnections.get(connection.userId)!.add(conversationId);
  }

  leave(conversationId: string, connectionId: string): void {
    const room = this.rooms.get(conversationId);
    if (!room) return;

    const connection = room.get(connectionId);
    if (!connection) return;

    room.delete(connectionId);

    if (room.size === 0) {
      this.rooms.delete(conversationId);
    }

    const userRooms = this.userConnections.get(connection.userId);
    if (userRooms) {
      userRooms.delete(conversationId);
      if (userRooms.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }
  }

  broadcast(
    conversationId: string,
    event: string,
    excludeConnectionId?: string,
  ): void {
    const room = this.rooms.get(conversationId);
    if (!room) return;

    for (const [connId, conn] of room) {
      if (connId !== excludeConnectionId) {
        conn.ws.send(event);
      }
    }
  }

  getConnections(conversationId: string): WSConnection[] {
    const room = this.rooms.get(conversationId);
    if (!room) return [];
    return Array.from(room.values());
  }

  getUserRooms(userId: string): string[] {
    const rooms = this.userConnections.get(userId);
    if (!rooms) return [];
    return Array.from(rooms);
  }

  disconnectUser(userId: string): void {
    const rooms = this.userConnections.get(userId);
    if (!rooms) return;

    for (const conversationId of rooms) {
      const room = this.rooms.get(conversationId);
      if (!room) continue;

      for (const [connId, conn] of room) {
        if (conn.userId === userId) {
          room.delete(connId);
        }
      }

      if (room.size === 0) {
        this.rooms.delete(conversationId);
      }
    }

    this.userConnections.delete(userId);
  }
}
