import type { ConversationFilters } from "./chat.types";

export type FilterOption = {
  id: string;
  label: string;
  filters: Pick<ConversationFilters, "status" | "assignedTo">;
  adminOnly?: boolean;
};
