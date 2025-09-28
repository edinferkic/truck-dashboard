-- Add updated_at to documents and set a default
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Backfill existing rows (use created_at as a reasonable default)
UPDATE documents
SET updated_at = COALESCE(updated_at, created_at);

-- Ensure new rows get a value even if not set explicitly
ALTER TABLE documents
  ALTER COLUMN updated_at SET DEFAULT now();
