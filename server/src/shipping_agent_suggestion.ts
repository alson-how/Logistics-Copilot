import { retrieve } from './rag.js';

export function isShippingAgentQuery(text: string): boolean {
  const keywords = [
    'shipping agent',
    'freight forwarder',
    'logistics company',
    'shipping company',
    'recommend agent',
    'suggest agent',
    'find agent',
    'export agent'
  ];
  const normalizedText = text.toLowerCase();
  return keywords.some(keyword => normalizedText.includes(keyword));
}

export function extractProductFromQuery(messages: Array<{ role: string; content: string }>): string {
  const userMessage = messages[messages.length - 1].content.toLowerCase();
  
  // Special case for bird nest
  if (userMessage.includes('bird nest') || userMessage.includes('bird\'s nest')) {
    console.log('Found bird nest in message');
    return 'bird nest';
  }
  
  // Try to extract product from current message
  // Look for patterns like:
  // - "exporting bird nest"
  // - "export bird's nest"
  // - "shipping bird nest"
  // - "for bird nest"
  const patterns = [
    /(?:export(?:ing)?|ship(?:ping)?|send(?:ing)?|transport(?:ing)?)\s+((?:bird'?s?\s*nest|[\w\s]+)(?:\s+to\s+[\w\s]+)?)/i,
    /(?:for|with)\s+((?:bird'?s?\s*nest|[\w\s]+)(?:\s+to\s+[\w\s]+)?)/i
  ];
  
  console.log('Trying to extract product from:', userMessage);

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (match) {
      let product = match[1].trim();
      // Remove any "to [location]" part
      product = product.replace(/\s+to\s+[\w\s]+$/, '');
      console.log('Extracted product:', product);
      // Don't return common words that aren't products
      if (!['goods', 'items', 'products', 'things'].includes(product)) {
        return product;
      }
    }
  }

  // Check if this is a response to our "what goods" question
  if (messages.length > 1) {
    const prevMessage = messages[messages.length - 2];
    if (prevMessage.role === 'assistant' && prevMessage.content.includes('what type of goods')) {
      return userMessage;
    }
  }

  return '';
}

import { extractShippingInfo, matchAgentToRequirements } from './taxonomy/taxonomy_service.js';

export async function findShippingAgents(product: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  try {
    console.log('Finding shipping agents for product:', product);
    
    // Extract structured info using taxonomy
    const requirements = await extractShippingInfo(messages);
    console.log('Extracted requirements:', requirements);
    
    // Search RAG for shipping agent documents
    const query = `${requirements.cargo_category} ${requirements.specialization} shipping agent food agriculture`;
    const results = await retrieve(query);
    console.log(`Found ${results.length} potential matches`);
    
    // Log each result for debugging
    results.forEach((doc, i) => {
      console.log(`Result ${i + 1}:`, {
        uri: doc.uri,
        title: doc.title,
        score: doc.score,
        contentPreview: doc.content.substring(0, 200)
      });
    });

    // Filter for shipping agent documents and extract info
    const relevantAgents = [];
    for (const doc of results) {
      // Normalize both strings for comparison (remove apostrophes and convert to lowercase)
      const normalizedContent = doc.content.toLowerCase().replace(/'/g, '');
      const normalizedProduct = product.toLowerCase().replace(/'/g, '');
      
      console.log('Checking document:', {
        uri: doc.uri,
        hasProduct: normalizedContent.includes(normalizedProduct),
        normalizedProduct,
        contentPreview: normalizedContent.substring(0, 100)
      });
      
      // Check if this is a shipping agent document by looking for common patterns
      const hasAgentIndicators = (
        doc.content.toLowerCase().includes('specialization:') ||
        doc.content.toLowerCase().includes('contact:') ||
        doc.content.toLowerCase().includes('shipping services') ||
        doc.content.toLowerCase().includes('logistics') ||
        doc.content.match(/##\s+[\w\s]+(?:logistics|shipping|freight|export)/i)
      );

      if (hasAgentIndicators) {
        console.log('Found potential agent document:', doc.uri);
        
        // Split content into sections based on document structure
        const sections = doc.content.match(/##[^#]+/g) || // Try markdown headers first
          doc.content.split('---').filter(Boolean) || // Then try separator blocks
          [doc.content]; // Fallback to whole content
        
        // Skip the first section if it's just a header
        const contentSections = sections.filter(section => !section.trim().startsWith('# '));
        
        for (const section of contentSections) {
          const normalizedSection = section.toLowerCase().replace(/'/g, '');
          
          // Extract relevant information from the section
          const extractField = (field: string): string => {
            // Try markdown format first
            const markdownMatch = section.match(new RegExp(`\\*\\*${field}:\\*\\*\\s+(.+?)(?=\\n|$)`, 'i'));
            if (markdownMatch) return markdownMatch[1].trim();
            
            // Try plain text format
            const plainMatch = section.match(new RegExp(`${field}:\\s+(.+?)(?=\\n|$)`, 'i'));
            if (plainMatch) return plainMatch[1].trim();
            
            return '';
          };

          // Get company name from header or field
          const nameMatch = section.match(/##\s+(.+?)(?=\n|$)/) || 
                          section.match(/company:\s+(.+?)(?=\n|$)/i);
          const name = nameMatch ? nameMatch[1].trim() : '';

          // Extract other fields
          const specialization = extractField('Specialization') || extractField('Services');
          const services = extractField('Services') || extractField('Products');
          const expertise = extractField('Expertise') || extractField('Experience');
          
          // Combine all relevant text for matching
          const relevantText = [specialization, services, expertise]
            .filter(Boolean)
            .join(' ');
          
          console.log('Checking section:', {
            name,
            specialization,
            services,
            expertise
          });

          const matchScore = matchAgentToRequirements(relevantText, requirements);
          console.log('Section match score:', matchScore);
          
          if (matchScore > 40) {
            const contact = extractField('Contact');
            const website = extractField('Website');

            if (name && (specialization || services)) {
              relevantAgents.push({
                name,
                specialization: specialization || services || expertise || '',
                contact: contact || '',
                website: website || ''
              });
            }
          }
        }
      }
    }

    console.log(`Found ${relevantAgents.length} relevant agents`);

    if (relevantAgents.length === 0) {
      return `I couldn't find any shipping agents specifically specializing in ${product}. Would you like me to:
1. Search for general freight forwarders?
2. Search for regional specialists?
3. Do a web search for specialized agents?

Please let me know your preference.`;
    }

    // Create structured response with UI components
    const structuredResponse = {
      type: 'shipping_agents',
      title: `Shipping Agents for ${product}`,
      agents: relevantAgents.map((agent, i) => {
        // Parse contact information
        const contactParts = agent.contact ? agent.contact.split('|').map(part => part.trim()) : [];
        const email = contactParts.find(part => part.includes('@'));
        const phone = contactParts.find(part => part.includes('+') || part.match(/\d{2,}/));

        return {
          id: `agent_${i + 1}`,
          name: agent.name,
          website: agent.website,
          specialization: agent.specialization,
          contact: {
            email: email?.trim(),
            phone: phone?.trim()
          },
          actions: [
            {
              type: 'link',
              label: 'Visit Website',
              url: agent.website,
              icon: '🌐'
            },
            {
              type: 'email',
              label: 'Send Email',
              url: `mailto:${email?.trim()}`,
              icon: '✉️'
            },
            {
              type: 'phone',
              label: 'Call Now',
              url: `tel:${phone?.trim()?.replace(/\s+/g, '')}`,
              icon: '📞'
            },
            {
              type: 'chat',
              label: 'Get Quote',
              action: 'request_quote',
              icon: '💬'
            }
          ].filter(action => 
            (action.type === 'link' && agent.website) ||
            (action.type === 'email' && email) ||
            (action.type === 'phone' && phone) ||
            action.type === 'chat'
          )
        };
      }),
      recommendation: 'These agents have experience with your type of goods. I recommend contacting them for quotes and checking their experience with your specific requirements.',
      quickActions: [
        {
          label: 'Contact All',
          icon: '📧',
          action: 'contact_all'
        },
        {
          label: 'Compare Services',
          icon: '📊',
          action: 'compare_services'
        },
        {
          label: 'Save to Favorites',
          icon: '⭐',
          action: 'save_favorites'
        }
      ]
    };

    // Convert to markdown for clients that don't support rich UI
    let fallbackResponse = `### ${structuredResponse.title}\n\n`;
    structuredResponse.agents.forEach((agent, i) => {
      fallbackResponse += `#### ${i + 1}. ${agent.website ? `[${agent.name}](${agent.website})` : `**${agent.name}**`}\n`;
      fallbackResponse += `- **Specialization**: ${agent.specialization}\n`;
      if (agent.contact.email) fallbackResponse += `- **Email**: [${agent.contact.email}](mailto:${agent.contact.email})\n`;
      if (agent.contact.phone) fallbackResponse += `- **Phone**: \`${agent.contact.phone}\`\n`;
      fallbackResponse += '\n';
    });
    fallbackResponse += `\n${structuredResponse.recommendation}`;

    // Return both structured and fallback responses
    return JSON.stringify({
      structured: structuredResponse,
      fallback: fallbackResponse
    });
  } catch (error) {
    console.error('Error finding shipping agents:', error);
    console.error('Error details:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return 'I apologize, but I encountered an error while searching for shipping agents. Please try again or specify a different type of product.';
  }
}