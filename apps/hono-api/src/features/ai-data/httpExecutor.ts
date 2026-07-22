import { lookup } from "node:dns/promises";
import { decryptSecret } from "../../lib/crypto/secretBox.js";
import { isPrivateAddress } from "./ssrfGuard.js";
import type { DataToolResult, ExecuteDataToolInput } from "./types.js";

const REQUEST_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 256 * 1024; // 256 KB

type HttpSourceConfig = {
  baseUrl: string;
  allowedHost: string;
  encryptedHeaders?: Record<string, string>;
};

type HttpToolConfig = {
  method: "GET";
  urlTemplate: string;
};

/**
 * Execute an HTTP-backed DataTool.
 *
 * Read-only by construction: the request is always a GET (never reads a method
 * from config or params). All SSRF guardrails are applied before the request
 * leaves the process. Errors are RETURNED, never thrown.
 */
export async function executeHttpTool(
  input: Pick<ExecuteDataToolInput, "tool" | "source" | "params">,
): Promise<DataToolResult> {
  const sourceConfig = input.source.config as HttpSourceConfig;
  const toolConfig = input.tool.config as HttpToolConfig;

  // Build URL — substitute ONLY validated params, URL-encoded.
  let path = toolConfig.urlTemplate;
  for (const [name, value] of Object.entries(input.params)) {
    const token = `{${name}}`;
    if (path.includes(token)) {
      path = path.split(token).join(encodeURIComponent(String(value)));
    }
  }
  if (/\{[^}]+\}/.test(path)) {
    return {
      ok: false,
      kind: "execution",
      error: "URL template contains unresolved placeholders",
    };
  }

  let url: URL;
  try {
    url = new URL(path, sourceConfig.baseUrl);
  } catch (error) {
    logError("invalid URL", input.tool.name, error);
    return { ok: false, kind: "execution", error: "Invalid request URL" };
  }

  // Guardrail 1: final host must exactly equal the allowed host.
  if (url.hostname !== sourceConfig.allowedHost) {
    return {
      ok: false,
      kind: "execution",
      error: "Request host is not the allowed host for this data source",
    };
  }

  // Guardrail 2: DNS-resolve and reject private/reserved addresses.
  try {
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.length === 0) {
      return { ok: false, kind: "execution", error: "Host did not resolve" };
    }
    for (const { address, family } of addresses) {
      if (isPrivateAddress(address, family)) {
        return {
          ok: false,
          kind: "execution",
          error: "Host resolves to a private or reserved address",
        };
      }
    }
  } catch (error) {
    logError("DNS resolution failed", input.tool.name, error);
    return {
      ok: false,
      kind: "execution",
      error: "Host could not be resolved",
    };
  }

  // Decrypt configured headers per request. Never log decrypted values.
  let headers: Record<string, string> = {};
  try {
    headers = decryptHeaders(sourceConfig.encryptedHeaders);
  } catch (error) {
    logError("header decryption failed", input.tool.name, error);
    return {
      ok: false,
      kind: "execution",
      error: "Failed to prepare request headers",
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET", // Guardrail: GET only, by construction.
      redirect: "manual", // Guardrail 3: never follow redirects.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), // Guardrail 4.
      headers: { accept: "application/json", ...headers },
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      logError("request timed out", input.tool.name);
      return { ok: false, kind: "timeout", error: "Request timed out" };
    }
    logError("request failed", input.tool.name, error);
    return { ok: false, kind: "execution", error: "Request failed" };
  }

  // Guardrail 3: a redirect response is an execution error.
  if (
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400)
  ) {
    return {
      ok: false,
      kind: "execution",
      error: "Redirect responses are not allowed",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: "execution",
      error: `Upstream returned status ${response.status}`,
    };
  }

  // Guardrail 5: response size cap — content-length fast path first.
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    return { ok: false, kind: "execution", error: "Response body too large" };
  }

  let bodyText: string;
  try {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      return { ok: false, kind: "execution", error: "Response body too large" };
    }
    bodyText = new TextDecoder().decode(buffer);
  } catch (error) {
    if (isTimeoutError(error)) {
      return { ok: false, kind: "timeout", error: "Request timed out" };
    }
    logError("reading response body failed", input.tool.name, error);
    return { ok: false, kind: "execution", error: "Failed to read response" };
  }

  // Guardrail 6: JSON only.
  try {
    const data: unknown = JSON.parse(bodyText);
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      kind: "execution",
      error: "Response was not valid JSON",
    };
  }
}

function decryptHeaders(
  encryptedHeaders: Record<string, string> | undefined,
): Record<string, string> {
  if (!encryptedHeaders) return {};
  const result: Record<string, string> = {};
  for (const [name, encryptedValue] of Object.entries(encryptedHeaders)) {
    result[name] = decryptSecret(encryptedValue);
  }
  return result;
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  return false;
}

function logError(context: string, toolName: string, error?: unknown): void {
  // Never logs URLs with substituted params or decrypted header values.
  console.error(`[ai-data.http] ${context}`, {
    tool: toolName,
    error: error instanceof Error ? error.message : undefined,
  });
}
