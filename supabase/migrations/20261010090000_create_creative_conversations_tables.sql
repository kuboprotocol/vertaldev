-- Create creative_conversations table
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

-- Create indexes for creative_conversations
CREATE INDEX idx_creative_conversations_user_id ON creative_conversations(user_id);
CREATE INDEX idx_creative_conversations_created_at ON creative_conversations(created_at DESC);
CREATE INDEX idx_creative_conversations_archived ON creative_conversations(archived);
CREATE INDEX idx_creative_conversations_user_archived ON creative_conversations(user_id, archived);
CREATE INDEX idx_creative_conversations_user_pinned ON creative_conversations(user_id, pinned DESC, updated_at DESC);

-- Create creative_messages table
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

-- Create indexes for creative_messages
CREATE INDEX idx_creative_messages_conversation_id ON creative_messages(conversation_id);
CREATE INDEX idx_creative_messages_created_at ON creative_messages(created_at);
CREATE INDEX idx_creative_messages_conversation_created ON creative_messages(conversation_id, created_at);

-- Enable Row-Level Security
ALTER TABLE creative_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for creative_conversations
CREATE POLICY "Users can view their own conversations"
  ON creative_conversations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
  ON creative_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON creative_conversations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON creative_conversations
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for creative_messages
CREATE POLICY "Users can view messages in their conversations"
  ON creative_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM creative_conversations
      WHERE id = conversation_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON creative_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM creative_conversations
      WHERE id = conversation_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own messages"
  ON creative_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM creative_conversations
      WHERE id = conversation_id
      AND user_id = auth.uid()
    )
  );

-- Grant permissions to anon role
GRANT SELECT, INSERT ON creative_conversations TO anon;
GRANT SELECT, INSERT, UPDATE ON creative_messages TO anon;
