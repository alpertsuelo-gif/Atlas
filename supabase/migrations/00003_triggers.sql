-- =============================================================================
-- Atlas — Migration 003: Auth Triggers
-- =============================================================================
-- Automatic profile creation and streak initialisation when a user signs up.
-- Also includes the progress event trigger for auto-tracking key actions.

BEGIN;

-- ===========================================================================
-- handle_new_user: creates profile + streak row on signup
-- ===========================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );

  INSERT INTO streaks (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop first to avoid conflicts on re-run
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ===========================================================================
-- track_document_progress: auto-log progress event on document status change
-- ===========================================================================

CREATE OR REPLACE FUNCTION track_document_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- When a document moves from processing to ready, log it
  IF NEW.status = 'ready' AND (OLD.status IS NULL OR OLD.status = 'processing') THEN
    INSERT INTO progress_events (user_id, event_type, metadata)
    VALUES (
      NEW.user_id,
      'document_uploaded',
      jsonb_build_object(
        'document_id', NEW.id,
        'title', NEW.title,
        'file_type', NEW.file_type,
        'chunk_count', NEW.chunk_count,
        'size_bytes', NEW.size_bytes
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_document_progress ON documents;

CREATE TRIGGER trg_document_progress
  AFTER UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION track_document_progress();

COMMIT;