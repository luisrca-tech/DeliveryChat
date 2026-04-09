import { Hono } from "hono";
import { getUpgradeWebSocket } from "../lib/ws.js";
import { authenticateWebSocket } from "../lib/middleware/wsAuth.js";
import { InMemoryRoomManager } from "../features/chat/room-manager.js";
import { createEventHandler } from "../features/chat/chat.handlers.js";
import type { WSConnection } from "../features/chat/room-manager.js";

const roomManager = new InMemoryRoomManager();
const handleEvent = createEventHandler(roomManager);

export const wsRoute = new Hono();

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

          if (!authResult) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: {
                  code: "UNAUTHORIZED",
                  message: "Authentication failed",
                },
              }),
            );
            ws.close(1008, "Unauthorized");
            return;
          }

          connection = {
            id: crypto.randomUUID(),
            userId: authResult.userId,
            userName: authResult.userName,
            organizationId: authResult.organizationId,
            role: authResult.role,
            ws,
          };

          roomManager.registerConnection(connection);

          // Process any messages that arrived during auth
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
          // Auth still in progress — queue the message
          pendingMessages.push(data);
          return;
        }

        // Ensure auth has completed
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
