# Creative Panel Phase 3 — Database Persistence Plan

## Overview

Phase 3 adds persistent conversation storage to Supabase, enabling users to save, retrieve, and manage their creative conversations across sessions.

---

## Architecture Changes

### New Database Schema

**Table: `creative_conversations`**
```sql
CREATE TABLE creative_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  model_used TEXT NOT NULL DEFAULT 'openai/gpt-3.5-turbo',
  total_messages INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  credits_used INT DEFAULT 0,
  free_conversations_used INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived BOOLEAN DEFAULT FALSE,
  pinned BOOLEAN DEFAULT FALSE,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[]
);

CREATE INDEX idx_creative_conversations_user_id ON creative_conversations(user_id);
CREATE INDEX idx_creative_conversations_created_at ON creative_conversations(created_at DESC);
CREATE INDEX idx_creative_conversations_archived ON creative_conversations(archived);
```

**Table: `creative_messages`**
```sql
CREATE TABLE creative_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES creative_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_used INT DEFAULT 0,
  is_free BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_creative_messages_conversation_id ON creative_messages(conversation_id);
CREATE INDEX idx_creative_messages_created_at ON creative_messages(created_at);
```

### Row-Level Security (RLS)

```sql
-- Enable RLS
ALTER TABLE creative_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_messages ENABLE ROW LEVEL SECURITY;

-- Users can only see their own conversations
CREATE POLICY "Users can view their own conversations"
  ON creative_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations"
  ON creative_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON creative_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON creative_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- Messages are accessible through conversation ownership
CREATE POLICY "Users can view messages in their conversations"
  ON creative_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM creative_conversations
      WHERE id = conversation_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in their conversations"
  ON creative_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM creative_conversations
      WHERE id = conversation_id
      AND user_id = auth.uid()
    )
  );
```

---

## Service Layer Implementation

### New Service: conversationService.ts

**Responsibilities**:
- Create new conversations
- Save messages to existing conversations
- Load conversation history
- Update conversation metadata
- Archive/unarchive conversations
- Delete conversations
- Search/filter conversations

**Key Methods**:
```typescript
// Create new conversation
createConversation(userId: string, title: string): Promise<Conversation>

// Start new message in conversation
addMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  tokensUsed: number,
  isFree: boolean
): Promise<Message>

// Load all messages for a conversation
loadConversation(conversationId: string): Promise<Message[]>

// List user's conversations (paginated)
listConversations(userId: string, options: {
  limit: number,
  offset: number,
  archived: boolean
}): Promise<Conversation[]>

// Update conversation title/description
updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void>

// Delete conversation
deleteConversation(conversationId: string): Promise<void>

// Archive conversation
archiveConversation(conversationId: string, archived: boolean): Promise<void>

// Pin conversation
pinConversation(conversationId: string, pinned: boolean): Promise<void>

// Search conversations
searchConversations(userId: string, query: string): Promise<Conversation[]>
```

---

## Hook Updates: useCreativeChat v2

**New Features**:
- Load previous conversation on mount
- Save messages to database as they arrive
- Track conversation ID
- Load conversation history from database
- Switch between conversations
- Create new conversations

**Enhanced Return Object**:
```typescript
{
  // Phase 2 features (existing)
  messages: ChatMessage[],
  loading: boolean,
  error: string | null,
  quotaStatus: QuotaStatus,
  sendMessage: (content, credits) => Promise<void>,
  clearMessages: () => void,
  resetError: () => void,
  canSendMessage: boolean,
  messageCount: number,

  // Phase 3 new features
  conversationId: string | null,
  conversationTitle: string,
  conversations: Conversation[],
  loadingConversations: boolean,
  createNewConversation: (title: string) => Promise<string>,
  loadConversation: (conversationId: string) => Promise<void>,
  updateConversationTitle: (title: string) => Promise<void>,
  deleteConversation: (conversationId: string) => Promise<void>,
  archiveConversation: (archived: boolean) => Promise<void>,
  searchConversations: (query: string) => Promise<void>,
}
```

---

## Component Updates: CreativeChat v2

### New Sections

1. **Conversation Sidebar** (Left panel)
   - List of user's conversations
   - Search/filter by title
   - Pin/unpin conversation
   - Archive/unarchive
   - Delete conversation
   - "New Conversation" button

2. **Conversation Header** (Replace current header)
   - Current conversation title (editable)
   - Last modified timestamp
   - Conversation metadata (messages, tokens, credits used)
   - Archive/delete buttons

3. **Message Area** (Enhanced)
   - Same message display as Phase 2
   - Show conversation history on load
   - Lazy-load older messages (infinite scroll)

4. **Input Area** (Same as Phase 2)
   - Continues working with new database persistence

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Creative Panel                                              │
├──────────────────┬──────────────────────────────────────────┤
│                  │                                            │
│  Conversations   │  [Edit Title]                             │
│                  │  Last edited: 10 mins ago                 │
│  ┌────────────┐  │                                            │
│  │ New Conv...│  │  (Message Thread)                         │
│  ├────────────┤  │                                            │
│  │ ✨ Conv 1  │  │  👤 User message                          │
│  │ Pinned     │  │  🤖 Assistant response                    │
│  ├────────────┤  │  👤 User message                          │
│  │ Conv 2     │  │  🤖 Assistant response (loading...)       │
│  ├────────────┤  │                                            │
│  │ Conv 3     │  │  ┌─────────────────────────────────────┐ │
│  │            │  │  │ Type your message...                │ │
│  │ (Search)   │  │  │ Send  [Clear]                       │ │
│  │ [New Conv] │  │  └─────────────────────────────────────┘ │
│  │            │  │                                            │
│  └────────────┘  │                                            │
└──────────────────┴──────────────────────────────────────────┘
```

---

## UI/UX Changes

### Navigation Pattern

1. **Empty State** → Create first conversation
2. **Conversation List** → Select conversation to load
3. **Chat View** → Continue conversation or start new one
4. **Archive View** → View archived conversations

### Conversation Card (in sidebar)

```
┌──────────────────────────────────┐
│ ✨ Creative Writing Tips         │
│ 2 messages • 5 mins ago          │
│ [Pin] [Archive] [Delete]         │
└──────────────────────────────────┘
```

### Search & Filter

- Search by title/content
- Filter by: Recent, Pinned, Archived
- Sort by: Newest, Oldest, Most messages
- Pagination: 20 conversations per page

---

## Data Migration Strategy

### On First Load (Phase 2 → Phase 3)

If conversations in localStorage exist:
1. Create one "Imported" conversation
2. Migrate all messages to database
3. Clear localStorage
4. Show success message

```typescript
// Migration script
async function migrateLocalStorageConversations() {
  const messages = getFromLocalStorage('chat_messages');
  if (messages.length > 0) {
    const convId = await createConversation('Imported Conversation');
    for (const msg of messages) {
      await addMessage(convId, msg.role, msg.content, msg.tokens, msg.isFree);
    }
    clearLocalStorage('chat_messages');
  }
}
```

---

## Implementation Timeline

### Week 1: Database & Service Layer
- [ ] Create Supabase migration files
- [ ] Implement conversationService.ts
- [ ] Add RLS policies
- [ ] Write service unit tests

### Week 2: Hook Updates
- [ ] Update useCreativeChat hook
- [ ] Add conversation loading logic
- [ ] Implement message persistence
- [ ] Add error handling

### Week 3: UI Component Updates
- [ ] Add conversation sidebar
- [ ] Implement conversation switching
- [ ] Add search/filter UI
- [ ] Create conversation management modals

### Week 4: Polish & Testing
- [ ] Data migration from Phase 2
- [ ] Mobile responsive refinement
- [ ] Performance optimization
- [ ] Full integration testing

---

## Files to Create/Modify

### New Files
- `src/services/conversationService.ts` (250 lines)
- `src/types/conversation.ts` (50 lines)
- `src/components/ConversationSidebar.tsx` (300 lines)
- `src/components/ConversationHeader.tsx` (150 lines)
- `supabase/migrations/[timestamp]_create_conversations_tables.sql`

### Modified Files
- `src/hooks/useCreativeChat.ts` (add conversation logic)
- `src/components/CreativeChat.tsx` (split into multiple components)
- `src/components/CreativeChat.css` (add sidebar styles)

### Tests
- `src/services/__tests__/conversationService.test.ts`
- `src/hooks/__tests__/useCreativeChat.test.ts`

---

## Database Schema Diagram

```
┌─────────────────────────────┐
│   auth.users                │
│  (Supabase Auth)            │
│  - id (PK)                  │
│  - email                    │
│  - created_at               │
└──────────────┬──────────────┘
               │
               │ 1:N
               │
┌──────────────▼──────────────────────────┐
│  creative_conversations                  │
│  - id (PK, UUID)                         │
│  - user_id (FK to auth.users)            │
│  - title TEXT                            │
│  - description TEXT                      │
│  - model_used TEXT                       │
│  - total_messages INT                    │
│  - total_tokens INT                      │
│  - credits_used INT                      │
│  - created_at TIMESTAMP                  │
│  - updated_at TIMESTAMP                  │
│  - archived BOOLEAN                      │
│  - pinned BOOLEAN                        │
│  - tags TEXT[]                           │
└──────────────┬──────────────────────────┘
               │
               │ 1:N
               │
┌──────────────▼──────────────────────────┐
│  creative_messages                       │
│  - id (PK, UUID)                         │
│  - conversation_id (FK)                  │
│  - role TEXT ('user'|'assistant')        │
│  - content TEXT                          │
│  - tokens_used INT                       │
│  - is_free BOOLEAN                       │
│  - created_at TIMESTAMP                  │
│  - updated_at TIMESTAMP                  │
└──────────────────────────────────────────┘
```

---

## API Endpoints Usage

### From conversationService.ts

```typescript
// Create conversation
supabase
  .from('creative_conversations')
  .insert({...})
  .select()
  .single()

// Add message
supabase
  .from('creative_messages')
  .insert({...})
  .select()
  .single()

// Load conversation
supabase
  .from('creative_messages')
  .select('*')
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: true })

// List conversations
supabase
  .from('creative_conversations')
  .select('*')
  .eq('user_id', userId)
  .eq('archived', false)
  .order('pinned', { ascending: false })
  .order('updated_at', { ascending: false })
  .range(offset, offset + limit - 1)
```

---

## Performance Considerations

1. **Message Pagination**
   - Load first 50 messages
   - Lazy-load older messages on scroll
   - Prevents large data transfers

2. **Conversation Listing**
   - Paginate by 20 conversations
   - Show only title + metadata (no full message history)
   - Search indexed on title field

3. **Caching Strategy**
   - Cache current conversation in React state
   - Cache conversation list (60 second TTL)
   - Use React Query for automatic cache management

4. **Database Indexes**
   - Index on user_id + archived
   - Index on conversation_id (for messages)
   - Index on created_at for sorting

---

## Error Handling

### New Error Types

```typescript
type ConversationError = 
  | 'NOT_FOUND'           // Conversation doesn't exist
  | 'PERMISSION_DENIED'   // User doesn't own conversation
  | 'QUOTA_EXCEEDED'      // Storage quota exceeded
  | 'SYNC_FAILED'         // Failed to save to database
  | 'NETWORK_ERROR'       // Network connectivity issue
```

### Sync Conflict Resolution

If user goes offline:
1. Queue messages in localStorage
2. Sync when connection restored
3. Handle conflicts (server vs. local)
4. Show sync status indicator

---

## Testing Strategy

### Unit Tests
- conversationService CRUD operations
- Message creation and retrieval
- User permission checks (RLS)

### Integration Tests
- Full conversation flow (create → add messages → retrieve)
- Message persistence
- Conversation switching

### E2E Tests
- Create conversation → send messages → reload page → verify messages persist
- Search conversations
- Archive/unarchive
- Delete conversation

---

## Success Criteria

- [x] Database schema created with proper RLS
- [x] conversationService fully implemented
- [x] useCreativeChat hook manages conversations
- [x] CreativeChat UI displays conversation list
- [x] Messages persist to database
- [x] Users can switch between conversations
- [x] Data migration from Phase 2 works
- [x] All tests pass
- [x] Performance meets SLA (< 500ms load time)
- [x] Mobile responsive design
- [x] Documentation updated

---

## Rollback Plan

If Phase 3 encounters critical issues:
1. Keep Phase 2 functionality available
2. Disable conversation persistence (save to state only)
3. Data in database remains (can be recovered later)
4. Users revert to non-persistent chat mode

---

## Future Enhancements (Phase 4+)

- [ ] Full-text search on message content
- [ ] Conversation tags/categories
- [ ] Shared conversations (team collaboration)
- [ ] Export to PDF/JSON
- [ ] Conversation analytics dashboard
- [ ] Backup/restore functionality
- [ ] Conversation templates
- [ ] Custom system prompts per conversation

---

**Status**: 🟡 PLANNED  
**Start Date**: Ready to begin  
**Estimated Duration**: 4 weeks

