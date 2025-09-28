-- 002_documents.sql — file uploads metadata
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  load_id UUID NULL REFERENCES loads(id) ON DELETE SET NULL,
  doc_type TEXT CHECK (doc_type IN ('rate','bol','other')) DEFAULT 'other',
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_load ON documents(load_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_documents_sha ON documents(sha256);
