import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";

type NodeWebSocketHelpers = ReturnType<typeof createNodeWebSocket>;

let nodeWebSocket: NodeWebSocketHelpers | null = null;

export function initWebSocket(app: Hono): NodeWebSocketHelpers {
  nodeWebSocket = createNodeWebSocket({ app });
  return nodeWebSocket;
}

export function getUpgradeWebSocket(): NodeWebSocketHelpers["upgradeWebSocket"] {
  if (!nodeWebSocket) {
    throw new Error("WebSocket not initialized. Call initWebSocket(app) first.");
  }
  return nodeWebSocket.upgradeWebSocket;
}

export function getInjectWebSocket(): NodeWebSocketHelpers["injectWebSocket"] {
  if (!nodeWebSocket) {
    throw new Error("WebSocket not initialized. Call initWebSocket(app) first.");
  }
  return nodeWebSocket.injectWebSocket;
}
