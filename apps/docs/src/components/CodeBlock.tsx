"use client";

import React, { useState } from "react";

interface CodeBlockProps {
  language?: string;
  title?: string;
  children: string;
}

export function CodeBlock({ language, title, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="my-6 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      {(title || language) && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            {title && (
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {title}
              </span>
            )}
            {language && (
              <span className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-mono">
                {language}
              </span>
            )}
          </div>
          <button
            onClick={copyToClipboard}
            className="text-xs px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            aria-label="Copy code"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      )}
      <div className="relative">
        {!title && !language && (
          <button
            onClick={copyToClipboard}
            className="absolute top-2 right-2 text-xs px-3 py-1 rounded bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            aria-label="Copy code"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        )}
        <pre className="p-4 overflow-x-auto bg-gray-50 dark:bg-gray-950">
          <code className={`text-sm ${language ? `language-${language}` : ""}`}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
}
