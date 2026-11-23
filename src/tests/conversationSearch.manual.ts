import assert from "node:assert/strict";
import { filterConversations } from "../features/admin-chat/utils/filterConversations";
import type { ChatConversationSummary } from "../features/admin-chat/types";

const alice: ChatConversationSummary = {
  inquiry: {
    id: "inquiry-1",
    customer: {
      id: "customer-1",
      name: "Alice Nambasa",
      email: "alice@example.com",
      role: "customer",
    },
    vehicle: { id: "vehicle-1", label: "Toyota Land Cruiser" },
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:05:00.000Z",
  },
  latestMessage: {
    id: "message-1",
    inquiryId: "inquiry-1",
    senderId: "customer-1",
    senderRole: "customer",
    message: "Is the pearl-white model available?",
    createdAt: "2026-01-01T10:05:00.000Z",
  },
  unreadCount: 1,
};

const bob: ChatConversationSummary = {
  inquiry: {
    id: "inquiry-2",
    customer: {
      id: "customer-2",
      name: "Bob Kato",
      email: "bob@example.com",
      role: "customer",
    },
    createdAt: "2026-01-02T10:00:00.000Z",
    updatedAt: "2026-01-02T10:05:00.000Z",
  },
  latestMessage: null,
  unreadCount: 0,
};

const conversations = [alice, bob];

assert.deepEqual(filterConversations(conversations, ""), conversations);
assert.deepEqual(filterConversations(conversations, " ALICE "), [alice]);
assert.deepEqual(filterConversations(conversations, "bob@example.com"), [bob]);
assert.deepEqual(filterConversations(conversations, "land cruiser"), [alice]);
assert.deepEqual(filterConversations(conversations, "pearl-white"), [alice]);
assert.deepEqual(filterConversations(conversations, "no results"), []);

console.log(JSON.stringify({ suite: "conversationSearch", passed: 6, failed: 0 }, null, 2));
