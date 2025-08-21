import dotenv from 'dotenv';
dotenv.config();
export const PORT = Number(process.env.PORT || 8080);
export const DATABASE_URL = process.env.DATABASE_URL!;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
export const RAG_TOP_K = Number(process.env.RAG_TOP_K || 6);
