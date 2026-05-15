import type { ChatMessage } from "./types/index.js";

export type SdkEventMap = {
  ready: void;
  open: void;
  close: void;
  "message:received": ChatMessage;
  "message:sent": ChatMessage;
  "conversation:started": { conversationId: string };
  "conversation:resolved": { conversationId: string };
  "unread:changed": { count: number };
};
