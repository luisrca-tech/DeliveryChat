import type { WSContext } from "hono/ws";
import type { ParticipantRole } from "@repo/types";

export interface WSConnection {
  id: string;
  userId: string;
  userName: string | null;
  organizationId: string;
  role: ParticipantRole;
  applicationId?: string;
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
  registerConnection(connection: WSConnection): boolean;
  unregisterConnection(connectionId: string, organizationId: string): void;
  broadcastToOrganization(
    organizationId: string,
    event: string,
    excludeConnectionId?: string,
  ): void;
  broadcastToStaff(
    organizationId: string,
    event: string,
    excludeConnectionId?: string,
  ): void;
  getOrganizationConnections(organizationId: string): WSConnection[];
}

export interface RoomManagerConfig {
  maxConnectionsPerUser?: number;
  maxConnectionLifetimeMs?: number;
}

const DEFAULT_MAX_CONNECTIONS_PER_USER = 5;
const DEFAULT_MAX_CONNECTION_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours

export class InMemoryRoomManager implements IRoomManager {
  private rooms = new Map<string, Map<string, WSConnection>>();
  private userConnections = new Map<string, Set<string>>();
  private orgConnections = new Map<string, Map<string, WSConnection>>();
  private userConnectionCount = new Map<string, Set<string>>();
  private connectionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private maxConnectionsPerUser: number;
  private maxConnectionLifetimeMs: number;

  constructor(config?: RoomManagerConfig) {
    this.maxConnectionsPerUser =
      config?.maxConnectionsPerUser ?? DEFAULT_MAX_CONNECTIONS_PER_USER;
    this.maxConnectionLifetimeMs =
      config?.maxConnectionLifetimeMs ?? DEFAULT_MAX_CONNECTION_LIFETIME_MS;
  }

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

  registerConnection(connection: WSConnection): boolean {
    const userId = connection.userId;
    const currentCount = this.userConnectionCount.get(userId)?.size ?? 0;

    if (currentCount >= this.maxConnectionsPerUser) {
      console.log(`[RoomManager] REGISTER REJECTED connId=${connection.id} userId=${userId} — limit ${this.maxConnectionsPerUser} reached`);
      return false;
    }

    const orgId = connection.organizationId;
    if (!this.orgConnections.has(orgId)) {
      this.orgConnections.set(orgId, new Map());
    }
    this.orgConnections.get(orgId)!.set(connection.id, connection);

    if (!this.userConnectionCount.has(userId)) {
      this.userConnectionCount.set(userId, new Set());
    }
    this.userConnectionCount.get(userId)!.add(connection.id);

    console.log(`[RoomManager] REGISTER connId=${connection.id} userId=${userId} role=${connection.role} orgId=${orgId} orgSize=${this.orgConnections.get(orgId)!.size}`);

    const timer = setTimeout(() => {
      console.log(`[RoomManager] EXPIRED connId=${connection.id} userId=${userId} — max lifetime reached`);
      connection.ws.close(4008, "session_expired");
      this.unregisterConnection(connection.id, orgId);
      this.removeConnectionFromRooms(connection.id, userId);
    }, this.maxConnectionLifetimeMs);

    this.connectionTimers.set(connection.id, timer);

    return true;
  }

  private removeConnectionFromRooms(connectionId: string, userId: string): void {
    const rooms = this.userConnections.get(userId);
    if (!rooms) return;

    for (const conversationId of rooms) {
      const room = this.rooms.get(conversationId);
      if (!room) continue;

      room.delete(connectionId);
      if (room.size === 0) {
        this.rooms.delete(conversationId);
      }
    }

    if (this.userConnectionCount.get(userId)?.size === 0) {
      this.userConnections.delete(userId);
    }
  }

  getUserConnectionCount(userId: string): number {
    return this.userConnectionCount.get(userId)?.size ?? 0;
  }

  unregisterConnection(connectionId: string, organizationId: string): void {
    const timer = this.connectionTimers.get(connectionId);
    if (timer) {
      clearTimeout(timer);
      this.connectionTimers.delete(connectionId);
    }

    const orgMap = this.orgConnections.get(organizationId);
    if (!orgMap) return;

    const connection = orgMap.get(connectionId);
    orgMap.delete(connectionId);
    if (orgMap.size === 0) {
      this.orgConnections.delete(organizationId);
    }

    if (connection) {
      const userConns = this.userConnectionCount.get(connection.userId);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) {
          this.userConnectionCount.delete(connection.userId);
        }
      }
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

  broadcastToStaff(
    organizationId: string,
    event: string,
    excludeConnectionId?: string,
  ): void {
    const orgMap = this.orgConnections.get(organizationId);
    if (!orgMap) return;

    for (const [connId, conn] of orgMap) {
      if (connId !== excludeConnectionId && conn.role !== "visitor") {
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
