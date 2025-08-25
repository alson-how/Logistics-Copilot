import fs from 'fs/promises';
import path from 'path';

interface Taxonomy {
  cargo_categories: Record<string, string[]>;
  specializations: Record<string, string[]>;
  locations: Record<string, string[]>;
}

export async function loadTaxonomy(taxonomyPath: string): Promise<Taxonomy> {
  try {
    const content = await fs.readFile(taxonomyPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading taxonomy:', error);
    return {
      cargo_categories: {},
      specializations: {},
      locations: {}
    };
  }
}

interface ExtractionResult {
  cargo_category?: string;
  specialization?: string;
  origin?: string;
  destination?: string;
  requirements?: string[];
}

function findBestMatch(value: string, categories: Record<string, string[]>): string | undefined {
  for (const [normalized, variations] of Object.entries(categories)) {
    if (variations.some(v => value.toLowerCase().includes(v.toLowerCase()))) {
      return normalized;
    }
  }
  return undefined;
}

export function normalizeExtraction(
  extraction: ExtractionResult,
  taxonomy: Taxonomy,
  originalQuery: string
): ExtractionResult {
  const normalized: ExtractionResult = {
    requirements: extraction.requirements || []
  };

  // Normalize cargo category
  if (extraction.cargo_category) {
    normalized.cargo_category = findBestMatch(extraction.cargo_category, taxonomy.cargo_categories);
  }

  // Normalize specialization
  if (extraction.specialization) {
    normalized.specialization = findBestMatch(extraction.specialization, taxonomy.specializations);
  }

  // Normalize locations
  if (extraction.origin) {
    normalized.origin = findBestMatch(extraction.origin, taxonomy.locations);
  }
  if (extraction.destination) {
    normalized.destination = findBestMatch(extraction.destination, taxonomy.locations);
  }

  return normalized;
}
