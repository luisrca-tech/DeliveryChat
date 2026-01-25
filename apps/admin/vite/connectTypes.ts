import type { Readable } from "node:stream";

export type ConnectRequest = Readable & {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

export type ConnectResponse = {
  statusCode: number;
  setHeader: (name: string, value: string | string[]) => void;
  end: (body?: Buffer) => void;
};

export type ConnectNext = () => void;

