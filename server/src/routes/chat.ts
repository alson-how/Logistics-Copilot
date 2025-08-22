import { Router } from 'express';
import OpenAI from 'openai';
import { OPENAI_API_KEY, SERPAPI_API_KEY } from '../env.js';
import { retrieve, ingestDocument } from '../rag.js';
import { loadWorkflow, advanceAsync, getGuidanceHelp } from '../workflow.js';
import { State, WorkflowState, WorkflowMatch } from '../types.js';
import path from 'path';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const WF_PATH = path.join(process.cwd(), 'workflows', 'export_batteries_MY_to_HK_v1.yaml');
const workflow = loadWorkflow(WF_PATH);

export const chat = Router();

const SYSTEM_PROMPT = `You are an AI copilot specializing in import/export regulations and compliance workflows.
Your responses should be:
1. Accurate and based on the provided context
2. Clear and concise
3. Professional in tone
4. Focused on answering the specific question asked

When users ask about exporting or importing goods:
1. If a matching workflow is available, guide them through it
2. Explain each step's requirements and regulations
3. Provide relevant context from the knowledge base
4. Be proactive in suggesting next steps

For example, if a user asks "How do I export batteries from Malaysia to Hong Kong?", respond with:
1. Acknowledge their goal
2. Start the relevant workflow
3. Explain the first step
4. Provide relevant regulations or requirements

When you don't have enough information in the context to fully answer a question, acknowledge this and explain what you can based on the available information.
If the information comes from web search, start your response with "Based on web search results (please verify with official sources):"`;

let currentWorkflow: WorkflowState | null = null;

// Minimum relevance score for RAG results (0 to 1)
const MIN_RELEVANCE_SCORE = 0.82;

async function searchWeb(query: string) {
    try {
        console.log('Searching web with query:', query);
        const response = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${SERPAPI_API_KEY}`);
        if (!response.ok) {
            const error = await response.text();
            console.error('SerpAPI error:', error);
            return [];
        }
        const data = await response.json();
        console.log('Got web search results:', data.organic_results?.length || 0);
        
        const results = (data.organic_results || [])
            .slice(0, 3)
            .map((result: any) => {
                const title = result.title?.trim() || 'Untitled';
                const snippet = result.snippet?.trim() || 'No description available';
                const link = result.link?.trim();
                
                // Skip YouTube links and results without URLs
                if (!link || link.includes('youtube.com') || link.includes('youtu.be')) {
                    console.log('Skipping YouTube or invalid result:', result);
                    return null;
                }

                return {
                    title,
                    content: snippet,
                    url: link
                };
            })
            .filter((result: any) => result !== null);

        for (const result of results) {
            try {
                if (!result.content || !result.title || !result.url) {
                    console.log('Skipping invalid web result for ingestion:', result);
                    continue;
                }
                const uri = `web://${result.url}`;
                const content = `${result.content}\n\nSource: ${result.url}\nIngested: ${new Date().toISOString()}`;
                await ingestDocument(uri, result.title, content);
                console.log(`Stored web result in RAG: ${uri}`);
            } catch (error) {
                console.error(`Failed to store web result in RAG:`, error);
            }
        }
        return results;
    } catch (error) {
        console.error('Web search failed:', error);
        return [];
    }
}

function matchWorkflow(text: string): WorkflowMatch | null {
  const workflows: Record<string, { triggers: string[]; requiredTerms: string[][] }> = {
    'export_batteries_MY_to_HK_v1': {
      triggers: ['export', 'battery', 'batteries', 'malaysia', 'hong kong', 'hk'],
      requiredTerms: [
        ['export', 'send', 'ship'] as string[],
        ['battery', 'batteries'] as string[],
        ['malaysia', 'my', 'malaysian'] as string[],
        ['hong kong', 'hk'] as string[]
      ] as string[][]
    }
  };

  const normalizedText = text.toLowerCase();
  let bestMatch: WorkflowMatch | null = null;

  for (const [workflowId, config] of Object.entries(workflows)) {
    const hasAllRequired = config.requiredTerms.every(termGroup =>
      termGroup.some(term => normalizedText.includes(term))
    );

    if (hasAllRequired) {
      const matchedTriggers = config.triggers.filter(t => normalizedText.includes(t));
      const confidence = matchedTriggers.length / config.triggers.length;

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          workflow: workflowId,
          confidence: confidence,
          triggers: matchedTriggers
        };
      }
    }
  }
  return bestMatch;
}

function normalizeInput(value: string, type?: string): any {
  if (type === 'boolean') {
    const normalized = value.toLowerCase().trim();
    if (['yes', 'true', '1', 'y'].includes(normalized)) return true;
    if (['no', 'false', '0', 'n'].includes(normalized)) return false;
    throw new Error('Invalid boolean value. Please answer with yes or no.');
  }
  if (type === 'integer') {
    const num = Number(value);
    if (isNaN(num)) throw new Error('Invalid number value. Please enter a number.');
    return num;
  }
  return value;
}

function isCommand(text: string): string | null {
  const commands = {
    'start workflow': 'start',
    'continue workflow': 'continue',
    'show status': 'status',
    'help': 'help'
  };
  
  const normalizedText = text.toLowerCase().trim();
  
  for (const [cmd, action] of Object.entries(commands)) {
    if (normalizedText.includes(cmd)) {
      return action;
    }
  }

  const workflowMatch = matchWorkflow(normalizedText);
  if (workflowMatch && workflowMatch.confidence > 0.5) {
    return 'start';
  }
  return null;
}

async function handleWorkflowCommand(command: string, value?: any, userMessage?: string): Promise<{ response: string; workflow?: WorkflowState; context?: Array<{ title: string; content: string; url?: string }> }> {
  switch (command) {
    case 'start':
      const state: State = { currentStepId: workflow.steps[0].id, answers: {}, computed: {}, history: [] };
      currentWorkflow = await advanceAsync(workflow, state);
      
      // Get workflow match if user message is provided
      const match = userMessage ? matchWorkflow(userMessage) : null;
      
      let response = '';
      if (match) {
        response = `I understand you want to export batteries from Malaysia to Hong Kong. I'll help you through the process step by step.\n\n`;
        response += `First, let's gather some basic information about your shipment.\n\n`;
      } else {
        response = `Starting new workflow: ${workflow.title}\n\n`;
      }
      
      response += `Current step: ${currentWorkflow.ui.title}\n${currentWorkflow.ui.question || ''}`;
      if (currentWorkflow.ui.choices) {
        response += `\n\nPlease choose one of the following options:\n`;
        response += currentWorkflow.ui.choices.map((c, i) => `${i + 1}. ${c}`).join('\n');
      }
      
      return {
        response,
        workflow: currentWorkflow
      };

    case 'continue':
      if (!currentWorkflow) {
        return { response: 'No active workflow. Use "start workflow" to begin.' };
      }
      if (value !== undefined) {
        // Get current step and question before advancing
        const currentStep = workflow.steps.find(s => s.id === currentWorkflow.state.currentStepId);
        const currentQuestion = currentStep?.ask?.find(q => q.label === currentWorkflow.ui.question);
        
        // Check if this is the permit question and answer is no
        if (value === false || value === 'no') {
          // Get the advice from the workflow for this case
          const advice = currentStep?.actions_if?.find(action => 
            action.when === 'exporter_has_permit==false'
          )?.advise?.[0] || '';

          // Use the advice as search query if available
          const searchQuery = advice || "Apply for export permit via ePermit DagangNet";
          console.log('Searching for permit requirements:', searchQuery);
          
          // Do web search
          const webResults = await searchWeb(searchQuery);
          let permitInfo = '';
          let context = [];
          
          if (webResults.length > 0) {
            permitInfo = '\n\nBased on web search results (please verify with official sources):\n';
            permitInfo += webResults.map(r => `\n[${r.title}](${r.url})\n${r.content}`).join('\n\n');
            context = webResults.map(r => ({ 
              title: r.title, 
              content: r.content,
              url: r.url 
            }));
          }

          // Clear workflow state
          currentWorkflow = null;
          
          return {
            response: `Your workflow has been stopped because you don't have the required export/strategic permit. The system advises: ${advice}\n\nHere's what you need to know about obtaining the necessary permits:${permitInfo}\n\nPlease obtain the necessary permits before proceeding with the export process.`,
            workflow: null,
            context
          };
        }

        // Normal workflow advancement
        currentWorkflow = await advanceAsync(workflow, currentWorkflow.state, { value });
      }
      
      let continueResponse = currentWorkflow.ui.question || '';
      if (currentWorkflow.ui.choices) {
        continueResponse += `\n\nPlease choose one of the following options:\n`;
        continueResponse += currentWorkflow.ui.choices.map((c, i) => `${i + 1}. ${c}`).join('\n');
      }

      // Check if workflow is complete
      if (currentWorkflow.state.currentStepId === 'done' || !currentWorkflow.ui.question) {
        const finalResponse = continueResponse;
        currentWorkflow = null; // Clear workflow state
        return {
          response: finalResponse,
          workflow: null
        };
      }
      
      return {
        response: continueResponse,
        workflow: currentWorkflow
      };

    case 'status':
      if (!currentWorkflow) {
        return { response: 'No active workflow.' };
      }
      const progress = workflow.steps.findIndex(s => s.id === currentWorkflow.state.currentStepId);
      const total = workflow.steps.length;
      return {
        response: `Current workflow: ${workflow.title}\nProgress: Step ${progress + 1} of ${total}\nCurrent step: ${currentWorkflow.ui.title}\n${currentWorkflow.ui.question || ''}`,
        workflow: currentWorkflow
      };

    case 'help':
      return {
        response: `Available commands:
        - "start workflow" - Begin a new workflow
        - "continue workflow" - Continue the current workflow
        - "show status" - Show current workflow status
        - "help" - Show this help message

        When in a workflow:
        - Simply type your answer to the current question
        - For multiple choice questions, type one of the provided options
        - Type "continue workflow" to proceed to the next question`
      };

    default:
      return { response: 'Unknown command. Type "help" for available commands.' };
  }
}

// Add the POST route handler
chat.post('/', async (req, res) => {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ ok: false, error: 'Invalid messages array' });
    }

    const userMessage = messages[messages.length - 1];
    if (!userMessage || typeof userMessage.content !== 'string') {
        return res.status(400).json({ ok: false, error: 'Invalid user message' });
    }

    try {
        // Check for workflow commands or intent
        const command = isCommand(userMessage.content);
        if (command) {
            const { response, workflow, context } = await handleWorkflowCommand(command, undefined, userMessage.content);
            return res.json({ 
                ok: true, 
                response,
                workflow,
                context: context || []
            });
        }

        // If in a workflow, try to handle as workflow input
        if (currentWorkflow?.ui.question) {
            const workflowDef = loadWorkflow(WF_PATH);
            const currentStep = workflowDef.steps.find(s => s.id === currentWorkflow!.state.currentStepId);
            const currentQuestion = currentStep?.ask?.find(q => q.label === currentWorkflow!.ui.question);
            
            const normalizedValue = normalizeInput(userMessage.content, currentQuestion?.type);
            
            const { response, workflow: updatedWorkflow, context } = await handleWorkflowCommand('continue', normalizedValue);
            
            if (updatedWorkflow) {
                currentWorkflow = updatedWorkflow;
                
                const guidance = await getGuidanceHelp(currentStep!);
                
                return res.json({
                    ok: true,
                    response,
                    workflow: currentWorkflow,
                    context: guidance.citations ? await Promise.all(
                        guidance.citations.map(async uri => {
                            const docs = await retrieve(uri);
                            return docs[0] ? { title: docs[0].title, content: docs[0].content, url: docs[0].uri?.startsWith('web://') ? docs[0].uri.slice(6) : undefined } : null;
                        })
                    ).then(contexts => contexts.filter(Boolean)) : []
                });
            } else {
                // Return the response with context if available
                return res.json({
                    ok: true,
                    response,
                    workflow: null,
                    context: context || []
                });
            }
        }

        // Try RAG first
        console.log('Retrieving from RAG...');
        const ragResults = await retrieve(userMessage.content);
        console.log('Got RAG results:', ragResults.length);
        let contextText = '';
        let sources = [];
        let isWebSearch = false;

        const hasRelevantRagResults = ragResults.length > 0 && 
            ragResults.some(r => {
                if (r.uri?.startsWith('web://')) return false;
                const score = r.score || 0;
                console.log(`RAG result score for ${r.title}: ${score}`);
                return score >= MIN_RELEVANCE_SCORE;
            });

        if (hasRelevantRagResults) {
            console.log('Using RAG results...');
            contextText = ragResults.map(r => {
                const isWeb = r.uri?.startsWith('web://');
                const sourceInfo = isWeb ? 
                    `Source: [${r.title}](${r.uri.slice(6)})` : 
                    `Source: ${r.title}`;
                return `\n${sourceInfo}\nContent: ${r.content}\n---`;
            }).join('\n');
            sources = ragResults.map(r => ({ 
                title: r.title, 
                content: r.content,
                url: r.uri?.startsWith('web://') ? r.uri.slice(6) : undefined
            }));
        } else {
            console.log('No relevant RAG results found, falling back to web search...');
            const webResults = await searchWeb(userMessage.content);
            console.log('Got web results:', webResults.length);
            isWebSearch = true;
            
            if (webResults.length > 0) {
                contextText = webResults.map(r => `\nSource: [${r.title}](${r.url})\nContent: ${r.content}\n---`).join('\n');
                sources = webResults.map(r => ({ 
                    title: r.title, 
                    content: r.content,
                    url: r.url 
                }));
            }
        }

        let workflowContext = '';
        if (currentWorkflow) {
            workflowContext = `\nCurrent workflow: ${workflow.title}\nStep: ${currentWorkflow.ui.title}\nQuestion: ${currentWorkflow.ui.question || 'None'}`;
        }

        const sourceNote = isWebSearch ? 
            "\nNote: This information comes from web search results. Please verify the information from official sources." :
            "\nNote: This information comes from our knowledge base.";

        const chatMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'system', content: `Context:\n${contextText}\n${workflowContext}${sourceNote}` },
            ...messages.slice(0, -1),
            userMessage
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: chatMessages as any,
            temperature: 0.7,
        });

        const response = completion.choices[0]?.message?.content || 'No response generated.';
        return res.json({ 
            ok: true, 
            response,
            workflow: currentWorkflow,
            context: sources
        });

    } catch (error: any) {
        console.error('Chat error:', error);
        return res.status(500).json({ 
            ok: false,
            error: error.message || 'Failed to process chat request',
            workflow: currentWorkflow
        });
    }
});