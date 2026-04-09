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
  timeoutMs = 5000,
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

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
