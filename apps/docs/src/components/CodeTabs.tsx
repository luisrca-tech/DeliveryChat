"use client";

import React, { useState } from "react";

interface CodeTab {
  label: string;
  language?: string;
  code: string;
}

interface CodeTabsProps {
  tabs: CodeTab[];
}

export function CodeTabs({ tabs }: CodeTabsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const active = tabs[activeIndex] ?? tabs[0];

  if (!active) return null;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(active.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="my-6 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex gap-1">
          {tabs.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                i === activeIndex
                  ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {active.language && (
            <span className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-mono">
              {active.language}
            </span>
          )}
          <button
            onClick={copyToClipboard}
            className="text-xs px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            aria-label="Copy code"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="p-4 overflow-x-auto bg-gray-50 dark:bg-gray-950">
        <code
          className={`text-sm ${active.language ? `language-${active.language}` : ""}`}
        >
          {active.code}
        </code>
      </pre>
    </div>
  );
}
