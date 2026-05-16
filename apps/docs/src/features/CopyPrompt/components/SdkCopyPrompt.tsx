"use client";

import React from "react";
import { CopyPrompt } from "./CopyPrompt";
import { SDK_PROMPT } from "../constants/SdkPrompt";

export function SdkCopyPrompt() {
  return <CopyPrompt prompt={SDK_PROMPT} title="SDK Integration Prompt" />;
}
