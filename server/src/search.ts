import { SerpAPI } from 'langchain/tools';
import { Document } from './types.js';
import { Cache } from './cache.js';

const CONFIDENCE_THRESHOLD = 0.82;
const cache = new Cache('web_search');

interface SearchResult {
  title: string;
  content: string;
  url: string;
}

export async function webSearch(query: string): Promise<SearchResult[]> {
  // Try cache first
  const cached = await cache.get(query);
  if (cached) {
    return cached;
  }

  // Fallback to SerpAPI
  const search = new SerpAPI(process.env.SERPAPI_API_KEY);
  const results = await search.call(query);
  
  // Parse and format results
  const parsed = JSON.parse(results);
  const formatted = parsed.organic_results.map((result: any) => ({
    title: result.title,
    content: result.snippet,
    url: result.link
  }));

  // Cache results
  await cache.set(query, formatted);
  
  return formatted;
}

export function mergeResults(ragResults: Document[], webResults: SearchResult[]): Document[] {
  const merged: Document[] = [...ragResults];
  
  // Add web results with citations
  for (const result of webResults) {
    merged.push({
      id: 0, // Will be assigned by DB
      uri: `web://${result.url}`,
      title: result.title,
      content: `${result.content}\n\nSource: ${result.url}`,
      created_at: new Date()
    });
  }

  // Deduplicate by content similarity
  const deduped = merged.filter((doc, index) => {
    const similarDocs = merged.slice(0, index).filter(d => 
      similarity(doc.content, d.content) > 0.8
    );
    return similarDocs.length === 0;
  });

  return deduped;
}

function similarity(a: string, b: string): number {
  // Simple Jaccard similarity for now
  const setA = new Set(a.toLowerCase().split(/\W+/));
  const setB = new Set(b.toLowerCase().split(/\W+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
