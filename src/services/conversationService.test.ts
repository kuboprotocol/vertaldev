import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conversationService } from './conversationService';
import * as supabaseModule from '@/integrations/supabase/client';

// Mock Supabase with proper query chain
vi.mock('@/integrations/supabase/client', () => {
  const createChain = () => {
    const chain = {
      select: vi.fn().mockReturnValue(chain),
      insert: vi.fn().mockReturnValue(chain),
      update: vi.fn().mockReturnValue(chain),
      delete: vi.fn().mockReturnValue(chain),
      eq: vi.fn().mockReturnValue(chain),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      returns: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return chain;
  };

  return {
    supabase: {
      from: vi.fn(() => createChain()),
    },
  };
});

const mockUserId = 'test-user-123';
const mockConversationId = 'conv-123';

describe('ConversationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createConversation', () => {
    it('should create a new conversation with valid input', async () => {
      const mockData = {
        id: mockConversationId,
        user_id: mockUserId,
        title: 'Test Conversation',
        description: null,
        model_used: 'openai/gpt-3.5-turbo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        insert: mockInsert,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.createConversation(mockUserId, {
        title: 'Test Conversation',
      });

      expect(result).toEqual(mockData);
      expect(mockFrom).toHaveBeenCalledWith('creative_conversations');
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should throw error with empty title', async () => {
      await expect(
        conversationService.createConversation(mockUserId, { title: '' })
      ).rejects.toThrow('Conversation title is required');
    });

    it('should throw error with whitespace-only title', async () => {
      await expect(
        conversationService.createConversation(mockUserId, { title: '   ' })
      ).rejects.toThrow('Conversation title is required');
    });

    it('should trim title before saving', async () => {
      const mockData = {
        id: mockConversationId,
        user_id: mockUserId,
        title: 'Trimmed Title',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        insert: mockInsert,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      await conversationService.createConversation(mockUserId, {
        title: '  Trimmed Title  ',
      });

      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.title).toBe('Trimmed Title');
    });
  });

  describe('addMessage', () => {
    it('should throw error with empty content', async () => {
      await expect(
        conversationService.addMessage(mockConversationId, 'user', '', 0, false)
      ).rejects.toThrow('Message content cannot be empty');
    });

    it('should throw error with whitespace-only content', async () => {
      await expect(
        conversationService.addMessage(mockConversationId, 'user', '   ', 0, false)
      ).rejects.toThrow('Message content cannot be empty');
    });
  });

  describe('listConversations', () => {
    it('should list conversations with default pagination', async () => {
      const mockData = [
        {
          id: 'conv-1',
          title: 'Conv 1',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          total_messages: 5,
          archived: false,
          pinned: false,
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: mockData, error: null }),
            }),
          }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.listConversations(mockUserId);

      expect(result).toEqual(mockData);
      expect(mockFrom).toHaveBeenCalledWith('creative_conversations');
    });

    it('should filter by archived status', async () => {
      const mockData = [];

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: mockData, error: null }),
              }),
            }),
          }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      await conversationService.listConversations(mockUserId, { archived: true });

      expect(mockFrom).toHaveBeenCalledWith('creative_conversations');
    });

    it('should handle custom limit and offset', async () => {
      const mockData = [];

      const mockRange = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockOrder2 = vi.fn().mockReturnValue({
        range: mockRange,
      });
      const mockOrder1 = vi.fn().mockReturnValue({
        order: mockOrder2,
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: mockOrder1,
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      await conversationService.listConversations(mockUserId, {
        limit: 50,
        offset: 100,
      });

      expect(mockRange).toHaveBeenCalledWith(100, 149);
    });
  });

  describe('updateConversation', () => {
    it('should update conversation title', async () => {
      const mockData = {
        id: mockConversationId,
        title: 'Updated Title',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        update: mockUpdate,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.updateConversation(mockConversationId, {
        title: 'Updated Title',
      });

      expect(result).toEqual(mockData);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should update conversation with multiple fields', async () => {
      const mockData = {
        id: mockConversationId,
        title: 'New Title',
        description: 'New Description',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        update: mockUpdate,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.updateConversation(mockConversationId, {
        title: 'New Title',
        description: 'New Description',
      });

      expect(result).toEqual(mockData);
    });
  });

  describe('archiveConversation', () => {
    it('should archive a conversation', async () => {
      const mockData = {
        id: mockConversationId,
        archived: true,
        updated_at: '2024-01-02T00:00:00Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        update: mockUpdate,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.archiveConversation(mockConversationId, true);

      expect(result).toEqual(mockData);
      expect(result.archived).toBe(true);
    });

    it('should unarchive a conversation', async () => {
      const mockData = {
        id: mockConversationId,
        archived: false,
        updated_at: '2024-01-02T00:00:00Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        update: mockUpdate,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.archiveConversation(mockConversationId, false);

      expect(result.archived).toBe(false);
    });
  });

  describe('pinConversation', () => {
    it('should pin a conversation', async () => {
      const mockData = {
        id: mockConversationId,
        pinned: true,
        updated_at: '2024-01-02T00:00:00Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        update: mockUpdate,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.pinConversation(mockConversationId, true);

      expect(result).toEqual(mockData);
      expect(result.pinned).toBe(true);
    });

    it('should unpin a conversation', async () => {
      const mockData = {
        id: mockConversationId,
        pinned: false,
        updated_at: '2024-01-02T00:00:00Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        update: mockUpdate,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.pinConversation(mockConversationId, false);

      expect(result.pinned).toBe(false);
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        delete: mockDelete,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      await expect(conversationService.deleteConversation(mockConversationId)).resolves.toBeUndefined();

      expect(mockDelete).toHaveBeenCalled();
    });

    it('should throw error if deletion fails', async () => {
      const mockError = new Error('Delete failed');
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: mockError }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        delete: mockDelete,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      await expect(conversationService.deleteConversation(mockConversationId)).rejects.toThrow();
    });
  });

  describe('searchConversations', () => {
    it('should search conversations by title', async () => {
      const mockData = [
        {
          id: 'conv-1',
          title: 'Test Search Result',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          total_messages: 3,
          archived: false,
          pinned: false,
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: mockData, error: null }),
            }),
          }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.searchConversations(mockUserId, 'test');

      expect(result).toEqual(mockData);
    });

    it('should return empty array for empty search query', async () => {
      const result = await conversationService.searchConversations(mockUserId, '');

      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only query', async () => {
      const result = await conversationService.searchConversations(mockUserId, '   ');

      expect(result).toEqual([]);
    });
  });

  describe('getConversationStats', () => {
    it('should calculate conversation statistics', async () => {
      const mockConversations = [
        { id: 'conv-1', archived: false, pinned: true, total_messages: 5, total_tokens: 100, credits_used: 2 },
        { id: 'conv-2', archived: true, pinned: false, total_messages: 3, total_tokens: 50, credits_used: 1 },
        { id: 'conv-3', archived: false, pinned: false, total_messages: 0, total_tokens: 0, credits_used: 0 },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: mockConversations, error: null }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.getConversationStats(mockUserId);

      expect(result.total).toBe(3);
      expect(result.archived).toBe(1);
      expect(result.pinned).toBe(1);
      expect(result.totalMessages).toBe(8);
      expect(result.totalTokens).toBe(150);
      expect(result.totalCreditsUsed).toBe(3);
    });
  });

  describe('exportConversation', () => {
    it('should export conversation as JSON', async () => {
      const mockConversation = {
        id: mockConversationId,
        title: 'Test Conv',
        description: 'Test Description',
        model_used: 'gpt-3.5-turbo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        total_messages: 2,
        total_tokens: 100,
        credits_used: 1,
      };

      const mockMessages = [
        { role: 'user', content: 'Hello', tokens_used: 5, is_free: true, created_at: '2024-01-01T00:00:00Z' },
        { role: 'assistant', content: 'Hi there', tokens_used: 10, is_free: true, created_at: '2024-01-01T00:00:05Z' },
      ];

      // Mock getConversation
      const mockSelectConv = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockConversation, error: null }),
        }),
      });

      // Mock loadConversation
      const mockSelectMsg = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockMessages, error: null }),
        }),
      });

      const mockFrom = vi.fn((table) => {
        if (table === 'creative_conversations') {
          return { select: mockSelectConv };
        } else if (table === 'creative_messages') {
          return { select: mockSelectMsg };
        }
      });

      (supabaseModule.supabase.from as any) = mockFrom;

      const result = await conversationService.exportConversation(mockConversationId);
      const parsed = JSON.parse(result);

      expect(parsed.conversation.title).toBe('Test Conv');
      expect(parsed.messages.length).toBe(2);
      expect(parsed.conversation.stats.total_messages).toBe(2);
    });
  });
});
