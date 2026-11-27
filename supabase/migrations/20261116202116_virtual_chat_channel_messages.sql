-- Production migration 20261116202116 "virtual_chat_channel_messages", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

CREATE TABLE IF NOT EXISTS public.virtual_chat_channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('instagram', 'whatsapp')),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  contact_id TEXT NOT NULL CHECK (char_length(contact_id) BETWEEN 1 AND 128),
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) <= 200),
  message_id TEXT NOT NULL CHECK (char_length(message_id) BETWEEN 1 AND 256),
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'image', 'document', 'other')),
  body TEXT CHECK (body IS NULL OR char_length(body) <= 8000),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT virtual_chat_channel_messages_dedupe UNIQUE (channel, message_id)
);

CREATE INDEX IF NOT EXISTS idx_vcc_messages_contact
  ON public.virtual_chat_channel_messages (channel, contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_vcc_messages_recent
  ON public.virtual_chat_channel_messages (occurred_at DESC);

ALTER TABLE public.virtual_chat_channel_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.virtual_chat_channel_messages FROM anon, authenticated;
GRANT ALL ON public.virtual_chat_channel_messages TO service_role;
