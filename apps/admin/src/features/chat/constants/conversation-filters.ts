import type { FilterOption } from "../types/conversation-filters.types";

export const filterOptions: FilterOption[] = [
  { id: "queue", label: "Queue", filters: { status: "pending" } },
  { id: "mine", label: "My Chats", filters: { status: "active", assignedTo: "me" } },
  { id: "all-active", label: "All Active", filters: { status: "active" }, adminOnly: true },
  { id: "closed", label: "Closed", filters: { status: "closed" } },
];
