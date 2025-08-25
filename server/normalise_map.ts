// normalizeAndMap.js
// Node.js helper to normalize and map raw LLM output to your taxonomy codes.

import fs from "node:fs";
import path from "node:path";

/** Remove diacritics and lowercase */
export function normalizeText(s) {
  if (s == null) return null;
  // Normalize to NFKD and strip combining marks (diacritics)
  const nfkd = s.normalize("NFKD");
  const withoutDiacritics = nfkd.replace(/[\u0300-\u036f]/g, "");
  return withoutDiacritics.toLowerCase().trim();
}

/** Build specialization synonym map: synonym -> { categoryKey, specKey } */
export function buildSpecSynMap(taxonomy) {
  const synMap = new Map();
  for (const [catKey, catVal] of Object.entries(taxonomy.categories || {})) {
    const specs = catVal.specializations || {};
    for (const [specKey, specVal] of Object.entries(specs)) {
      const syns = specVal.synonyms || [];
      for (const syn of syns) {
        synMap.set(normalizeText(syn), { categoryKey: catKey, specKey });
      }
    }
  }
  return synMap;
}

/** Build category synonym map: synonym -> categoryKey */
export function buildCategorySynMap(taxonomy) {
  const synMap = new Map();
  for (const [catKey, catVal] of Object.entries(taxonomy.categories || {})) {
    const syns = catVal.synonyms || [];
    for (const syn of syns) {
      synMap.set(normalizeText(syn), catKey);
    }
  }
  return synMap;
}

/**
 * Map a list of raw specialization strings to normalized specialization codes
 * using the taxonomy synonyms (returns unique array of codes).
 */
export function mapSpecializations(rawSpecs, taxonomy, { includeCategory = false } = {}) {
  const specSynMap = buildSpecSynMap(taxonomy);
  const out = new Set();
  const catHits = new Set();

  for (const raw of rawSpecs || []) {
    const key = normalizeText(raw);
    const hit = specSynMap.get(key);
    if (hit) {
      out.add(hit.specKey);
      if (includeCategory) catHits.add(hit.categoryKey);
    }
  }

  return {
    specializations: [...out],
    // inferred categories from spec hits (optional)
    inferredCategories: [...catHits],
  };
}

/**
 * Infer cargo category if not provided:
 * 1) If we already inferred from specializations, prefer that (first hit).
 * 2) Else, scan the user query and try category synonyms.
 */
export function inferCategoryIfMissing({ existingCategory, userQuery }, taxonomy, inferredFromSpecs = []) {
  if (existingCategory) return existingCategory;

  if (inferredFromSpecs.length > 0) {
    return inferredFromSpecs[0]; // pick the first inferred category
  }

  if (userQuery) {
    const catSynMap = buildCategorySynMap(taxonomy);
    const tokens = normalizeText(userQuery).split(/\s+/g);
    for (const t of tokens) {
      const hit = catSynMap.get(t);
      if (hit) return hit;
    }
  }

  return null;
}

/**
 * Main helper: takes the raw extraction JSON from your LLM
 * and returns a normalized object with mapped specializations
 * and (optionally) inferred cargo_category.
 *
 * @param {object} extraction - raw LLM JSON (intent, cargo_category, specialization[], constraints, language)
 * @param {object} taxonomy - taxonomy.json object
 * @param {string} [userQuery] - original user query (for category inference if needed)
 */
export function normalizeExtraction(extraction, taxonomy, userQuery = "") {
  const intent = extraction?.intent ?? null;
  const language = extraction?.language ?? null;

  // Map specialization strings -> taxonomy codes
  const { specializations, inferredCategories } = mapSpecializations(
    extraction?.specialization ?? [],
    taxonomy,
    { includeCategory: true }
  );

  // If cargo_category missing, try to infer
  const cargo_category = inferCategoryIfMissing(
    {
      existingCategory: extraction?.cargo_category ?? null,
      userQuery,
    },
    taxonomy,
    inferredCategories
  );

  // Normalize constraints shape
  const constraints = {
    mode: extraction?.constraints?.mode ?? null,
    origin: extraction?.constraints?.origin ?? null,
    destination: extraction?.constraints?.destination ?? null,
    regulatory_help: extraction?.constraints?.regulatory_help ?? null,
  };

  return {
    intent,
    cargo_category,
    specialization: specializations, // normalized codes
    constraints,
    language,
  };
}

/** Convenience loader if you store taxonomy.json on disk */
export function loadTaxonomy(taxonomyPath = path.join(process.cwd(), "taxonomy.json")) {
  const raw = fs.readFileSync(taxonomyPath, "utf-8");
  return JSON.parse(raw);
}

// --- Demo (run directly) ---
// node normalizeAndMap.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const taxonomy = loadTaxonomy(path.join(process.cwd(), "taxonomy.json"));

  const rawExtraction = {
    intent: "FIND_AGENT",
    cargo_category: null,
    specialization: ["燕窝", "EBN", "cold chain"],
    constraints: { mode: null, origin: null, destination: null, regulatory_help: true },
    language: "en",
  };

  const userQuery = "Can find me shipping agent that exports bird nest? I don't have this regulation part.";
  const normalized = normalizeExtraction(rawExtraction, taxonomy, userQuery);
  console.log(JSON.stringify(normalized, null, 2));
}
