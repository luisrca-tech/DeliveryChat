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
  registerConnection(connection: WSConnection): void;
  unregisterConnection(connectionId: string, organizationId: string): void;
  broadcastToOrganization(
    organizationId: string,
    event: string,
    excludeConnectionId?: string,
  ): void;
  getOrganizationConnections(organizationId: string): WSConnection[];
}

export class InMemoryRoomManager implements IRoomManager {
  private rooms = new Map<string, Map<string, WSConnection>>();
  private userConnections = new Map<string, Set<string>>();
  private orgConnections = new Map<string, Map<string, WSConnection>>();

  join(conversationId: string, connection: WSConnection): void {
    if (!this.rooms.has(conversationId)) {
      this.rooms.set(conversationId, new Map());
    }
    this.rooms.get(conversationId)!.set(connection.id, connection);

    if (!this.userConnections.has(connection.userId)) {
      this.userConnections.set(connection.userId, new Set());
    }
    this.userConnections.get(connection.userId)!.add(conversationId);

    const roomSize = this.rooms.get(conversationId)!.size;
    console.log(`[RoomManager] JOIN room=${conversationId} connId=${connection.id} userId=${connection.userId} role=${connection.role} roomSize=${roomSize}`);
  }

  leave(conversationId: string, connectionId: string): void {
    const room = this.rooms.get(conversationId);
    if (!room) {
      console.log(`[RoomManager] LEAVE room=${conversationId} connId=${connectionId} — room not found`);
      return;
    }

    const connection = room.get(connectionId);
    if (!connection) {
      console.log(`[RoomManager] LEAVE room=${conversationId} connId=${connectionId} — connection not in room`);
      return;
    }

    room.delete(connectionId);
    console.log(`[RoomManager] LEAVE room=${conversationId} connId=${connectionId} userId=${connection.userId} roomSize=${room.size}`);

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
    if (!room) {
      console.log(`[RoomManager] BROADCAST room=${conversationId} — NO ROOM FOUND (0 recipients)`);
      return;
    }

    let sent = 0;
    const recipients: string[] = [];
    for (const [connId, conn] of room) {
      if (connId !== excludeConnectionId) {
        conn.ws.send(event);
        sent++;
        recipients.push(`${conn.userId}(${conn.role})`);
      }
    }
    console.log(`[RoomManager] BROADCAST room=${conversationId} sent=${sent} excluded=${excludeConnectionId ?? "none"} recipients=[${recipients.join(", ")}]`);
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
    if (!rooms) {
      console.log(`[RoomManager] DISCONNECT userId=${userId} — no rooms to clean`);
      return;
    }
    console.log(`[RoomManager] DISCONNECT userId=${userId} rooms=[${Array.from(rooms).join(", ")}]`);

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

  registerConnection(connection: WSConnection): void {
    const orgId = connection.organizationId;
    if (!this.orgConnections.has(orgId)) {
      this.orgConnections.set(orgId, new Map());
    }
    this.orgConnections.get(orgId)!.set(connection.id, connection);
    console.log(`[RoomManager] REGISTER connId=${connection.id} userId=${connection.userId} role=${connection.role} orgId=${orgId} orgSize=${this.orgConnections.get(orgId)!.size}`);
  }

  unregisterConnection(connectionId: string, organizationId: string): void {
    const orgMap = this.orgConnections.get(organizationId);
    if (!orgMap) return;

    orgMap.delete(connectionId);
    if (orgMap.size === 0) {
      this.orgConnections.delete(organizationId);
    }
  }

  broadcastToOrganization(
    organizationId: string,
    event: string,
    excludeConnectionId?: string,
  ): void {
    const orgMap = this.orgConnections.get(organizationId);
    if (!orgMap) return;

    for (const [connId, conn] of orgMap) {
      if (connId !== excludeConnectionId) {
        conn.ws.send(event);
      }
    }
  }

  getOrganizationConnections(organizationId: string): WSConnection[] {
    const orgMap = this.orgConnections.get(organizationId);
    if (!orgMap) return [];
    return Array.from(orgMap.values());
  }
}
