export type PageMapItem = {
  kind: string;
  route?: string;
  name?: string;
  children?: PageMapItem[];
} & Record<string, unknown>;
