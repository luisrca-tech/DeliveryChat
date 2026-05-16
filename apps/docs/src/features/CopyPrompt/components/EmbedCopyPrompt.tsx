"use client";

import React from "react";
import { CopyPrompt } from "./CopyPrompt";
import { EMBED_PROMPT } from "../constants/EmbedPrompt";

export function EmbedCopyPrompt() {
  return <CopyPrompt prompt={EMBED_PROMPT} title="Widget Embed Prompt" />;
}
