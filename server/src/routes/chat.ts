import { Router } from 'express';
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../env.js';
import { retrieve } from '../rag.js';
import { loadWorkflow, advanceAsync, getGuidanceHelp } from '../workflow.js';
import { State } from '../types.js';
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

When you don't have enough information in the context to fully answer a question, acknowledge this and explain what you can based on the available information.`;

interface WorkflowState {
  state: State;
  ui: {
    step_id: string;
    title: string;
    question?: string;
    help?: string;
    choices?: string[];
  };
  next_action: string;
  citations?: string[];
}

let currentWorkflow: WorkflowState | null = null;

interface WorkflowMatch {
  workflow: string;
  confidence: number;
  triggers: string[];
}

function matchWorkflow(text: string): WorkflowMatch | null {
  // Define workflow matching rules
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
    // Add more workflows here as needed
  };

  const normalizedText = text.toLowerCase();
  let bestMatch: WorkflowMatch | null = null;

  for (const [workflowId, config] of Object.entries(workflows)) {
    // Check if all required term groups have at least one match
    const hasAllRequired = config.requiredTerms.every(termGroup =>
      termGroup.some(term => normalizedText.includes(term))
    );

    if (hasAllRequired) {
      // Count how many trigger words match
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
  
  // First check for explicit commands
  for (const [cmd, action] of Object.entries(commands)) {
    if (normalizedText.includes(cmd)) {
      return action;
    }
  }

  // Then check for workflow intent
  const workflowMatch = matchWorkflow(normalizedText);
  if (workflowMatch && workflowMatch.confidence > 0.5) {
    return 'start';
  }

  return null;
}

async function handleWorkflowCommand(command: string, value?: any, userMessage?: string): Promise<{ response: string; workflow?: WorkflowState }> {
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
        currentWorkflow = await advanceAsync(workflow, currentWorkflow.state, { value });
      }
      return {
        response: currentWorkflow.ui.question || '',
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

chat.post('/chat', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages must be an array' });
  }

  // Get the latest user message
  const userMessage = messages[messages.length - 1];
  if (!userMessage || userMessage.role !== 'user') {
    return res.status(400).json({ error: 'Last message must be from user' });
  }

  try {
    // Check for workflow commands or intent
    const command = isCommand(userMessage.content);
    if (command) {
      const { response, workflow } = await handleWorkflowCommand(command, undefined, userMessage.content);
      return res.json({ 
        ok: true, 
        response,
        workflow,
        context: []
      });
    }

    // If in a workflow, try to handle as workflow input
    if (currentWorkflow?.ui.question) {
      // Get the current question from the workflow definition
      const workflowDef = loadWorkflow(WF_PATH);
      const currentStep = workflowDef.steps.find(s => s.id === currentWorkflow.state.currentStepId);
      const currentQuestion = currentStep?.ask?.find(q => q.label === currentWorkflow.ui.question);
      
      // Normalize the input based on the question type
      const normalizedValue = normalizeInput(userMessage.content, currentQuestion?.type);
      
      // Update the current workflow state with the normalized value
      const { response, workflow: updatedWorkflow } = await handleWorkflowCommand('continue', normalizedValue);
      
      // Update the global workflow state
      if (updatedWorkflow) {
        currentWorkflow = updatedWorkflow;
        
        // Get any guidance for the current step
        const workflowDef = loadWorkflow(WF_PATH);
        const currentStep = workflowDef.steps.find(s => s.id === currentWorkflow.state.currentStepId);
        const guidance = await getGuidanceHelp(currentStep!);
        
        return res.json({
          ok: true,
          response,
          workflow: currentWorkflow,
          context: guidance.citations ? await Promise.all(
            guidance.citations.map(async uri => {
              const docs = await retrieve(uri);
              return docs[0] ? { title: docs[0].title, content: docs[0].content } : null;
            })
          ).then(contexts => contexts.filter(Boolean)) : []
        });
      }
    }

    // Handle as regular chat message
    const results = await retrieve(userMessage.content);
    
    // Format context from retrieved documents
    const context = results.map(r => `
Document: ${r.title}
Content: ${r.content}
---`).join('\n');

    // Add workflow context if available
    let workflowContext = '';
    if (currentWorkflow) {
      workflowContext = `\nCurrent workflow: ${workflow.title}
Step: ${currentWorkflow.ui.title}
Question: ${currentWorkflow.ui.question || 'None'}`;
    }

    // Prepare messages for chat completion
    const chatMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Here is the relevant context for the user's question:\n${context}${workflowContext}` },
      ...messages.slice(0, -1), // Previous conversation
      { 
        role: 'system', 
        content: 'Remember to base your response on the provided context and acknowledge if you don\'t have enough information.' 
      },
      userMessage // Latest user message
    ];

    // Get chat completion
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: chatMessages as any[],
      temperature: 0.7,
      max_tokens: 1000
    });

    const response = completion.choices[0]?.message?.content || 'No response generated.';
    return res.json({ 
      ok: true, 
      response,
      workflow: currentWorkflow,
      context: results.map(r => ({ title: r.title, content: r.content }))
    });
    } catch (error: any) {
      console.error('Chat error:', error);
      return res.status(400).json({ 
        ok: false,
        error: error.message || 'Failed to process chat request',
        workflow: currentWorkflow
      });
    }
});
