import dotenv from 'dotenv';
dotenv.config();

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
export const DATABASE_URL = process.env.DATABASE_URL;
export const RAG_TOP_K = parseInt(process.env.RAG_TOP_K || '5', 10);

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

if (!SERPAPI_API_KEY) {
  throw new Error('SERPAPI_API_KEY environment variable is required');
}

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}