import { pool } from './db.js';
import { embed } from './embeddings.js';
import { RAG_TOP_K } from './env.js';

export async function ingestDocument(uri: string, title: string, content: string) {
  // Validate inputs
  if (!uri || !title || !content) {
    console.error('Invalid document:', { uri, title, contentLength: content?.length });
    throw new Error('URI, title, and content are required for document ingestion');
  }

  // Clean up content
  const cleanContent = content.trim();
  if (!cleanContent) {
    console.error('Empty content after cleanup:', { uri, title });
    throw new Error('Document content cannot be empty');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO documents(uri, title, content) VALUES($1,$2,$3) ON CONFLICT(uri) DO UPDATE SET title=EXCLUDED.title, content=EXCLUDED.content RETURNING id',
      [uri, title, cleanContent]
    );
    const id = rows[0].id;
    await client.query('DELETE FROM doc_embeddings WHERE doc_id=$1', [id]);
    const [vec] = await embed([cleanContent]);
    await client.query('INSERT INTO doc_embeddings(doc_id, embedding) VALUES($1, $2)', [id, vec]);
    await client.query('COMMIT');
    return id;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function retrieve(query: string) {
  const [qvec] = await embed([query]);
  const { rows } = await pool.query(
    `SELECT d.uri, d.title, d.content, 1 - (e.embedding <=> $1) as score
     FROM doc_embeddings e JOIN documents d ON d.id=e.doc_id
     ORDER BY e.embedding <-> $1
     LIMIT $2`,
    [qvec, RAG_TOP_K]
  );
  return rows;
}

export async function getDocsByTitles(titles: string[]) {
  if (!titles || titles.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT uri, title, content FROM documents WHERE title = ANY($1)`,
    [titles]
  );
  return rows as { uri: string; title: string; content: string }[];
}