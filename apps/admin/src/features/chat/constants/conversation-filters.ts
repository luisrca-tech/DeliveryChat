import type { FilterOption } from "../types/conversation-filters.types";

export const filterOptions: FilterOption[] = [
  {
    id: "all",
    label: "All",
    filters: { status: ["pending", "active"] },
    adminOnly: true,
  },
  // The queue is human-waiting conversations only: a live AI thread also sits
  // at status=pending (by design, for race-safe takeover) and must not appear
  // here until it escalates (which flips handledBy to "human").
  { id: "queue", label: "Queue", filters: { status: "pending", handledBy: "human" } },
  {
    id: "mine",
    label: "My Chats",
    filters: { status: "active", assignedTo: "me" },
  },
  { id: "closed", label: "Closed", filters: { status: "closed" } },
];
