import express from 'express';
import cors from 'cors';
import { PORT } from './env.js';
import { health } from './routes/health.js';
import { rag } from './routes/rag.js';
import { workflowRouter } from './routes/workflow.js';
import { chat } from './routes/chat.js';
import { ingestDir } from './knowledge.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api', health);
app.use('/api', rag);
app.use('/api', workflowRouter);
app.use('/api', chat);

app.listen(PORT, async () => {
  console.log(`API on :${PORT}`);
  if (process.env.AUTO_INGEST === '1') {
    const dir = process.env.KNOWLEDGE_DIR || '/knowledge';
    try {
      const { results, errors } = await ingestDir(dir);
      console.log(`[knowledge] auto-ingested ${results.length} files from ${dir}`);
      if (errors.length > 0) {
        console.warn(`[knowledge] encountered ${errors.length} errors during ingestion:`, errors);
      }
    } catch (e) {
      console.warn('[knowledge] auto-ingest failed:', e);
    }
  }
});
