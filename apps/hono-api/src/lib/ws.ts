import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";

let nodeWebSocket: ReturnType<typeof createNodeWebSocket> | null = null;

export function initWebSocket(app: Hono) {
  nodeWebSocket = createNodeWebSocket({ app });
  return nodeWebSocket;
}

export function getUpgradeWebSocket() {
  if (!nodeWebSocket) {
    throw new Error("WebSocket not initialized. Call initWebSocket(app) first.");
  }
  return nodeWebSocket.upgradeWebSocket;
}

export function getInjectWebSocket() {
  if (!nodeWebSocket) {
    throw new Error("WebSocket not initialized. Call initWebSocket(app) first.");
  }
  return nodeWebSocket.injectWebSocket;
}
