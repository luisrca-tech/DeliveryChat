import { useState } from "react";
import type { Route } from "./+types/playground";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Widget Playground" },
    { name: "description", content: "Test the chat widget with custom appId and apiKey" },
  ];
}

const API_BASE_FALLBACK = "http://localhost:8000";

const isBrowser = typeof window !== "undefined";

function safeGetItem(key: string, fallback: string): string {
  if (!isBrowser) return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

type DeliveryChatAPI = {
  init: (opts: {
    appId: string;
    apiKey: string;
    apiBaseUrl?: string;
    position?: string;
  }) => void;
  destroy: () => void;
};

function getDeliveryChat(): DeliveryChatAPI | null {
  if (!isBrowser) return null;
  return (window as unknown as { DeliveryChat?: DeliveryChatAPI }).DeliveryChat ?? null;
}

function removePlaygroundEmbedScripts(): void {
  for (const el of document.querySelectorAll<HTMLScriptElement>(
    'script[src^="/widget.js"]',
  )) {
    el.remove();
  }
}

function loadPlaygroundEmbedScript(): Promise<void> {
  getDeliveryChat()?.destroy();
  removePlaygroundEmbedScripts();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `/widget.js?t=${Date.now()}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load widget embed"));
    document.body.appendChild(script);
  });
}

export default function Playground() {
  const [appId, setAppId] = useState(() => safeGetItem("pg_appId", ""));
  const [apiKey, setApiKey] = useState(() => safeGetItem("pg_apiKey", ""));
  const [apiBaseUrl, setApiBaseUrl] = useState(
    () => safeGetItem("pg_apiBaseUrl", API_BASE_FALLBACK),
  );
  const [isActive, setIsActive] = useState(false);

  const handleStart = async () => {
    if (!appId.trim() || !apiKey.trim()) return;

    localStorage.setItem("pg_appId", appId);
    localStorage.setItem("pg_apiKey", apiKey);
    localStorage.setItem("pg_apiBaseUrl", apiBaseUrl);

    try {
      await loadPlaygroundEmbedScript();
    } catch (e) {
      console.error(e);
      return;
    }

    getDeliveryChat()?.destroy();

    setTimeout(() => {
      getDeliveryChat()?.init({
        appId: appId.trim(),
        apiKey: apiKey.trim(),
        apiBaseUrl: apiBaseUrl.trim() || undefined,
        position: "bottom-right",
      });
      setIsActive(true);
    }, 100);
  };

  const handleStop = () => {
    getDeliveryChat()?.destroy();
    setIsActive(false);
  };

  const handleClear = () => {
    handleStop();
    setAppId("");
    setApiKey("");
    setApiBaseUrl(API_BASE_FALLBACK);
    localStorage.removeItem("pg_appId");
    localStorage.removeItem("pg_apiKey");
    localStorage.removeItem("pg_apiBaseUrl");
  };

  return (
    <main className="min-h-screen bg-linear-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-lg mx-auto px-6 py-16">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <a
              href="/"
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              &larr; Home
            </a>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Widget Playground
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Test the chat widget as a visitor with any org/application.
          </p>
        </header>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              API Base URL
            </label>
            <input
              type="text"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder={API_BASE_FALLBACK}
              disabled={isActive}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Application ID
            </label>
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="e2af1739-f35d-4a50-a4f8-d787e92924d6"
              disabled={isActive}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-sky-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              API Key
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="dk_live_..."
              disabled={isActive}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-sky-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          <div className="flex gap-2 pt-2">
            {!isActive ? (
              <button
                onClick={handleStart}
                disabled={!appId.trim() || !apiKey.trim()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start Chat
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Stop Chat
              </button>
            )}
            <button
              onClick={handleClear}
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {isActive && (
          <div className="mt-4 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4">
            <p className="text-sm text-green-800 dark:text-green-200">
              <strong>Widget active</strong> — look for the chat button in the bottom-right corner.
              Open it and send a message to create a support conversation.
            </p>
          </div>
        )}

        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            How to get the values
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-600 dark:text-slate-300 text-xs">
            <li>Log into the <strong>Admin dashboard</strong> (port 3000)</li>
            <li>Go to <strong>Settings &rarr; API Keys</strong></li>
            <li>Copy your <strong>Application ID</strong> (UUID) and a <strong>Live API Key</strong> (dk_live_...)</li>
            <li>Paste them above and click Start Chat</li>
            <li>Open the <strong>Admin Conversations page</strong> in another tab to accept messages</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
