import { Hono } from "hono";
import { getUpgradeWebSocket } from "../lib/ws.js";
import { authenticateWebSocket } from "../lib/middleware/wsAuth.js";
import { createWsUpgradeRateLimitMiddleware } from "../lib/middleware/wsRateLimit.js";
import { InMemoryRoomManager } from "../features/chat/room-manager.js";
import { createEventHandler } from "../features/chat/chat.handlers.js";
import type { WSConnection } from "../features/chat/room-manager.js";

const roomManager = new InMemoryRoomManager();
const handleEvent = createEventHandler(roomManager);

const WS_ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "Invalid or tampered WebSocket token",
  expired_token: "WebSocket token has expired",
  origin_mismatch: "Token origin does not match connection origin",
  app_not_found: "Application not found",
  unauthorized: "Authentication failed",
};

export const wsRoute = new Hono();

wsRoute.use("/ws", createWsUpgradeRateLimitMiddleware());

wsRoute.get("/ws", async (c, next) => {
  const upgradeWebSocket = getUpgradeWebSocket();

  const wsHandler = upgradeWebSocket((c) => {
    let connection: WSConnection | null = null;
    let authReady: Promise<void> | null = null;
    const pendingMessages: string[] = [];

    return {
      onOpen(_event, ws) {
        authReady = (async () => {
          const authResult = await authenticateWebSocket(c);

          if ("error" in authResult) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: {
                  code: authResult.error.toUpperCase(),
                  message:
                    WS_ERROR_MESSAGES[authResult.error] ??
                    "Authentication failed",
                },
              }),
            );
            ws.close(1008, authResult.error);
            return;
          }

          connection = {
            id: crypto.randomUUID(),
            userId: authResult.user.userId,
            userName: authResult.user.userName,
            organizationId: authResult.user.organizationId,
            role: authResult.user.role,
            ws,
          };

          const registered = roomManager.registerConnection(connection);
          if (!registered) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: {
                  code: "CONNECTION_LIMIT",
                  message: "Too many concurrent connections",
                },
              }),
            );
            ws.close(4009, "connection_limit");
            connection = null;
            return;
          }

          for (const msg of pendingMessages) {
            await handleEvent(connection, msg);
          }
          pendingMessages.length = 0;
        })();
      },

      async onMessage(event, _ws) {
        const data =
          typeof event.data === "string"
            ? event.data
            : event.data.toString();

        if (!connection) {
          pendingMessages.push(data);
          return;
        }

        if (authReady) await authReady;

        if (connection) {
          await handleEvent(connection, data);
        }
      },

      onClose() {
        if (connection) {
          roomManager.unregisterConnection(connection.id, connection.organizationId);
          roomManager.disconnectUser(connection.userId);
        }
      },

      onError(error) {
        console.error("[WS] Connection error:", error);
        if (connection) {
          roomManager.unregisterConnection(connection.id, connection.organizationId);
          roomManager.disconnectUser(connection.userId);
        }
      },
    };
  });

  return wsHandler(c, next);
});

export { roomManager };
