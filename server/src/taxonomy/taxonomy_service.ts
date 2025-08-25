import { loadTaxonomy, normalizeExtraction } from '../normalise_map.js';
import { extractProductFromQuery } from '../shipping_agent_suggestion.js';
import { callLLMExtractor } from '../llm_service.js';

let taxonomyCache: any = null;

export async function initTaxonomy() {
  if (!taxonomyCache) {
    taxonomyCache = await loadTaxonomy('./taxonomy/taxonomy.json');
  }
  return taxonomyCache;
}

export interface ExtractedInfo {
  cargo_category: string;
  specialization: string;
  origin?: string;
  destination?: string;
}

export async function extractShippingInfo(messages: Array<{ role: string; content: string }>): Promise<ExtractedInfo> {
  // Get the raw product first
  const rawProduct = extractProductFromQuery(messages);
  
  // Get the taxonomy
  const taxonomy = await initTaxonomy();
  
  // Extract structured info using LLM
  const userMessage = messages[messages.length - 1].content;
  const extraction = await callLLMExtractor(userMessage);
  
  // Normalize the extraction using taxonomy
  const normalized = normalizeExtraction(extraction, taxonomy, userMessage);
  
  return {
    cargo_category: normalized.cargo_category || rawProduct,
    specialization: normalized.specialization || '',
    origin: normalized.origin,
    destination: normalized.destination
  };
}

export function matchAgentToRequirements(agentSpecialization: string, requirements: ExtractedInfo): number {
  // Simple scoring system - can be enhanced
  let score = 0;
  const maxScore = 100;
  
  // Convert both to lowercase for comparison
  const agentSpec = agentSpecialization.toLowerCase();
  const reqSpec = requirements.specialization.toLowerCase();
  const reqCategory = requirements.cargo_category.toLowerCase();
  
  // Normalize text for comparison
  const normalizeText = (text: string): string => {
    return text.toLowerCase()
      .replace(/['']s?/g, '') // Remove apostrophes and 's'
      .replace(/\s+/g, ' ')   // Normalize spaces
      .trim();
  };

  const normalizedAgentSpec = normalizeText(agentSpec);
  const normalizedReqCategory = normalizeText(reqCategory);

  // Define category synonyms and related terms
  const categoryMap: Record<string, string[]> = {
    'chemical': ['chemical', 'chemicals', 'hazmat', 'hazardous', 'dg', 'dangerous goods', 'iso tank', 'bulk'],
    'dangerous goods': ['dg', 'dangerous goods', 'hazmat', 'hazardous', 'chemical', 'chemicals'],
    'food': ['food', 'foods', 'foodstuff', 'perishable', 'fresh', 'agricultural'],
    'electronics': ['electronic', 'electronics', 'devices', 'gadgets', 'components'],
    'machinery': ['machine', 'machines', 'machinery', 'equipment', 'parts'],
    'textile': ['textile', 'textiles', 'fabric', 'fabrics', 'garment', 'clothing']
  };

  // Common terms for all industries
  const commonTerms = {
    capability: ['export', 'import', 'shipping', 'logistics', 'transport', 'forwarding', 'freight'],
    quality: ['certified', 'licensed', 'authorized', 'specialist', 'experienced'],
    service: ['international', 'worldwide', 'global', 'regional', 'domestic']
  };

  // Get common capability terms to exclude from word matching
  const commonCapabilityTerms = new Set(commonTerms.capability);

  // Get related terms for the requested category
  const relatedTerms = new Set<string>();
  for (const [category, terms] of Object.entries(categoryMap)) {
    if (normalizedReqCategory.includes(category) || terms.some(term => normalizedReqCategory.includes(term))) {
      terms.forEach(term => relatedTerms.add(term));
    }
  }

  // Split texts into words for more accurate matching, excluding common capability terms
  const agentWords = normalizedAgentSpec
    .split(/\W+/)
    .filter(word => 
      Boolean(word) && 
      !commonCapabilityTerms.has(word) && // Exclude common terms like 'export'
      word.length > 2 // Ignore very short words
    );

  const categoryWords = [...new Set([...normalizedReqCategory.split(/\W+/), ...relatedTerms])]
    .filter(word => 
      Boolean(word) && 
      !commonCapabilityTerms.has(word) && // Exclude common terms like 'export'
      word.length > 2 // Ignore very short words
    );

  console.log('Filtered agent words:', agentWords);
  console.log('Filtered category words:', categoryWords);

  // Calculate word-level match score with improved matching
  const wordMatchCount = categoryWords.filter(word => {
    // Direct match
    if (agentWords.includes(word)) {
      console.log('Direct word match:', word);
      return true;
    }

    // Related terms match
    const hasRelatedMatch = agentWords.some(agentWord => {
      // Check for variations and compound words
      const isRelated = relatedTerms.has(agentWord) || 
                       Array.from(relatedTerms).some(term => 
                         (agentWord.includes(term) || term.includes(agentWord)) &&
                         term.length > 3 // Only consider substantial matches
                       );
      if (isRelated) {
        console.log('Related term match:', word, '<->', agentWord);
      }
      return isRelated;
    });

    if (hasRelatedMatch) return true;

    // Partial word match for longer terms
    const hasPartialMatch = agentWords.some(agentWord => {
      const isPartialMatch = 
        (word.length > 3 && agentWord.includes(word)) || 
        (agentWord.length > 3 && word.includes(agentWord));
      if (isPartialMatch) {
        console.log('Partial word match:', word, '<->', agentWord);
      }
      return isPartialMatch;
    });

    return hasPartialMatch;
  }).length;

  // 1. Word Match Score (0-35 points)
  const wordMatchScore = (wordMatchCount / categoryWords.length) * 35;
  score += wordMatchScore;
  console.log('Word match score:', wordMatchScore);

  // 2. Context relevance scoring (0-35 points total)

  // Define industry-specific context terms
  const industryContexts: Record<string, {
    capabilities: string[];
    facilities: string[];
    requirements: string[];
  }> = {
    chemical: {
      capabilities: ['hazmat handling', 'dangerous goods', 'dg certified', 'chemical transport'],
      facilities: ['iso tank', 'chemical warehouse', 'tank terminal', 'bulk storage'],
      requirements: ['safety certified', 'dg compliant', 'hazmat licensed']
    },
    food: {
      capabilities: ['cold chain', 'temperature controlled', 'fresh logistics'],
      facilities: ['cold storage', 'refrigerated container', 'temperature monitoring'],
      requirements: ['food grade', 'haccp certified', 'fda approved']
    },
    electronics: {
      capabilities: ['secure transport', 'high-value cargo', 'tech logistics'],
      facilities: ['secure warehouse', 'climate control', 'anti-static'],
      requirements: ['insurance coverage', 'security certified', 'tracking']
    },
    machinery: {
      capabilities: ['heavy lift', 'project cargo', 'oversized transport'],
      facilities: ['heavy equipment yard', 'crane facility', 'loading dock'],
      requirements: ['lifting certified', 'project handling', 'special equipment']
    }
  };

  // Get industry context based on category
  const industryContext = Object.entries(categoryMap).find(([category, terms]) =>
    normalizedReqCategory.includes(category) || terms.some(term => normalizedReqCategory.includes(term))
  )?.[0] || '';

  // Calculate context relevance with industry focus
  let contextScore = 0;

  // 1. Score common terms (max 20 points)
  for (const [category, terms] of Object.entries(commonTerms)) {
    const matchedTerms = terms.filter(term => 
      normalizedAgentSpec.includes(term) ||
      term.split(' ').every(word => normalizedAgentSpec.includes(word))
    );
    
    if (matchedTerms.length > 0) {
      const weight = category === 'capability' ? 12 :  // Core capabilities
                    category === 'quality' ? 5 :      // Quality indicators
                    3;                                // Service terms
      
      const matchScore = Math.min(matchedTerms.length * (weight/2), weight);
      contextScore += matchScore;
      
      console.log(`Common ${category} score:`, matchScore, 
                  '(matched terms:', matchedTerms.join(', '), ')');
    }
  }

  // 2. Score industry-specific terms (max 15 points)
  if (industryContext && industryContexts[industryContext]) {
    const industryTerms = industryContexts[industryContext];
    
    // Check capabilities (max 8 points)
    const matchedCapabilities = industryTerms.capabilities.filter(term =>
      normalizedAgentSpec.includes(term) ||
      term.split(' ').every(word => normalizedAgentSpec.includes(word))
    );
    if (matchedCapabilities.length > 0) {
      const capScore = Math.min(matchedCapabilities.length * 4, 8);
      contextScore += capScore;
      console.log(`Industry capability score:`, capScore,
                  '(matched terms:', matchedCapabilities.join(', '), ')');
    }

    // Check facilities (max 4 points)
    const matchedFacilities = industryTerms.facilities.filter(term =>
      normalizedAgentSpec.includes(term) ||
      term.split(' ').every(word => normalizedAgentSpec.includes(word))
    );
    if (matchedFacilities.length > 0) {
      const facScore = Math.min(matchedFacilities.length * 2, 4);
      contextScore += facScore;
      console.log(`Industry facility score:`, facScore,
                  '(matched terms:', matchedFacilities.join(', '), ')');
    }

    // Check requirements (max 3 points)
    const matchedReqs = industryTerms.requirements.filter(term =>
      normalizedAgentSpec.includes(term) ||
      term.split(' ').every(word => normalizedAgentSpec.includes(word))
    );
    if (matchedReqs.length > 0) {
      const reqScore = Math.min(matchedReqs.length * 1.5, 3);
      contextScore += reqScore;
      console.log(`Industry requirement score:`, reqScore,
                  '(matched terms:', matchedReqs.join(', '), ')');
    }
  }

  score += contextScore;
  console.log('Total context score:', contextScore);

  // 3. Specialization Match (0-20 points)
  if (reqSpec) {
    const normalizedReqSpec = normalizeText(reqSpec);
    const specWords = normalizedReqSpec.split(/\W+/).filter(Boolean);
    const specMatchCount = specWords.filter(word => 
      agentWords.includes(word) || 
      agentWords.some(agentWord => agentWord.includes(word) && word.length > 3)
    ).length;
    const specScore = (specMatchCount / specWords.length) * 20;
    score += specScore;
    console.log('Specialization score:', specScore);
  }

  // 4. Proximity bonus (0-10 points)
  const reqTerms = [...categoryWords, ...normalizeText(reqSpec || '').split(/\W+/)].filter(Boolean);
  if (reqTerms.length > 1) {
    const termPositions = reqTerms.map(term => normalizedAgentSpec.indexOf(term)).filter(pos => pos !== -1);
    if (termPositions.length > 1) {
      const maxDistance = Math.max(...termPositions) - Math.min(...termPositions);
      const proximityBonus = Math.max(0, 10 - maxDistance / 4);
      score += proximityBonus;
      console.log('Proximity bonus:', proximityBonus);
    }
  }
  
  console.log('Final score before cap:', score);
  return Math.min(score, 100);
  
  return Math.min(score, maxScore);
}
