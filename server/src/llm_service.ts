import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import { OPENAI_API_KEY } from './env.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Load the extraction prompt template
async function loadExtractionPrompt(): Promise<string> {
  const promptPath = path.join(process.cwd(), 'extract_prompt', 'extraction_prompt.txt');
  return await fs.readFile(promptPath, 'utf-8');
}

export interface ExtractionResult {
  cargo_category?: string;
  specialization?: string;
  origin?: string;
  destination?: string;
  requirements?: string[];
}

export async function callLLMExtractor(userQuery: string): Promise<ExtractionResult> {
  try {
    const prompt = await loadExtractionPrompt();
    
    // Call OpenAI with the extraction prompt
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",  // or your preferred model
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userQuery }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the JSON response
    const result = JSON.parse(completion.choices[0].message.content);
    
    return {
      cargo_category: result.cargo_category || '',
      specialization: result.specialization || '',
      origin: result.origin,
      destination: result.destination,
      requirements: result.requirements || []
    };
  } catch (error) {
    console.error('Error in LLM extraction:', error);
    return {};
  }
}
