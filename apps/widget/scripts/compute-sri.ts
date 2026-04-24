import { createHash } from "node:crypto";

export function computeSriHash(content: Buffer): string {
  const digest = createHash("sha384").update(content).digest("base64");
  return `sha384-${digest}`;
}

export interface SriArtifact {
  file: string;
  algorithm: "sha384";
  integrity: string;
  bytes: number;
}

export function formatSriArtifact({
  file,
  content,
}: {
  file: string;
  content: Buffer;
}): SriArtifact {
  return {
    file,
    algorithm: "sha384",
    integrity: computeSriHash(content),
    bytes: content.length,
  };
}
