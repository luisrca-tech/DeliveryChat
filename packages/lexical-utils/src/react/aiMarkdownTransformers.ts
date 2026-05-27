import type { Transformer } from "@lexical/markdown";
import {
  HEADING,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ORDERED_LIST,
  UNORDERED_LIST,
} from "@lexical/markdown";

export const AI_MARKDOWN_TRANSFORMERS: Transformer[] = [
  HEADING,
  UNORDERED_LIST,
  ORDERED_LIST,
  BOLD_STAR,
  BOLD_UNDERSCORE,
];
