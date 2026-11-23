import type { ChatConversationSummary } from "../types";

export function filterConversations(
  conversations: ChatConversationSummary[],
  query: string,
): ChatConversationSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return conversations;

  return conversations.filter(({ inquiry, latestMessage }) =>
    [
      inquiry.customer.name,
      inquiry.customer.email ?? "",
      inquiry.vehicle?.label ?? "",
      latestMessage?.message ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}
