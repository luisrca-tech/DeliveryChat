import { setState, getState } from "./state.js";
import type { ConnectionError } from "./types/index.js";
import { ConnectionEngine } from "./ConnectionEngine.js";
import { MessageRouter } from "./MessageRouter.js";
import { MessagePipeline } from "./MessagePipeline.js";
import { EventEmitter } from "./EventEmitter.js";
import type { SdkEventMap } from "./SdkEventMap.js";

type WSConfig = {
  apiBaseUrl: string;
  appId: string;
  visitorId: string;
};

let engine: ConnectionEngine | null = null;
let router: MessageRouter | null = null;
let pipeline: MessagePipeline | null = null;
let emitter: EventEmitter<SdkEventMap> | null = null;

function getOrCreateModules(): { engine: ConnectionEngine; router: MessageRouter; pipeline: MessagePipeline } {
  if (!engine || !router || !pipeline) {
    emitter = emitter ?? new EventEmitter<SdkEventMap>();
    pipeline = new MessagePipeline({
      sendWS: (event) => engine?.send(event),
      emitter,
    });
    router = new MessageRouter({
      markServerError: (code) => engine?.markServerError(code),
      pipeline,
    });
    engine = new ConnectionEngine({
      onStateChange: (status, error) => {
        setState("connectionStatus", status);
        if (status === "connected") {
          setState("connectionError", null);
          rejoinRoomIfNeeded();
        } else if (error) {
          setState("connectionError", error);
          if (error.type === "permanent") {
            console.error(error.devMessage);
          } else {
            console.warn(error.devMessage);
          }
        }
      },
      onMessage: (event) => router!.handle(event),
    });
  }
  return { engine, router, pipeline };
}

function rejoinRoomIfNeeded(): void {
  const convId = getState("conversationId");
  if (!convId) return;
  const lastMsg = getState("messages").at(-1);
  sendWSMessage({
    type: "room:join",
    payload: {
      conversationId: convId,
      ...(lastMsg?.status === "sent" ? { lastMessageId: lastMsg.id } : {}),
    },
  });
}

export function connectWS(cfg: WSConfig): void {
  const { engine: eng } = getOrCreateModules();
  eng.connect(cfg);
}

export function disconnectWS(): void {
  if (engine) {
    engine.disconnect();
  }
  if (router) {
    router.cleanup();
  }
}

export function sendWSMessage(event: object): void {
  if (engine) {
    engine.send(event);
  }
}

export function getMessageRouter(): MessageRouter | null {
  return router;
}

export function getMessagePipeline(): MessagePipeline | null {
  return pipeline;
}

export function getEmitter(): EventEmitter<SdkEventMap> | null {
  return emitter;
}

export function resetWSModules(): void {
  if (engine) engine.disconnect();
  if (pipeline) pipeline.clearAllPending();
  if (router) router.cleanup();
  engine = null;
  router = null;
  pipeline = null;
  emitter = null;
}
