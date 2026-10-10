import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCreativeChat } from './useCreativeChat';
import { useAuth } from './useAuth';
import * as conversationServiceModule from '@/services/conversationService';
import * as quotaServiceModule from '@/services/quotaService';
import * as openRouterServiceModule from '@/services/openrouterService';

vi.mock('./useAuth');
vi.mock('@/services/conversationService');
vi.mock('@/services/quotaService');
vi.mock('@/services/openrouterService');

const mockUserId = 'test-user-123';

describe('useCreativeChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { id: mockUserId },
    });
  });

  describe('initialization', () => {
    it('should initialize with default state', async () => {
      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue([]);

      const { result } = renderHook(() => useCreativeChat());

      expect(result.current.messages).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.conversationId).toBeNull();
      expect(result.current.conversationTitle).toBe('New Conversation');

      await waitFor(() => {
        expect(result.current.loadingConversations).toBe(false);
      });
      expect(result.current.conversations).toEqual([]);
    });

    it('should load conversations on mount when user is authenticated', async () => {
      const mockConversations = [
        { id: 'conv-1', title: 'Conv 1', created_at: '2024-01-01', updated_at: '2024-01-01', total_messages: 5, archived: false, pinned: false },
      ];

      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue(
        mockConversations
      );

      const { result } = renderHook(() => useCreativeChat());

      await waitFor(() => {
        expect(result.current.conversations).toEqual(mockConversations);
      });
    });

    it('should not load conversations when user is not authenticated', async () => {
      (useAuth as any).mockReturnValue({
        user: null,
      });

      const { result } = renderHook(() => useCreativeChat());

      expect(result.current.conversations).toEqual([]);
      expect(conversationServiceModule.conversationService.listConversations).not.toHaveBeenCalled();
    });
  });

  describe('createNewConversation', () => {
    it('should create a new conversation and return its ID', async () => {
      const mockConversation = {
        id: 'new-conv-123',
        title: 'New Conversation',
        user_id: mockUserId,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      (conversationServiceModule.conversationService.createConversation as any).mockResolvedValue(
        mockConversation
      );
      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue([]);

      const { result } = renderHook(() => useCreativeChat());

      let conversationId;
      await act(async () => {
        conversationId = await result.current.createNewConversation('New Conversation');
      });

      expect(conversationId).toBe('new-conv-123');
      expect(result.current.conversationId).toBe('new-conv-123');
      expect(result.current.conversationTitle).toBe('New Conversation');
      expect(result.current.messages).toEqual([]);
    });

    it('should throw error when not authenticated', async () => {
      (useAuth as any).mockReturnValue({
        user: null,
      });

      const { result } = renderHook(() => useCreativeChat());

      await expect(
        act(async () => {
          await result.current.createNewConversation('Test');
        })
      ).rejects.toThrow('Not authenticated');
    });

    it('should handle creation errors', async () => {
      const mockError = new Error('Creation failed');
      (conversationServiceModule.conversationService.createConversation as any).mockRejectedValue(
        mockError
      );
      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue([]);

      const { result } = renderHook(() => useCreativeChat());

      let threwError = false;
      await act(async () => {
        try {
          await result.current.createNewConversation('Test');
        } catch (e) {
          threwError = true;
        }
      });

      expect(threwError).toBe(true);
      expect(result.current.error).toBe('Creation failed');
    });
  });

  describe('loadConversation', () => {
    it('should load a conversation and its messages', async () => {
      const mockConversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      const mockMessages = [
        { id: 'msg-1', role: 'user', content: 'Hello', created_at: '2024-01-01', tokens_used: 5, is_free: true },
        { id: 'msg-2', role: 'assistant', content: 'Hi', created_at: '2024-01-01', tokens_used: 10, is_free: true },
      ];

      (conversationServiceModule.conversationService.getConversation as any).mockResolvedValue(
        mockConversation
      );
      (conversationServiceModule.conversationService.loadConversation as any).mockResolvedValue(
        mockMessages
      );

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.loadConversation('conv-123');
      });

      expect(result.current.conversationId).toBe('conv-123');
      expect(result.current.conversationTitle).toBe('Test Conversation');
      expect(result.current.messages.length).toBe(2);
    });

    it('should handle loading errors', async () => {
      const mockError = new Error('Load failed');
      (conversationServiceModule.conversationService.getConversation as any).mockRejectedValue(
        mockError
      );

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.loadConversation('conv-123');
      });

      expect(result.current.error).toBe('Load failed');
    });
  });

  describe('updateConversationTitle', () => {
    it('should update conversation title', async () => {
      const mockConversation = {
        id: 'conv-123',
        title: 'New Conversation',
        user_id: mockUserId,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      const mockUpdatedConversation = {
        ...mockConversation,
        title: 'Updated Title',
      };

      (conversationServiceModule.conversationService.createConversation as any).mockResolvedValue(
        mockConversation
      );
      (conversationServiceModule.conversationService.updateConversation as any).mockResolvedValue(
        mockUpdatedConversation
      );
      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue([]);

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.createNewConversation('New Conversation');
      });

      expect(result.current.conversationId).toBe('conv-123');

      await act(async () => {
        await result.current.updateConversationTitle('Updated Title');
      });

      expect(result.current.conversationTitle).toBe('Updated Title');
    });

    it('should not update if no conversation is loaded', async () => {
      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.updateConversationTitle('New Title');
      });

      expect(result.current.conversationTitle).toBe('New Conversation');
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation and clear state', async () => {
      (conversationServiceModule.conversationService.deleteConversation as any).mockResolvedValue(undefined);
      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue([]);

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        result.current.conversationId = 'conv-123';
        result.current.messages = [{ id: 'msg-1', role: 'user', content: 'Test', timestamp: '2024-01-01' }];
      });

      await act(async () => {
        await result.current.deleteConversation('conv-123');
      });

      expect(result.current.conversationId).toBeNull();
      expect(result.current.messages).toEqual([]);
    });

    it('should handle deletion errors', async () => {
      const mockError = new Error('Delete failed');
      (conversationServiceModule.conversationService.deleteConversation as any).mockRejectedValue(
        mockError
      );

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.deleteConversation('conv-123');
      });

      expect(result.current.error).toBe('Delete failed');
    });
  });

  describe('archiveConversation', () => {
    it('should archive conversation', async () => {
      const mockConversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        user_id: mockUserId,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      (conversationServiceModule.conversationService.createConversation as any).mockResolvedValue(
        mockConversation
      );
      (conversationServiceModule.conversationService.archiveConversation as any).mockResolvedValue({
        archived: true,
      });
      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue([]);

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.createNewConversation('Test Conversation');
      });

      expect(result.current.conversationId).toBe('conv-123');

      await act(async () => {
        await result.current.archiveConversation(true);
      });

      expect(conversationServiceModule.conversationService.archiveConversation).toHaveBeenCalledWith(
        'conv-123',
        true
      );
    });
  });

  describe('pinConversation', () => {
    it('should pin conversation', async () => {
      (conversationServiceModule.conversationService.pinConversation as any).mockResolvedValue({
        pinned: true,
      });
      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue([]);

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.pinConversation('conv-123', true);
      });

      expect(conversationServiceModule.conversationService.pinConversation).toHaveBeenCalledWith(
        'conv-123',
        true
      );
    });
  });

  describe('sendMessage', () => {
    it('should send message and auto-create conversation if needed', async () => {
      const mockConversation = { id: 'new-conv', title: 'Conversation' };
      const mockResponse = {
        choices: [{ message: { content: 'Response text' } }],
        usage: { total_tokens: 50 },
      };

      (conversationServiceModule.conversationService.createConversation as any).mockResolvedValue(
        mockConversation
      );
      (conversationServiceModule.conversationService.addMessage as any).mockResolvedValue({});
      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue([]);
      (openRouterServiceModule.openRouterService.chat as any).mockResolvedValue(mockResponse);
      (quotaServiceModule.quotaService.getQuotaStatus as any).mockReturnValue({
        canUseFree: true,
        creditsAvailable: 0,
      });

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.sendMessage('Hello', 0);
      });

      expect(result.current.messages.length).toBe(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[1].role).toBe('assistant');
    });

    it('should not send empty messages', async () => {
      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.sendMessage('', 0);
      });

      expect(result.current.error).toBe('Message cannot be empty');
      expect(result.current.messages).toEqual([]);
    });

    it('should not send if no free conversations and no credits', async () => {
      (quotaServiceModule.quotaService.getQuotaStatus as any).mockReturnValue({
        canUseFree: false,
        creditsAvailable: 0,
      });

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.sendMessage('Hello', 0);
      });

      expect(result.current.error).toContain('No free conversations');
      expect(result.current.messages).toEqual([]);
    });

    it('should use credits when free quota exhausted', async () => {
      const mockConversation = { id: 'conv-123', title: 'Conversation' };
      const mockResponse = {
        choices: [{ message: { content: 'Response' } }],
        usage: { total_tokens: 50 },
      };

      (conversationServiceModule.conversationService.createConversation as any).mockResolvedValue(
        mockConversation
      );
      (conversationServiceModule.conversationService.addMessage as any).mockResolvedValue({});
      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue([]);
      (openRouterServiceModule.openRouterService.chat as any).mockResolvedValue(mockResponse);
      (quotaServiceModule.quotaService.getQuotaStatus as any).mockReturnValue({
        canUseFree: false,
        creditsAvailable: 5,
      });

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.sendMessage('Hello', 5);
      });

      expect(result.current.messages.length).toBe(2);
    });

    it('should handle send errors', async () => {
      const mockError = new Error('API error');
      (openRouterServiceModule.openRouterService.chat as any).mockRejectedValue(mockError);
      (conversationServiceModule.conversationService.createConversation as any).mockResolvedValue({
        id: 'conv-123',
      });
      (conversationServiceModule.conversationService.addMessage as any).mockResolvedValue({});
      (quotaServiceModule.quotaService.getQuotaStatus as any).mockReturnValue({
        canUseFree: true,
      });

      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        await result.current.sendMessage('Hello', 0);
      });

      expect(result.current.error).toBe('API error');
      expect(result.current.loading).toBe(false);
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages and reset state', async () => {
      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        result.current.messages = [
          { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
        ];
        result.current.error = 'Some error';
      });

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe('resetError', () => {
    it('should clear error message', async () => {
      const { result } = renderHook(() => useCreativeChat());

      await act(async () => {
        result.current.error = 'Some error';
      });

      act(() => {
        result.current.resetError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('canSendMessage', () => {
    it('should be false when not authenticated', async () => {
      (useAuth as any).mockReturnValue({
        user: null,
      });

      const { result } = renderHook(() => useCreativeChat());

      expect(result.current.canSendMessage).toBe(false);
    });

    it('should be true when authenticated and not loading', async () => {
      const { result } = renderHook(() => useCreativeChat());

      expect(result.current.canSendMessage).toBe(true);
      expect(result.current.loading).toBe(false);
    });

    it('should be false when loading', async () => {
      (openRouterServiceModule.openRouterService.chat as any).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      (conversationServiceModule.conversationService.createConversation as any).mockResolvedValue({
        id: 'conv-123',
      });
      (conversationServiceModule.conversationService.addMessage as any).mockResolvedValue({});
      (quotaServiceModule.quotaService.getQuotaStatus as any).mockReturnValue({
        canUseFree: true,
      });

      const { result } = renderHook(() => useCreativeChat());

      act(() => {
        result.current.sendMessage('Hello', 0);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });

      expect(result.current.canSendMessage).toBe(false);
    });
  });

  describe('loadConversations', () => {
    it('should refresh conversation list', async () => {
      const mockConversations = [
        { id: 'conv-1', title: 'Conv 1', created_at: '2024-01-01', updated_at: '2024-01-01', total_messages: 5, archived: false, pinned: false },
        { id: 'conv-2', title: 'Conv 2', created_at: '2024-01-02', updated_at: '2024-01-02', total_messages: 3, archived: false, pinned: false },
      ];

      (conversationServiceModule.conversationService.listConversations as any).mockResolvedValue(
        mockConversations
      );

      const { result } = renderHook(() => useCreativeChat());

      await waitFor(() => {
        expect(result.current.conversations).toEqual(mockConversations);
      });
    });

    it('should handle load errors', async () => {
      const mockError = new Error('Load failed');
      (conversationServiceModule.conversationService.listConversations as any).mockRejectedValue(
        mockError
      );

      const { result } = renderHook(() => useCreativeChat());

      await waitFor(() => {
        // Error should be caught and logged, not thrown
        expect(result.current.conversations).toEqual([]);
      });
    });
  });
});
