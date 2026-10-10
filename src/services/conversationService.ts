/**
 * Conversation Service
 * Manages conversation persistence to Supabase database
 */

import { supabase } from '@/lib/supabase';
import {
  Conversation,
  ConversationMessage,
  CreateConversationInput,
  UpdateConversationInput,
  ConversationListItem,
  ConversationError,
} from '@/types/conversation';

export class ConversationService {
  /**
   * Create a new conversation
   */
  async createConversation(
    userId: string,
    input: CreateConversationInput
  ): Promise<Conversation> {
    if (!input.title || input.title.trim().length === 0) {
      throw new Error('Conversation title is required');
    }

    const { data, error } = await supabase
      .from('creative_conversations')
      .insert({
        user_id: userId,
        title: input.title.trim(),
        description: input.description || null,
        model_used: input.model_used || 'openai/gpt-3.5-turbo',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create conversation: ${error.message}`);
    return data;
  }

  /**
   * Add message to conversation
   */
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    tokensUsed: number = 0,
    isFree: boolean = false
  ): Promise<ConversationMessage> {
    if (!content || content.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }

    const { data, error } = await supabase
      .from('creative_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content: content.trim(),
        tokens_used: tokensUsed,
        is_free: isFree,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add message: ${error.message}`);

    // Update conversation stats
    await this.updateConversationStats(conversationId, tokensUsed, isFree);

    return data;
  }

  /**
   * Load all messages for a conversation
   */
  async loadConversation(conversationId: string): Promise<ConversationMessage[]> {
    const { data, error } = await supabase
      .from('creative_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to load conversation: ${error.message}`);
    return data || [];
  }

  /**
   * Load conversation with pagination (for lazy loading)
   */
  async loadConversationPaginated(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ConversationMessage[]> {
    const { data, error } = await supabase
      .from('creative_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to load conversation: ${error.message}`);
    return (data || []).reverse();
  }

  /**
   * List user's conversations with pagination
   */
  async listConversations(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      archived?: boolean;
      pinned?: boolean;
    } = {}
  ): Promise<ConversationListItem[]> {
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    let query = supabase
      .from('creative_conversations')
      .select('id, title, created_at, updated_at, total_messages, archived, pinned')
      .eq('user_id', userId);

    if (options.archived !== undefined) {
      query = query.eq('archived', options.archived);
    }

    const { data, error } = await query
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to list conversations: ${error.message}`);
    return data || [];
  }

  /**
   * Get single conversation details
   */
  async getConversation(conversationId: string): Promise<Conversation> {
    const { data, error } = await supabase
      .from('creative_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error) throw new Error(`Conversation not found: ${error.message}`);
    return data;
  }

  /**
   * Update conversation metadata
   */
  async updateConversation(
    conversationId: string,
    updates: UpdateConversationInput
  ): Promise<Conversation> {
    const { data, error } = await supabase
      .from('creative_conversations')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update conversation: ${error.message}`);
    return data;
  }

  /**
   * Archive/unarchive conversation
   */
  async archiveConversation(
    conversationId: string,
    archived: boolean = true
  ): Promise<Conversation> {
    return this.updateConversation(conversationId, { archived });
  }

  /**
   * Pin/unpin conversation
   */
  async pinConversation(
    conversationId: string,
    pinned: boolean = true
  ): Promise<Conversation> {
    return this.updateConversation(conversationId, { pinned });
  }

  /**
   * Delete conversation and all its messages
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const { error } = await supabase
      .from('creative_conversations')
      .delete()
      .eq('id', conversationId);

    if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
  }

  /**
   * Search conversations by title or description
   */
  async searchConversations(
    userId: string,
    query: string,
    limit: number = 10
  ): Promise<ConversationListItem[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = `%${query.trim()}%`;

    const { data, error } = await supabase
      .from('creative_conversations')
      .select('id, title, created_at, updated_at, total_messages, archived, pinned')
      .eq('user_id', userId)
      .ilike('title', searchTerm)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Search failed: ${error.message}`);
    return data || [];
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(userId: string): Promise<{
    total: number;
    archived: number;
    pinned: number;
    totalMessages: number;
    totalTokens: number;
    totalCreditsUsed: number;
  }> {
    const { data: conversations, error: convError } = await supabase
      .from('creative_conversations')
      .select('id, archived, pinned, total_messages, total_tokens, credits_used')
      .eq('user_id', userId);

    if (convError) throw new Error(`Failed to get stats: ${convError.message}`);

    const stats = {
      total: conversations?.length || 0,
      archived: conversations?.filter((c) => c.archived).length || 0,
      pinned: conversations?.filter((c) => c.pinned).length || 0,
      totalMessages: conversations?.reduce((sum, c) => sum + (c.total_messages || 0), 0) || 0,
      totalTokens: conversations?.reduce((sum, c) => sum + (c.total_tokens || 0), 0) || 0,
      totalCreditsUsed: conversations?.reduce((sum, c) => sum + (c.credits_used || 0), 0) || 0,
    };

    return stats;
  }

  /**
   * Update conversation statistics
   */
  private async updateConversationStats(
    conversationId: string,
    tokensUsed: number,
    isFree: boolean
  ): Promise<void> {
    const { data: conversation, error: fetchError } = await supabase
      .from('creative_conversations')
      .select('total_messages, total_tokens, credits_used, free_conversations_used')
      .eq('id', conversationId)
      .single();

    if (fetchError) {
      console.error('Failed to fetch conversation stats:', fetchError);
      return;
    }

    const updates = {
      total_messages: (conversation?.total_messages || 0) + 1,
      total_tokens: (conversation?.total_tokens || 0) + tokensUsed,
      credits_used: isFree ? conversation?.credits_used || 0 : (conversation?.credits_used || 0) + 1,
      free_conversations_used: isFree
        ? (conversation?.free_conversations_used || 0) + 1
        : conversation?.free_conversations_used || 0,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('creative_conversations')
      .update(updates)
      .eq('id', conversationId);

    if (updateError) {
      console.error('Failed to update conversation stats:', updateError);
    }
  }

  /**
   * Export conversation as JSON
   */
  async exportConversation(conversationId: string): Promise<string> {
    const conversation = await this.getConversation(conversationId);
    const messages = await this.loadConversation(conversationId);

    const export_data = {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        description: conversation.description,
        model_used: conversation.model_used,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        stats: {
          total_messages: conversation.total_messages,
          total_tokens: conversation.total_tokens,
          credits_used: conversation.credits_used,
        },
      },
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        tokens_used: m.tokens_used,
        is_free: m.is_free,
        created_at: m.created_at,
      })),
      exported_at: new Date().toISOString(),
    };

    return JSON.stringify(export_data, null, 2);
  }

  /**
   * Clear all conversations for a user (use with caution)
   */
  async clearAllConversations(userId: string): Promise<void> {
    const { error } = await supabase
      .from('creative_conversations')
      .delete()
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to clear conversations: ${error.message}`);
  }
}

export const conversationService = new ConversationService();
