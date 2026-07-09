-- =============================================================================
-- Atlas — Migration 001: Schema Creation
-- =============================================================================
-- Creates all extensions, tables, and indexes for the Atlas database.
-- This is the foundation — every table, every column, every index.
--
-- Run: supabase db push (or supabase migration up in production)

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===========================================================================
-- PROFILES
-- ===========================================================================
-- Extends Supabase auth.users. Created automatically via trigger on signup.
-- ===========================================================================

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  settings    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ===========================================================================
-- DOCUMENTS
-- ===========================================================================
-- Uploaded files (PDF, Markdown, code, text). Status tracks the processing
-- pipeline: processing → ready (or error).
-- ===========================================================================

CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  file_type     TEXT NOT NULL CHECK (file_type IN ('pdf', 'markdown', 'txt', 'code', 'image')),
  mime_type     TEXT,
  size_bytes    BIGINT,
  storage_path  TEXT NOT NULL,
  status        TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  error_message TEXT,
  chunk_count   INTEGER DEFAULT 0,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);

-- ===========================================================================
-- DOCUMENT CHUNKS (Vector Store)
-- ===========================================================================
-- The heart of RAG. Each row is one semantic chunk with its 768d embedding.
-- pgvector IVFFlat index enables sub-10ms approximate nearest neighbor search
-- for up to ~1M chunks. Rebuild periodically with:
--   SELECT ivfflat_reset('idx_chunks_embedding');
-- ===========================================================================

CREATE TABLE document_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  token_count   INTEGER,
  embedding     vector(768),
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_chunks_user_id ON document_chunks(user_id);

-- IVFFlat: approximate nearest neighbor with cosine similarity.
-- lists=100 is appropriate for 10k–100k chunks; increase for larger datasets.
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ===========================================================================
-- CONVERSATIONS
-- ===========================================================================
-- Chat sessions. context_type + context_id allow scoping to a specific
-- document or project (polymorphic association).
-- ===========================================================================

CREATE TABLE conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         TEXT DEFAULT 'New conversation',
  context_type  TEXT DEFAULT 'general' CHECK (context_type IN ('general', 'document', 'project', 'code')),
  context_id    UUID,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);

-- ===========================================================================
-- MESSAGES
-- ===========================================================================
-- Individual messages within a conversation. citations is an array of
-- { chunk_id, document_id, content_snippet, similarity } — populated
-- for assistant messages where RAG was used.
-- ===========================================================================

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  citations       JSONB[] DEFAULT '{}',
  token_count     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- ===========================================================================
-- NOTES
-- ===========================================================================
-- User-authored notes (not derived from uploads). Markdown content with
-- optional tagging and source linking.
-- ===========================================================================

CREATE TABLE notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  tags        TEXT[] DEFAULT '{}',
  source_type TEXT CHECK (source_type IN ('document', 'manual', 'web-clip')),
  source_id   UUID,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notes_user_id ON notes(user_id);

-- ===========================================================================
-- PROJECTS
-- ===========================================================================
-- ===========================================================================

CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  color       TEXT DEFAULT '#6366f1',
  deadline    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);

-- ===========================================================================
-- TASKS
-- ===========================================================================
-- ===========================================================================

CREATE TABLE tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority     TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  deadline     TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  order_index  INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);

-- ===========================================================================
-- LEARNING CARDS (Spaced Repetition)
-- ===========================================================================
-- SM-2 algorithm state. due_date determines review scheduling.
-- ===========================================================================

CREATE TABLE learning_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  answer           TEXT NOT NULL,
  source_type      TEXT CHECK (source_type IN ('document', 'quiz', 'manual')),
  source_id        UUID,
  difficulty       INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  due_date         TIMESTAMPTZ DEFAULT now(),
  interval_days    REAL DEFAULT 0,
  ease_factor      REAL DEFAULT 2.5,
  review_count     INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cards_user_due ON learning_cards(user_id, due_date);

-- ===========================================================================
-- CARD REVIEWS
-- ===========================================================================
-- Tracks each review event for analytics and SM-2 parameter updates.
-- ===========================================================================

CREATE TABLE card_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id       UUID NOT NULL REFERENCES learning_cards(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating        TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  reviewed_at   TIMESTAMPTZ DEFAULT now(),
  time_taken_ms INTEGER
);

CREATE INDEX idx_reviews_card_id ON card_reviews(card_id);

-- ===========================================================================
-- QUIZ SESSIONS
-- ===========================================================================
-- ===========================================================================

CREATE TABLE quiz_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title          TEXT,
  source_ids     UUID[],
  question_count INTEGER NOT NULL,
  questions      JSONB NOT NULL,
  user_answers   JSONB,
  score          REAL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quizzes_user_id ON quiz_sessions(user_id);

-- ===========================================================================
-- CODE SNIPPETS & REVIEWS
-- ===========================================================================
-- ===========================================================================

CREATE TABLE code_snippets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title              TEXT,
  language           TEXT NOT NULL,
  code               TEXT NOT NULL,
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE code_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id    UUID NOT NULL REFERENCES code_snippets(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  review_result JSONB NOT NULL,
  model_used    TEXT,
  token_count   INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ===========================================================================
-- PROGRESS EVENTS
-- ===========================================================================
-- Append-only event log. Every meaningful user action writes one row.
-- Dashboards and analytics are derived from this table.
-- ===========================================================================

CREATE TABLE progress_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_progress_user_date ON progress_events(user_id, created_at DESC);
CREATE INDEX idx_progress_type ON progress_events(event_type);

-- ===========================================================================
-- STREAKS
-- ===========================================================================
-- One row per user. Updated by the update-streaks cron function.
-- ===========================================================================

CREATE TABLE streaks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_streak      INTEGER DEFAULT 0,
  longest_streak      INTEGER DEFAULT 0,
  last_activity_date  DATE,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ===========================================================================
-- Updated-at trigger helper
-- ===========================================================================
-- Applied to tables with updated_at columns to auto-set the timestamp.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tables with updated_at columns get the trigger
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_streaks_updated_at
  BEFORE UPDATE ON streaks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;