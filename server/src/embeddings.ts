import OpenAI from 'openai';
import { OPENAI_API_KEY } from './env.js';
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

export async function embed(texts: string[]): Promise<string[]> {
  const res = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts[0]
  });
  return res.data.map(v => `[${(v.embedding as unknown as number[]).join(',')}]`);
}
