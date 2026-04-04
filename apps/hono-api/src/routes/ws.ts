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

    return {
      async onOpen(_event, ws) {
        const authResult = await authenticateWebSocket(c);

        if (!authResult) {
          ws.send(
            JSON.stringify({
              type: "error",
              payload: { code: "UNAUTHORIZED", message: "Authentication failed" },
            }),
          );
          ws.close(1008, "Unauthorized");
          return;
        }

        connection = {
          id: crypto.randomUUID(),
          userId: authResult.userId,
          organizationId: authResult.organizationId,
          role: authResult.role,
          ws,
        };
      },

      async onMessage(event, _ws) {
        if (!connection) return;

        const data =
          typeof event.data === "string"
            ? event.data
            : event.data.toString();

        await handleEvent(connection, data);
      },

      onClose() {
        if (connection) {
          roomManager.disconnectUser(connection.userId);
        }
      },

      onError(error) {
        console.error("[WS] Connection error:", error);
        if (connection) {
          roomManager.disconnectUser(connection.userId);
        }
      },
    };
  });

  return wsHandler(c, next);
});

export { roomManager };
