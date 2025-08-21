import fs from 'fs';
import path from 'path';
import { parse } from 'node-html-parser';
import { ingestDocument } from './rag.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const CHUNK_SIZE = 2000; // Characters per chunk (reduced to stay within token limits)
const MAX_CHUNKS = 50; // Maximum number of chunks per file

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (e) {
    console.error(`Error parsing PDF: ${e.message}`);
    throw new Error(`Failed to extract text from PDF: ${e.message}`);
  }
}

function extractTextFromHtml(html: string): string {
  try {
    const root = parse(html);
    
    // Remove unwanted elements
    root.querySelectorAll('script, style, nav, footer, header, meta, link').forEach(el => el.remove());
    
    // Handle tables specially
    const tableStructure = {
      headers: ['SCHEDULE', 'PART', 'DESC_GOODS', 'PDK KEY', 'COUNTRY', 'ISSUING', 'OGA CODE', 'MANDATORY'] as string[],
      initialized: true
    };

    // Helper function to parse raw text into structured data
    function parseRawText(text: string): { [key: string]: string }[] {
      const entries: { [key: string]: string }[] = [];
      let currentEntry: { [key: string]: string } = {};
      
      // Split text into potential entries
      const parts = text.split(/(?=\b\d{10}\b)/);
      
      parts.forEach(part => {
        const entry: { [key: string]: string } = {};
        
        // Try to match known patterns
        const pdk = part.match(/\b\d{10}\b/)?.[0];
        if (pdk) entry['PDK KEY'] = pdk;
        
        if (part.includes('All countries')) entry['COUNTRY'] = 'All countries';
        
        // Look for ministry names
        if (part.includes('Ministry of')) {
          const ministry = part.match(/Ministry of[^.]*?(?=\.|$)/)?.[0];
          if (ministry) entry['ISSUING'] = ministry.trim();
        }
        
        // Look for schedule and part numbers
        const schedule = part.match(/\bSCHEDULE[:\s]+(\d+)/i)?.[1];
        const partNum = part.match(/\bPART[:\s]+(\d+)/i)?.[1];
        if (schedule) entry['SCHEDULE'] = schedule;
        if (partNum) entry['PART'] = partNum;
        
        // Extract description
        let desc = part
          .replace(/\b\d{10}\b/, '') // Remove PDK KEY
          .replace(/All countries/, '') // Remove country
          .replace(/Ministry of[^.]*?(?=\.|$)/, '') // Remove ministry
          .replace(/\bSCHEDULE[:\s]+\d+/i, '') // Remove schedule
          .replace(/\bPART[:\s]+\d+/i, '') // Remove part
          .replace(/\([^)]*\)/g, ' ') // Remove parentheses
          .replace(/\s+/g, ' ')
          .trim();
        
        // Clean up description
        if (desc.startsWith('===')) {
          desc = desc.substring(desc.indexOf('===', 3) + 3).trim();
        }
        if (desc) entry['DESC_GOODS'] = desc;
        
        // Add entry if it has enough data
        if (Object.keys(entry).length >= 3) {
          entries.push(entry);
        }
      });
      
      return entries;
    }

    // Process all tables and collect entries
    const entries: Array<{ [key: string]: string }> = [];
    
    root.querySelectorAll('table').forEach(table => {
      const rows = table.querySelectorAll('tr');
      
      if (rows.length > 0) {
        // Process structured table data
        Array.from(rows).forEach((row, rowIndex) => {
          if (rowIndex === 0) return; // Skip header row
          
          const cells = row.querySelectorAll('td, th');
          const rowData = Array.from(cells)
            .map(cell => cell.textContent?.trim() || '')
            .slice(0, tableStructure.headers.length);
            
          if (rowData.every(cell => !cell)) return; // Skip empty rows
          
          const entry: { [key: string]: string } = {};
          tableStructure.headers.forEach((header, i) => {
            const value = rowData[i]?.trim();
            if (value) entry[header] = value;
          });
          
          if (Object.keys(entry).length > 0) {
            entries.push(entry);
          }
        });
      } else {
        // Handle raw text
        const rawText = table.textContent?.trim() || '';
        if (rawText) {
          const parsedEntries = parseRawText(rawText);
          entries.push(...parsedEntries);
        }
      }
    });
    
    // Format all entries into chunks
    let formattedText = '';
    const chunkSize = 5; // Number of entries per chunk
    
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunkEntries = entries.slice(i, i + chunkSize);
      
      // Add table header at the start of each chunk
      formattedText += '\n=== Import Requirements Table ===\n';
      formattedText += 'Columns:\n';
      formattedText += tableStructure.headers.map(h => `- ${h}`).join('\n') + '\n\n';
      
      // Add entries
      chunkEntries.forEach((entry, index) => {
        formattedText += `=== Entry ${i + index + 1} ===\n`;
        tableStructure.headers.forEach(header => {
          if (entry[header]) {
            formattedText += `${header}: ${entry[header]}\n`;
          }
        });
        formattedText += '\n';
      });
      
      formattedText += '=' + '='.repeat(40) + '\n\n';
    }
    
    // Replace all table content with formatted text
    root.querySelectorAll('table').forEach(table => {
      table.textContent = formattedText;
    });
    
    // Handle lists
    root.querySelectorAll('ul, ol').forEach(list => {
      const items = list.querySelectorAll('li');
      const formattedItems = Array.from(items).map((item, index) => 
        `${index + 1}. ${item.textContent?.trim() || ''}\n`
      );
      list.textContent = formattedItems.join('') + '\n';
    });
    
    // Add spacing around headings
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
      heading.textContent = '\n' + heading.textContent.trim() + '\n';
    });
    
    // Add spacing around paragraphs
    root.querySelectorAll('p').forEach(p => {
      p.textContent = p.textContent.trim() + '\n';
    });
    
    // Get text content and normalize whitespace
    let text = root.textContent;
    
    // Clean up the text
    text = text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/\n\s+/g, '\n')  // Remove spaces after newlines
      .replace(/\s+\n/g, '\n')  // Remove spaces before newlines
      .replace(/\n+/g, '\n')  // Normalize multiple newlines
      .replace(/^\s+|\s+$/g, '')  // Trim start and end
      .replace(/\|\s+\|/g, '|')  // Clean up empty table cells
      .replace(/\n+/g, '\n')  // Final newline cleanup
      .replace(/\|\s+/g, '|')  // Clean up spaces after separators
      .replace(/\s+\|/g, '|')  // Clean up spaces before separators
      .trim();
    
    return text;
  } catch (e) {
    console.error(`Error parsing HTML: ${e.message}`);
    // Return the raw HTML as text, stripped of tags
    return html
      .replace(/<table[^>]*>/gi, '\n')
      .replace(/<tr[^>]*>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<td[^>]*>/gi, ' | ')
      .replace(/<th[^>]*>/gi, ' | ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\|\s+\|/g, '|')
      .replace(/\|\s+/g, '|')
      .replace(/\s+\|/g, '|')
      .trim();
  }
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  console.log(`Text length: ${text.length}`);
  
  while (start < text.length && chunks.length < MAX_CHUNKS) {
    // Find the end of the current chunk
    let end = Math.min(start + CHUNK_SIZE, text.length);
    
    if (end < text.length) {
      // Try to end at a sentence or paragraph boundary
      const nextPeriod = text.indexOf('.', end - 100);
      const nextParagraph = text.indexOf('\n\n', end - 100);
      
      if (nextParagraph !== -1 && nextParagraph - end < 100) {
        end = nextParagraph + 2;
      } else if (nextPeriod !== -1 && nextPeriod - end < 100) {
        end = nextPeriod + 1;
      } else {
        // If no good boundary found, try to end at a word boundary
        while (end > start && !text[end].match(/\s/)) {
          end--;
        }
      }
    }
    
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    start = end;
  }
  
  return chunks;
}

export async function ingestDir(dir: string) {
  const results: any[] = [];
  const errors: any[] = [];
  
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    return { results, errors };
  }
  
  console.log('Starting directory scan...');
  const files = fs.readdirSync(dir);
  console.log(`Found ${files.length} files in directory`);
  
  for (const f of files) {
    try {
      const ext = path.extname(f).toLowerCase();
      console.log(`Processing file: ${f} (extension: ${ext})`);
      
      if (ext !== '.md' && ext !== '.html' && ext !== '.pdf') {
        console.log(`Skipping unsupported file type: ${ext}`);
        continue;
      }
      
      const p = path.join(dir, f);
      let content: string;
      
      // Handle different file types
      if (ext === '.pdf') {
        console.log(`Processing PDF file: ${f}`);
        try {
          const buffer = fs.readFileSync(p);
          console.log(`Read PDF buffer of size: ${buffer.length} bytes`);
          content = await extractTextFromPdf(buffer);
          console.log(`Successfully extracted ${content.length} characters of text from PDF`);
        } catch (e) {
          console.error(`Error processing PDF file ${f}:`, e);
          throw e;
        }
      } else {
        content = fs.readFileSync(p, 'utf-8');
        
        if (ext === '.html') {
          console.log(`Processing HTML file: ${f}`);
          content = extractTextFromHtml(content);
          console.log(`Extracted ${content.length} characters of text`);
        }
      }
      
      // Split into chunks if content is large
      const chunks = content.length > CHUNK_SIZE ? chunkText(content) : [content];
      const title = f.replace(/\.(md|html|pdf)$/i, '');
      
      console.log(`Processing ${f} in ${chunks.length} chunks`);
      
      // Ingest each chunk with a unique URI
      for (let i = 0; i < chunks.length; i++) {
        try {
          const chunkUri = chunks.length > 1 ? 
            `knowledge://${f}#chunk${i+1}` : 
            `knowledge://${f}`;
          const chunkTitle = chunks.length > 1 ? 
            `${title} (Part ${i+1}/${chunks.length})` : 
            title;
          
          const id = await ingestDocument(chunkUri, chunkTitle, chunks[i]);
          results.push({ f, id, chunk: i+1 });
          console.log(`Successfully ingested chunk ${i+1}/${chunks.length} of ${f}`);
        } catch (e) {
          console.error(`Error ingesting chunk ${i+1}/${chunks.length} of ${f}: ${e.message}`);
          errors.push({ file: f, chunk: i+1, error: e.message });
        }
      }
    } catch (e) {
      console.error(`Error processing file ${f}: ${e.message}`);
      errors.push({ file: f, error: e.message });
    }
  }
  
  return { results, errors };
}
