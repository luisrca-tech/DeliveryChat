import type { FilterOption } from "../types/conversation-filters.types";

export const filterOptions: FilterOption[] = [
  { id: "all", label: "All", filters: { status: ["pending", "active"] }, adminOnly: true },
  { id: "queue", label: "Queue", filters: { status: "pending" } },
  { id: "mine", label: "My Chats", filters: { status: "active", assignedTo: "me" } },
  { id: "closed", label: "Closed", filters: { status: "closed" } },
];
