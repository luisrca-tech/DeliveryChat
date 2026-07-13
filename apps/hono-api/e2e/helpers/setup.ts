import { request, APIRequestContext } from "@playwright/test";
import WebSocket from "ws";

const BASE_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000";

export interface TestContext {
  api: APIRequestContext;
  baseUrl: string;
  wsUrl: string;
}

export async function createTestContext(): Promise<TestContext> {
  const api = await request.newContext({
    baseURL: BASE_URL,
  });

  return { api, baseUrl: BASE_URL, wsUrl: WS_URL };
}

export function connectWebSocket(
  url: string,
): Promise<{ ws: WebSocket; messages: string[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: string[] = [];

    ws.on("message", (data) => {
      messages.push(data.toString());
    });

    ws.on("open", () => {
      resolve({ ws, messages });
    });

    ws.on("error", (err) => {
      reject(err);
    });
  });
}

export function waitForMessage(
  messages: string[],
  predicate: (parsed: any) => boolean,
  // Every send round-trips through a remote Postgres before it is broadcast, so
  // under full-suite load 5s was tight enough to flake.
  timeoutMs = 15000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const startLen = messages.length;
    const deadline = Date.now() + timeoutMs;

    const check = () => {
      // Check new messages since we started waiting
      for (let i = 0; i < messages.length; i++) {
        try {
          const parsed = JSON.parse(messages[i]);
          if (predicate(parsed)) {
            return resolve(parsed);
          }
        } catch {
          // skip non-JSON messages
        }
      }

      if (Date.now() > deadline) {
        return reject(
          new Error(
            `Timed out waiting for message. Received: ${JSON.stringify(messages)}`,
          ),
        );
      }

      setTimeout(check, 50);
    };

    check();
  });
}

export function sendWsEvent(ws: WebSocket, event: object) {
  ws.send(JSON.stringify(event));
}

/**
 * Joins a room and waits until the server has actually processed the join.
 *
 * The server buffers client events until authentication resolves, then handles
 * them in order — so a `pong` for a `ping` sent right after `room:join` proves
 * the join was processed. Sleeping instead is a race: staff auth costs extra DB
 * round-trips, and their join can land after a message was already broadcast,
 * making them miss it.
 */
export async function joinRoomAndSettle(
  ws: WebSocket,
  messages: string[],
  conversationId: string,
  timeoutMs = 10000,
): Promise<void> {
  const countPongs = () =>
    messages.filter((raw) => {
      try {
        return JSON.parse(raw).type === "pong";
      } catch {
        return false;
      }
    }).length;

  // A connection may join several rooms, so wait for a NEW pong rather than
  // any pong — an earlier one would satisfy the barrier immediately.
  const before = countPongs();

  sendWsEvent(ws, { type: "room:join", payload: { conversationId } });
  sendWsEvent(ws, { type: "ping" });

  const deadline = Date.now() + timeoutMs;
  while (countPongs() <= before) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for room:join to settle on conversation ${conversationId}. Received: ${JSON.stringify(messages)}`,
      );
    }
    await sleep(50);
  }
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
