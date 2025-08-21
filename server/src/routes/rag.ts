import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { ingestDocument, retrieve } from '../rag.js';
import { ingestDir } from '../knowledge.js';

export const rag = Router();

rag.post('/rag/ingest', async (req, res) => {
  const { uri, title, content } = req.body;
  const id = await ingestDocument(uri, title, content);
  res.json({ ok: true, id });
});

rag.post('/rag/retrieve', async (req, res) => {
  const { query } = req.body;
  const rows = await retrieve(query);
  res.json({ ok: true, results: rows });
});

rag.post('/rag/ingest-seed', async (_, res) => {
  const seedDir = '/seed';
  const files = fs.existsSync(seedDir) ? fs.readdirSync(seedDir) : [];
  const results: any[] = [];
  for (const f of files) {
    const p = path.join(seedDir, f);
    const content = fs.readFileSync(p, 'utf-8');
    const title = f.replace(/\.md$/, '');
    const uri = `seed://${f}`;
    const id = await ingestDocument(uri, title, content);
    results.push({ f, id });
  }
  res.json({ ok: true, results });
});

rag.post('/rag/ingest-dir', async (req, res) => {
  const dir = (req.body?.dir as string) || process.env.KNOWLEDGE_DIR || '/knowledge';
  const results = await ingestDir(dir);
  res.json({ ok: true, dir, results });
});
