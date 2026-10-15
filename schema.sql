CREATE TABLE IF NOT EXISTS pdfs (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'General',
  original_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pdfs_created_at ON pdfs(created_at DESC);
