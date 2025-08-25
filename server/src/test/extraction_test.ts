import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Get the directory path of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from root level .env
const result = dotenv.config({ path: path.join(__dirname, '../../../.env') });

if (result.error) {
  console.error('Error loading .env file:', result.error);
  process.exit(1);
}

// Set required environment variables for testing if not present
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required in .env file');
  process.exit(1);
}

if (!process.env.SERPAPI_API_KEY) {
  process.env.SERPAPI_API_KEY = 'dummy_key_for_testing';
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://dummy:dummy@localhost:5432/dummy';
}

import { callLLMExtractor } from '../llm_service.js';

async function testExtraction() {
  const testCases = [
    {
      query: "Can find me shipping agent that exports bird nest? I don't have this regulation part.",
      description: "English query with bird nest and regulation"
    },
    {
      query: "Perlu forwarder DG untuk hantar bahan kimia ke Singapura.",
      description: "Malay query with dangerous goods"
    },
    {
      query: "有冷链伙伴吗？我要运冷冻海鲜从槟城出去。",
      description: "Chinese query with cold chain requirements"
    }
  ];

  console.log('Starting extraction tests...\n');

  for (const test of testCases) {
    console.log(`Testing: ${test.description}`);
    console.log(`Query: ${test.query}`);
    try {
      const result = await callLLMExtractor(test.query);
      console.log('Extracted information:');
      console.log(JSON.stringify(result, null, 2));
      console.log('\n---\n');
    } catch (error) {
      console.error(`Error processing query: ${error}`);
    }
  }
}

// Run the tests
testExtraction().catch(console.error);
