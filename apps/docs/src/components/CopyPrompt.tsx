"use client";

import React, { useState } from "react";
import { SDK_PROMPT } from "../constants/SdkPrompt";
import { EMBED_PROMPT } from "../constants/EmbedPrompt";

interface CopyPromptProps {
  prompt: string;
  title?: string;
}

export function SdkCopyPrompt() {
  return <CopyPrompt prompt={SDK_PROMPT} title="SDK Integration Prompt" />;
}

export function EmbedCopyPrompt() {
  return <CopyPrompt prompt={EMBED_PROMPT} title="Widget Embed Prompt" />;
}

export function CopyPrompt({ prompt, title = "AI Quickstart Prompt" }: CopyPromptProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="my-6 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {title}
          </span>
          <span className="text-xs px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-medium">
            AI
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          >
            {expanded ? "Hide" : "Preview"}
          </button>
          <button
            onClick={copyToClipboard}
            className="text-xs px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
          >
            {copied ? "Copied!" : "Copy prompt"}
          </button>
        </div>
      </div>
      {expanded && (
        <pre className="p-4 overflow-x-auto bg-gray-50 dark:bg-gray-950 max-h-96 overflow-y-auto">
          <code className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {prompt}
          </code>
        </pre>
      )}
    </div>
  );
}
