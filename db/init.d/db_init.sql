CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  uri TEXT UNIQUE,
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doc_embeddings (
  doc_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doc_embeddings
  ON doc_embeddings USING ivfflat (embedding vector_cosine_ops);
