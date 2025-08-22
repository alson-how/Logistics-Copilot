import fs from 'fs';
import path from 'path';

export class Cache {
  private cacheDir: string;
  private cacheFile: string;
  private cache: Map<string, { data: any; timestamp: number }>;
  private TTL: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor(namespace: string) {
    this.cacheDir = path.join(process.cwd(), '.cache');
    this.cacheFile = path.join(this.cacheDir, `${namespace}.json`);
    this.cache = new Map();
    this.loadCache();
  }

  private loadCache() {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      if (fs.existsSync(this.cacheFile)) {
        const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
        this.cache = new Map(Object.entries(data));
      }
    } catch (e) {
      console.warn('Failed to load cache:', e);
    }
  }

  private saveCache() {
    try {
      const data = Object.fromEntries(this.cache.entries());
      fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
    } catch (e) {
      console.warn('Failed to save cache:', e);
    }
  }

  async get(key: string): Promise<any | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      this.saveCache();
      return null;
    }

    return entry.data;
  }

  async set(key: string, value: any): Promise<void> {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now()
    });
    this.saveCache();
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.saveCache();
  }
}
