/**
 * Creative Panel Conversation Types
 * Represents data structures for conversation persistence
 */

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  model_used: string;
  total_messages: number;
  total_tokens: number;
  credits_used: number;
  free_conversations_used: number;
  created_at: string;
  updated_at: string;
  archived: boolean;
  pinned: boolean;
  tags?: string[];
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens_used: number;
  is_free: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationListItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  total_messages: number;
  archived: boolean;
  pinned: boolean;
}

export interface CreateConversationInput {
  title: string;
  description?: string;
  model_used?: string;
}

export interface UpdateConversationInput {
  title?: string;
  description?: string;
  archived?: boolean;
  pinned?: boolean;
  tags?: string[];
}

export interface ConversationStats {
  total_conversations: number;
  archived_conversations: number;
  total_messages: number;
  total_tokens: number;
  total_credits_used: number;
}

export type ConversationError =
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'SYNC_FAILED'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR';

export interface ConversationErrorResponse {
  type: ConversationError;
  message: string;
  details?: Record<string, unknown>;
}
