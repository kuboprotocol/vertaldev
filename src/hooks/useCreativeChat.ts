/**
 * useCreativeChat Hook
 * Manages chat state, quota tracking, OpenRouter API calls, and database persistence
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { openRouterService, OpenRouterMessage } from '@/services/openrouterService';
import { quotaService, QuotaStatus } from '@/services/quotaService';
import { conversationService } from '@/services/conversationService';
import { Conversation, ConversationListItem } from '@/types/conversation';
import { useAuth } from './useAuth';

export interface ChatMessage extends OpenRouterMessage {
  id: string;
  timestamp: string;
  isFree?: boolean;
}

export interface UseCreativeChatReturn {
  // Phase 2 State
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  quotaStatus: QuotaStatus;

  // Phase 2 Actions
  sendMessage: (content: string, creditsAvailable: number) => Promise<void>;
  clearMessages: () => void;
  resetError: () => void;

  // Phase 2 Info
  canSendMessage: boolean;
  messageCount: number;

  // Phase 3 State
  conversationId: string | null;
  conversationTitle: string;
  conversations: ConversationListItem[];
  loadingConversations: boolean;

  // Phase 3 Actions
  createNewConversation: (title: string) => Promise<string>;
  loadConversation: (conversationId: string) => Promise<void>;
  updateConversationTitle: (title: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  archiveConversation: (archived: boolean) => Promise<void>;
  pinConversation: (conversationId: string, pinned: boolean) => Promise<void>;
  loadConversations: () => Promise<void>;
}

export function useCreativeChat(): UseCreativeChatReturn {
  const { user } = useAuth();

  // Phase 2 state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus>({
    freeConversationsToday: 0,
    freeConversationsRemaining: 5,
    freeLimit: 5,
    resetTime: '',
    canUseFree: true,
    creditsAvailable: 0,
  });
  const messageIdRef = useRef(0);

  // Phase 3 state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState('New Conversation');
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  // Get fresh quota status
  const refreshQuota = useCallback((creditsAvailable: number) => {
    if (user?.id) {
      const status = quotaService.getQuotaStatus(user.id, creditsAvailable);
      setQuotaStatus(status);
    }
  }, [user?.id]);

  // Load conversations from database
  const loadConversations = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoadingConversations(true);
      const convs = await conversationService.listConversations(user.id, {
        archived: false,
        limit: 20,
        offset: 0,
      });
      setConversations(convs);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }, [user?.id]);

  // Create new conversation
  const createNewConversation = useCallback(
    async (title: string): Promise<string> => {
      if (!user?.id) throw new Error('Not authenticated');

      try {
        const conversation = await conversationService.createConversation(user.id, {
          title,
        });
        setConversationId(conversation.id);
        setConversationTitle(conversation.title);
        setMessages([]);
        messageIdRef.current = 0;
        await loadConversations();
        return conversation.id;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create conversation';
        setError(errorMessage);
        throw err;
      }
    },
    [user?.id, loadConversations]
  );

  // Load specific conversation
  const loadConversationMessages = useCallback(
    async (convId: string) => {
      if (!user?.id) return;

      try {
        setLoading(true);
        const conversation = await conversationService.getConversation(convId);
        const msgs = await conversationService.loadConversation(convId);

        setConversationId(conversation.id);
        setConversationTitle(conversation.title);
        setMessages(
          msgs.map((msg, index) => ({
            id: `msg-${index}`,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: msg.created_at,
            isFree: msg.is_free,
          }))
        );
        messageIdRef.current = msgs.length;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load conversation';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // Update conversation title
  const updateConversationTitle = useCallback(
    async (newTitle: string) => {
      if (!conversationId) return;

      try {
        await conversationService.updateConversation(conversationId, { title: newTitle });
        setConversationTitle(newTitle);
        await loadConversations();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update title';
        setError(errorMessage);
      }
    },
    [conversationId, loadConversations]
  );

  // Delete conversation
  const deleteConversationHandler = useCallback(
    async (convId: string) => {
      try {
        await conversationService.deleteConversation(convId);
        if (conversationId === convId) {
          setConversationId(null);
          setConversationTitle('New Conversation');
          setMessages([]);
        }
        await loadConversations();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete conversation';
        setError(errorMessage);
      }
    },
    [conversationId, loadConversations]
  );

  // Archive conversation
  const archiveConversationHandler = useCallback(
    async (archived: boolean) => {
      if (!conversationId) return;

      try {
        await conversationService.archiveConversation(conversationId, archived);
        await loadConversations();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to archive conversation';
        setError(errorMessage);
      }
    },
    [conversationId, loadConversations]
  );

  // Pin conversation
  const pinConversationHandler = useCallback(
    async (convId: string, pinned: boolean) => {
      try {
        await conversationService.pinConversation(convId, pinned);
        await loadConversations();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to pin conversation';
        setError(errorMessage);
      }
    },
    [loadConversations]
  );

  // Send message to OpenRouter with database persistence
  const sendMessage = useCallback(
    async (content: string, creditsAvailable: number) => {
      if (!user?.id) {
        setError('Not authenticated');
        return;
      }

      if (!content.trim()) {
        setError('Message cannot be empty');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Create conversation if needed
        let convId = conversationId;
        if (!convId) {
          convId = await createNewConversation('Conversation');
        }

        // Check quota
        const status = quotaService.getQuotaStatus(user.id, creditsAvailable);
        const isFreeConversation = status.canUseFree;

        // If no free slot and no credits, error
        if (!isFreeConversation && creditsAvailable <= 0) {
          setError(
            'No free conversations left today and no credits available. Purchase credits to continue.'
          );
          return;
        }

        // Add user message locally and to database
        const userMessageId = `msg-${++messageIdRef.current}`;
        const userMessage: ChatMessage = {
          id: userMessageId,
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
          isFree: isFreeConversation,
        };

        setMessages((prev) => [...prev, userMessage]);

        // Save user message to database
        await conversationService.addMessage(convId, 'user', content, 0, isFreeConversation);

        // Call OpenRouter API
        const response = await openRouterService.chat({
          messages: messages.map(({ id, timestamp, isFree, ...msg }) => msg),
        });

        // Add assistant message locally and to database
        const assistantMessageId = `msg-${++messageIdRef.current}`;
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: response.choices[0]?.message?.content || 'No response',
          timestamp: new Date().toISOString(),
          isFree: isFreeConversation,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Save assistant message to database
        const tokensUsed = response.usage?.total_tokens || 0;
        await conversationService.addMessage(
          convId,
          'assistant',
          assistantMessage.content,
          tokensUsed,
          isFreeConversation
        );

        // Use quota if free
        if (isFreeConversation) {
          quotaService.useFreConversation();
        }

        // Refresh quota status
        refreshQuota(creditsAvailable - (isFreeConversation ? 0 : 1));
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMessage);
        console.error('Chat error:', err);
      } finally {
        setLoading(false);
      }
    },
    [user?.id, messages, conversationId, createNewConversation, refreshQuota]
  );

  // Load conversations on mount
  useEffect(() => {
    if (user?.id) {
      loadConversations();
    }
  }, [user?.id, loadConversations]);

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    messageIdRef.current = 0;
  }, []);

  // Reset error
  const resetError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Phase 2
    messages,
    loading,
    error,
    quotaStatus,
    sendMessage,
    clearMessages,
    resetError,
    canSendMessage: !loading && !!user?.id,
    messageCount: messages.length,

    // Phase 3
    conversationId,
    conversationTitle,
    conversations,
    loadingConversations,
    createNewConversation,
    loadConversation: loadConversationMessages,
    updateConversationTitle,
    deleteConversation: deleteConversationHandler,
    archiveConversation: archiveConversationHandler,
    pinConversation: pinConversationHandler,
    loadConversations,
  };
}
