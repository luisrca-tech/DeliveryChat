import { QueryClient } from "@tanstack/react-query";

let browserQueryClient: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    return new QueryClient();
  }

  if (!browserQueryClient) {
    browserQueryClient = new QueryClient();
  }

  return browserQueryClient;
}

