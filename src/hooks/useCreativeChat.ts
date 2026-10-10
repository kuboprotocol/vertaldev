/**
 * useCreativeChat Hook
 * Manages chat state, quota tracking, and OpenRouter API calls
 */

import { useState, useCallback, useRef } from 'react';
import { openRouterService, OpenRouterMessage } from '@/services/openrouterService';
import { quotaService, QuotaStatus } from '@/services/quotaService';
import { useAuth } from './useAuth';

export interface ChatMessage extends OpenRouterMessage {
  id: string;
  timestamp: string;
  isFree?: boolean;
}

export interface UseCreativeChatReturn {
  // State
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  quotaStatus: QuotaStatus;

  // Actions
  sendMessage: (content: string, creditsAvailable: number) => Promise<void>;
  clearMessages: () => void;
  resetError: () => void;

  // Info
  canSendMessage: boolean;
  messageCount: number;
}

export function useCreativeChat(): UseCreativeChatReturn {
  const { user } = useAuth();
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

  // Get fresh quota status
  const refreshQuota = useCallback((creditsAvailable: number) => {
    if (user?.id) {
      const status = quotaService.getQuotaStatus(user.id, creditsAvailable);
      setQuotaStatus(status);
    }
  }, [user?.id]);

  // Send message to OpenRouter
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

        // Add user message
        const userMessageId = `msg-${++messageIdRef.current}`;
        const userMessage: ChatMessage = {
          id: userMessageId,
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
          isFree: isFreeConversation,
        };

        setMessages((prev) => [...prev, userMessage]);

        // Call OpenRouter API
        const response = await openRouterService.chat({
          messages: messages.map(({ id, timestamp, isFree, ...msg }) => msg),
        });

        // Add assistant message
        const assistantMessageId = `msg-${++messageIdRef.current}`;
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: response.choices[0]?.message?.content || 'No response',
          timestamp: new Date().toISOString(),
          isFree: isFreeConversation,
        };

        setMessages((prev) => [...prev, assistantMessage]);

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
    [user?.id, messages, refreshQuota]
  );

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
    messages,
    loading,
    error,
    quotaStatus,
    sendMessage,
    clearMessages,
    resetError,
    canSendMessage: !loading && !!user?.id,
    messageCount: messages.length,
  };
}
