-- Supabase Database Schema for RAG Conversation Storage
-- Run this in Supabase SQL Editor to create the required tables

-- ============================================
-- Table: conversations
-- Stores conversation sessions
-- ============================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (disabled for no-auth)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Allow public access (no auth)
CREATE POLICY "Allow public access" ON conversations
    FOR ALL USING (true) WITH CHECK (true);


-- ============================================
-- Table: messages
-- Stores individual messages within conversations
-- ============================================
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]',
    timing_ms FLOAT,
    token_usage JSONB DEFAULT '{}',
    sources_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (disabled for no-auth)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow public access (no auth)
CREATE POLICY "Allow public access" ON messages
    FOR ALL USING (true) WITH CHECK (true);

-- Index for fast conversation lookups
CREATE INDEX idx_messages_conversation ON messages(conversation_id);


-- ============================================
-- Table: query_logs (Optional Analytics)
-- Stores query analytics for insights
-- ============================================
CREATE TABLE query_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    answer TEXT,
    has_answer BOOLEAN DEFAULT false,
    timing_ms FLOAT,
    token_usage JSONB DEFAULT '{}',
    sources_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (disabled for no-auth)
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;

-- Allow public access
CREATE POLICY "Allow public access" ON query_logs
    FOR ALL USING (true) WITH CHECK (true);
