-- =============================================================================
-- Atlas — Migration 002: Row Level Security
-- =============================================================================
-- Enables RLS on every user-data table and creates ownership policies.
--
-- Pattern: user_id = auth.uid()
--   - SELECT: users can only read their own rows
--   - INSERT: users can only insert rows they own
--   - UPDATE: users can only update their own rows
--   - DELETE: users can only delete their own rows
--
-- Notes:
--   - document_chunks has SELECT-only policy. Vector search queries bypass
--     RLS for index performance — user_id is enforced in the WHERE clause
--     explicitly. See rag-query/retriever.ts for the implementation.
--   - Edge Functions using the service role bypass RLS entirely. Those
--     functions MUST enforce user_id in application-layer WHERE clauses.

BEGIN;

-- ===========================================================================
-- profiles
-- ===========================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ===========================================================================
-- documents
-- ===========================================================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_owner_access" ON documents
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- document_chunks
-- ===========================================================================

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- SELECT-only: chunks are created by Edge Functions (service role), never by
-- the client directly. The SELECT policy allows the client to list chunks for
-- a document they own, but vector search should use the service role directly
-- for performance reasons.
CREATE POLICY "chunks_select_own" ON document_chunks
  FOR SELECT USING (user_id = auth.uid());

-- ===========================================================================
-- conversations
-- ===========================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_owner_access" ON conversations
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- messages
-- ===========================================================================

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Messages are accessed indirectly through their conversation. The policy
-- checks that the conversation belongs to the user.
CREATE POLICY "messages_via_conversation" ON messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  );

-- ===========================================================================
-- notes
-- ===========================================================================

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_owner_access" ON notes
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- projects
-- ===========================================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_owner_access" ON projects
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- tasks
-- ===========================================================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_owner_access" ON tasks
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- learning_cards
-- ===========================================================================

ALTER TABLE learning_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cards_owner_access" ON learning_cards
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- card_reviews
-- ===========================================================================

ALTER TABLE card_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_owner_access" ON card_reviews
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- quiz_sessions
-- ===========================================================================

ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quizzes_owner_access" ON quiz_sessions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- code_snippets
-- ===========================================================================

ALTER TABLE code_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snippets_owner_access" ON code_snippets
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- code_reviews
-- ===========================================================================

ALTER TABLE code_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "code_reviews_owner_access" ON code_reviews
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- progress_events
-- ===========================================================================

ALTER TABLE progress_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "progress_select_own" ON progress_events
  FOR SELECT USING (user_id = auth.uid());

-- progress_events are INSERT-only for clients (no UPDATE/DELETE from frontend)
CREATE POLICY "progress_insert_own" ON progress_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- streaks
-- ===========================================================================

ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "streaks_select_own" ON streaks
  FOR SELECT USING (user_id = auth.uid());

-- streaks are updated by the update-streaks cron function (service role)

COMMIT;