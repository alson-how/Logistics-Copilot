import { useState, useRef, useEffect, FormEvent, CSSProperties } from 'react';

const API = (import.meta as any).env.VITE_API_BASE || 'http://localhost:8080';
console.log('API URL:', API, 'VITE_API_BASE:', (import.meta as any).env.VITE_API_BASE);

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Array<{ title: string; content: string; url?: string }>;
}

interface WorkflowUI {
  label: string;
  step_id: string;
  title: string;
  question?: string;
  help?: string;
  choices?: string[];
}

interface WorkflowSummary {
  completed: boolean;
  message: string;
  steps: Array<{
    id: string;
    title: string;
    status: 'completed' | 'blocked' | 'pending';
    questions: Array<{
      label: string;
      answer?: string;
    }>;
  }>;
}

interface WorkflowState {
  state: {
    currentStepId: string;
    answers: Record<string, any>;
    computed: Record<string, any>;
    history: Array<{
      step: string;
      answers: Record<string, any>;
      computed: Record<string, any>;
    }>;
  };
  ui: WorkflowUI;
  next_action: string;
  citations?: string[];
  summary?: WorkflowSummary;
}

interface ChatResponse {
  ok: boolean;
  response: string;
  context?: Array<{ title: string; content: string; url?: string }>;
  workflow?: WorkflowState;
  error?: string;
  isWebSearch?: boolean;
}

interface WorkflowQuestion {
  id: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
  required_if?: string;
  validate?: string;
}

function formatWorkflowSummary(summary: WorkflowSummary): string {
  let text = `${summary.completed ? '✅ Workflow Complete' : '❌ Workflow Blocked'}\n\n`;
  text += `${summary.message}\n\n`;
  text += 'Workflow Progress:\n';
  
  for (const step of summary.steps) {
    const icon = step.status === 'completed' ? '✓' : step.status === 'blocked' ? '×' : '○';
    text += `\n${icon} ${step.title}`;
    
    // Show all questions for this step
    for (const q of step.questions) {
      text += `\n   Question: ${q.label}`;
      if (q.answer !== undefined) {
        text += `\n   Answer: ${q.answer}`;
      }
    }
  }

  return text;
}

function formatOptionLabel(value: string): string {
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .replace(/Ion/g, 'Ion')  // Keep "Ion" capitalization
    .replace(/In /g, 'in ')  // Make "in" lowercase
    .replace(/With /g, 'with '); // Make "with" lowercase
}

function WorkflowInput({ question, onSubmit, loading }: { 
  question: WorkflowQuestion; 
  onSubmit: (value: string) => void;
  loading?: boolean;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value) {
      // For integer type, ensure we send a valid number
      if (question.type === 'integer') {
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
          onSubmit(num.toString());
          setValue('');
        }
      } else {
        onSubmit(value);
        setValue('');
      }
    }
  };

  const renderInput = () => {
    switch (question.type) {
      case 'single_select':
        return (
          <div className="flex-col gap-4">
            {question.options?.map((option, i) => (
              <label key={i} className="radio-option">
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={value === option}
                  onChange={e => setValue(e.target.value)}
                  disabled={loading}
                />
                <span className="radio-label">{formatOptionLabel(option)}</span>
              </label>
            ))}
          </div>
        );
      
      case 'multi_select':
        return (
          <select 
            value={value} 
            onChange={e => setValue(e.target.value)}
            disabled={loading}
            className="input-field"
          >
            <option value="">Select an option...</option>
            {question.options?.map((option, i) => (
              <option key={i} value={option}>{formatOptionLabel(option)}</option>
            ))}
          </select>
        );
        
      case 'integer':
        return (
          <div>
            <div className="mb-4">Please enter a number:</div>
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              disabled={loading}
              className="input-field"
              min="0"
              placeholder="Enter a number"
            />
          </div>
        );
      
      case 'long_text':
        return (
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={loading}
            style={{ 
              padding: 8, 
              borderRadius: 4, 
              border: '1px solid #ccc',
              width: '100%',
              minHeight: 100,
              resize: 'vertical'
            }}
          />
        );
      
      case 'boolean':
        return (
          <div style={{ display: 'flex', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name={question.id}
                value="yes"
                checked={value === 'yes'}
                onChange={e => setValue(e.target.value)}
              />
              Yes
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name={question.id}
                value="no"
                checked={value === 'no'}
                onChange={e => setValue(e.target.value)}
              />
              No
            </label>
          </div>
        );
      


      default:
        return (
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={loading}
            style={{ 
              padding: 8, 
              borderRadius: 4, 
              border: '1px solid #ccc',
              width: '100%'
            }}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex-col gap-4">
      {question.label && <h2 className="card-title">{question.label}</h2>}
      {renderInput()}
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => onSubmit('exit')}
          className="exit-button"
        >
          Exit
        </button>
        <button
          type="submit"
          className={`primary-button ${loading ? 'disabled' : ''}`}
          disabled={loading}
        >
          Submit
        </button>
      </div>
    </form>
  );
}

// Media query breakpoints
const MOBILE_BREAKPOINT = 768;

// Style helpers
const getResponsiveStyle = (base: CSSProperties, mobile: CSSProperties): CSSProperties => {
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    return { ...base, ...mobile };
  }
  return base;
};

const getHoverStyle = (element: HTMLElement, hoverStyles: CSSProperties) => {
  const originalStyles = { ...element.style };
  element.addEventListener('mouseenter', () => {
    Object.assign(element.style, hoverStyles);
  });
  element.addEventListener('mouseleave', () => {
    Object.assign(element.style, originalStyles);
  });
};

// Define theme colors
const theme = {
  primary: '#75B3E3',
  primaryDark: '#5A8CB3',
  primaryLight: '#9CCBF0',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#1F2937',
  textLight: '#6B7280',
  border: '#E5E7EB',
  success: '#10B981',
  error: '#EF4444'
};

// Custom styles for scrollbar
const scrollbarStyles = `
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: ${theme.background};
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb {
    background: ${theme.primary}40;
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: ${theme.primary}80;
  }
`;

// Add styles to head
const style = document.createElement('style');
style.textContent = `
  ${scrollbarStyles}

  .agent-card {
    transition: transform 0.2s, box-shadow 0.2s;
    margin-bottom: 20px;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid ${theme.border};
    background: ${theme.surface};
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }
  .agent-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .action-button {
    padding: 8px 16px;
    border-radius: 20px;
    border: 1px solid ${theme.primary}30;
    background: ${theme.surface};
    color: ${theme.primary};
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    transition: all 0.2s;
  }
  .action-button:hover {
    background: ${theme.primary}10;
    transform: translateY(-1px);
  }

  .link {
    color: ${theme.primary};
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .link:hover {
    text-decoration: underline;
  }

  .input {
    width: 100%;
    padding: 12px 0;
    font-size: 1rem;
    border-radius: 24px;
    border: 1px solid ${theme.border};
    background: ${theme.surface};
    color: ${theme.text};
    transition: all 0.2s;
  }
  input::placeholder {
    padding-left: 10px; /* Adjust the value as needed */
  }
  
  .input:focus {
    outline: none;
    border-color: ${theme.primary};
    box-shadow: 0 0 0 3px ${theme.primary}20;
  }
  .input:disabled {
    background: ${theme.primary}05;
  }

  .message {
    margin: 8px 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 100%;
  }
  .message.user {
    align-items: flex-end;
  }

  .sidebar {
    width: 320px;
    background: ${theme.surface};
    border-left: 1px solid ${theme.border};
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    position: relative;
    transition: transform 0.3s;
  }

  .card {
    background: ${theme.surface};
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    border: 1px solid ${theme.border};
  }

  .card-title {
    margin: 0 0 16px 0;
    color: ${theme.text};
    font-size: 1.1rem;
  }

  .card-content {
    color: ${theme.text};
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .card-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .text-light {
    color: ${theme.textLight};
  }

  .text-primary {
    color: ${theme.primary};
  }

  .flex-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .flex-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .flex-wrap {
    flex-wrap: wrap;
  }

  .justify-between {
    justify-content: space-between;
  }

  .justify-center {
    justify-content: center;
  }

  .mt-4 {
    margin-top: 16px;
  }

  .mb-4 {
    margin-bottom: 16px;
  }

  .text-sm {
    font-size: 0.9em;
  }

  .submit-button {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    padding: 8px;
    background: none;
    border: none;
    cursor: pointer;
    color: ${theme.primary};
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .submit-button:hover {
    background: ${theme.primary}10;
  }

  .submit-button.disabled {
    cursor: not-allowed;
    color: ${theme.textLight};
  }

  .submit-button.disabled:hover {
    background: none;
  }

  .exit-button {
    padding: 12px 20px;
    font-size: 0.95rem;
    border-radius: 20px;
    border: 1px solid ${theme.error}30;
    background: ${theme.surface};
    color: ${theme.error};
    cursor: pointer;
    transition: all 0.2s;
  }

  .exit-button:hover {
    background: ${theme.error}10;
  }

  .primary-button {
    padding: 12px 20px;
    font-size: 0.95rem;
    border-radius: 20px;
    border: none;
    background: ${theme.primary};
    color: ${theme.surface};
    cursor: pointer;
    transition: all 0.2s;
  }

  .primary-button:hover {
    background: ${theme.primaryDark};
  }

  .primary-button.disabled {
    background: ${theme.primary}40;
    cursor: not-allowed;
  }

  .primary-button.disabled:hover {
    background: ${theme.primary}40;
  }

  .flex-container {
    display: flex;
    gap: 16px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .flex {
    display: flex;
  }

  .flex-col {
    display: flex;
    flex-direction: column;
  }

  .gap-2 {
    gap: 8px;
  }

  .gap-4 {
    gap: 16px;
  }

  .items-center {
    align-items: center;
  }

  .text-sm {
    font-size: 0.9em;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid ${theme.border};
    background: ${theme.surface};
    cursor: pointer;
    transition: all 0.2s;
  }

  .radio-option:hover {
    border-color: ${theme.primary};
    background: ${theme.primary}05;
  }

  .radio-option input[type="radio"] {
    width: 20px;
    height: 20px;
    margin: 0;
    cursor: pointer;
    accent-color: ${theme.primary};
  }

  .radio-option input[type="radio"]:checked + .radio-label {
    color: ${theme.primary};
    font-weight: 500;
  }

  .radio-option input[type="radio"]:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .radio-option input[type="radio"]:disabled + .radio-label {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .radio-label {
    font-size: 1rem;
    color: ${theme.text};
    cursor: pointer;
  }

  .text-base {
    font-size: 1rem;
  }

  .text-lg {
    font-size: 1.1em;
  }

  .mb-2 {
    margin-bottom: 8px;
  }

  .mb-4 {
    margin-bottom: 16px;
  }

  .mt-4 {
    margin-top: 16px;
  }

  .w-full {
    width: 100%;
  }

  .text-left {
    text-align: left;
  }

  .text-center {
    text-align: center;
  }

  .p-6 {
    padding: 24px;
  }

  .starter-question {
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    padding: 16px 24px;
    border-radius: 12px;
    border: 1px solid ${theme.border};
    background: ${theme.surface};
    color: ${theme.text};
    font-size: 1rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .starter-question:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    border-color: ${theme.primary}30;
    background: ${theme.primary}05;
  }

  .opacity-60 {
    opacity: 0.6;
  }

  .input-field {
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #ccc;
    width: 100%;
  }

  .link-container {
    display: flex;
    align-items: center;
    gap: 4px;
    color: ${theme.primary};
    text-decoration: none;
  }

  .link-container:hover {
    text-decoration: underline;
  }

  .app-container {
    max-width: 100vw;
    height: 100vh;
    margin: 0;
    padding: 0;
    font-family: system-ui, sans-serif;
    background: ${theme.background};
    display: flex;
    flex-direction: column;
  }

  .header {
    background: ${theme.surface};
    border-bottom: 1px solid ${theme.border};
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  }

  .header-title {
    margin: 0;
    font-size: 1.5rem;
    color: ${theme.text};
    background: linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark});
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .menu-button {
    display: none;
    padding: 8px;
    background: none;
    border: none;
    cursor: pointer;
    color: ${theme.primary};
  }

  .workflow-steps {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 16px 0;
  }

  .workflow-step {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    position: relative;
  }

  .workflow-step::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 24px;
    bottom: -24px;
    width: 2px;
    background: ${theme.border};
    z-index: 0;
  }

  .workflow-step:last-child::before {
    display: none;
  }

  .step-indicator {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 14px;
    background: ${theme.textLight};
    color: ${theme.surface};
    z-index: 1;
  }

  .workflow-step.completed .step-indicator {
    background: ${theme.success};
  }

  .workflow-step.current .step-indicator {
    background: ${theme.textLight};
  }

  .workflow-step.pending .step-indicator {
    background: ${theme.textLight}40;
  }

  .step-content {
    flex: 1;
    padding-top: -4px;
  }

  .step-title {
    font-weight: 500;
    color: ${theme.text};
    margin-bottom: 2px;
  }

  .step-detail {
    color: ${theme.textLight};
    font-size: 0.9rem;
    margin-bottom: 4px;
  }

  .step-answer {
    font-size: 0.9rem;
    color: ${theme.text};
  }

  .guidance-section {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid ${theme.border};
  }

  .guidance-content {
    margin-top: 8px;
    font-size: 0.9rem;
    color: ${theme.textLight};
    line-height: 1.5;
  }

  @media (max-width: ${MOBILE_BREAKPOINT}px) {
    .menu-button {
      display: block;
    }
    .sidebar {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      transform: translateX(100%);
      z-index: 20;
      width: 85%;
      max-width: 320px;
    }
    .sidebar.open {
      transform: translateX(0);
    }
    .message {
      max-width: 90%;
    }
    .agent-card {
      margin-bottom: 16px;
      padding: 12px;
    }
    .card {
      padding: 16px;
    }
    .flex-container {
      flex-direction: column;
    }
  }
`;
document.head.appendChild(style);

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<Array<{ title: string; content: string; url?: string }>>([]);
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Refs for interactive elements
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentCardRefs = useRef<HTMLDivElement[]>([]);
  const buttonRefs = useRef<HTMLButtonElement[]>([]);

  // Apply hover effects
  useEffect(() => {
    agentCardRefs.current.forEach(card => {
      if (card) {
        getHoverStyle(card, {
          transform: 'translateY(-2px)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        });
      }
    });

    buttonRefs.current.forEach(button => {
      if (button) {
        getHoverStyle(button, {
          backgroundColor: `${theme.primary}20`
        });
      }
    });
  }, [messages]);

  async function exitWorkflow() {
    // Mark current step as blocked before clearing workflow
    if (workflow) {
      const currentStep = {
        ...workflow,
        state: {
          ...workflow.state,
          status: 'blocked'
        }
      };
      setWorkflow(currentStep);
      
      // Clear workflow after a short delay to show the blocked state
      setTimeout(() => {
        setWorkflow(null);
        setMessages(msgs => [...msgs, { 
          role: 'assistant', 
          content: 'Our conversation has been cut off early unfortunately. Let me know what I can help you next?' 
        }]);
      }, 500);
    }
  }

  async function sendMessage(workflowValue?: string) {
    const messageContent = workflowValue || input.trim();
    if (!messageContent) return;
    
    // For workflow inputs, show the actual value in the message
    const displayContent = workflow?.ui.question?.includes('Quantity') ? 
      `${messageContent}` : messageContent;
    
    const userMsg: Message = { role: 'user', content: displayContent };
    setMessages(msgs => [...msgs, userMsg]);
    setLoading(true);
    setInput('');

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: messages.concat(userMsg),
          workflowValue: workflow?.ui.question ? messageContent : undefined
        })
      });
      const data: ChatResponse = await res.json();
      
      if (data.ok) {
        // Update context if available
        if (data.context) {
          setContext(data.context);
        }

        // Update workflow state if available
        setWorkflow(data.workflow || null);
        
        // Add the response message with citations only for web search
        if (data.response) {
          setMessages(msgs => [...msgs, { 
            role: 'assistant', 
            content: data.response,
            citations: data.isWebSearch ? data.context : undefined
          }]);
        }
        
        // Add the workflow summary if available
        const summary = data.workflow?.summary;
        if (summary) {
          setMessages(msgs => [...msgs, { 
            role: 'assistant', 
            content: formatWorkflowSummary(summary)
          }]);
        }
      } else {
        setMessages(msgs => [...msgs, { 
          role: 'assistant', 
          content: data.error || 'Error: Could not get response.' 
        }]);
      }
    } catch (e) {
      console.error('Failed to send message:', e);
      setMessages(msgs => [...msgs, { 
        role: 'assistant', 
        content: 'Error: Could not get response.' 
      }]);
    } finally {
      setLoading(false);
    }
  }

  function renderMessage(msg: Message, index: number) {
    const isUser = msg.role === 'user';
    // Only show message if it's not a workflow or if it's the first message of a workflow
    if (!workflow || (workflow && index === 0) || msg.role === 'user') {
      return (
      <div 
        key={index}
        className={`message ${isUser ? 'user' : ''}`}>
        <div style={{ 
          position: 'relative',
          display: 'inline-block', 
          padding: '12px 16px', 
          borderRadius: '16px',
          background: isUser ? `${theme.primary}20` : theme.surface,
          color: theme.text,
          maxWidth: '85%',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          border: `1px solid ${isUser ? `${theme.primary}30` : theme.border}`,
          ...getResponsiveStyle({}, {
            maxWidth: '90%'
          })
        }}>
          {/* Message content */}
          <div style={{ 
            whiteSpace: 'pre-wrap',
            fontSize: '0.95rem',
            lineHeight: 1.5
          }}>
            {(() => {
              try {
                const parsed = JSON.parse(msg.content);
                if (parsed.structured?.type === 'shipping_agents') {
  return (
                    <div style={{ textAlign: 'left' }}>
                      <h3 style={{
                        margin: '0 0 16px 0',
                        color: theme.text,
                        fontSize: '1.2rem'
                      }}>{parsed.structured.title}</h3>
                      {parsed.structured.agents.map((agent: any, i: number) => (
                                                <div 
                          key={i}
                          className="agent-card">
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12,
                            flexWrap: 'wrap',
                            gap: 8
                          }}>
                            <h4 style={{ 
                              margin: 0,
                              fontSize: '1.1rem',
                              color: theme.text
                            }}>
                              {agent.website ? (
                                <a href={agent.website} 
                                   target="_blank" 
                                   rel="noopener noreferrer" 
                                   className="link">
                                  {agent.name}
                                  <span style={{ fontSize: '0.9em' }}>↗</span>
                                </a>
                              ) : agent.name}
                            </h4>
                            <div style={{ 
                              display: 'flex', 
                              gap: 8,
                              flexWrap: 'wrap'
                            }}>
                              {agent.actions.map((action: any, j: number) => (
                                <a
                                  key={j}
                                  href={action.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={action.action ? (e) => {
                                    e.preventDefault();
                                    if (action.action === 'request_quote') {
                                      setInput(`Request quote from ${agent.name} for ${parsed.structured.title.split(' for ')[1]}`);
                                    }
                                  } : undefined}
                                  className="action-button">
                                  {action.icon} {action.label}
                                </a>
                              ))}
                            </div>
                          </div>
                          <div style={{ 
                            color: theme.textLight,
                            marginBottom: 12,
                            fontSize: '0.95rem'
                          }}>
                            <strong>Specialization:</strong> {agent.specialization}
                          </div>
                          <div style={{
                            display: 'flex',
                            gap: 16,
                            flexWrap: 'wrap'
                          }}>
                            {agent.contact.email && (
                              <a href={`mailto:${agent.contact.email}`} 
                                 style={{ 
                                   color: theme.primary,
                                   textDecoration: 'none',
                                   display: 'flex',
                                   alignItems: 'center',
                                   gap: 4,
                                   fontSize: '0.9rem'
                                 }}>
                                ✉️ {agent.contact.email}
                              </a>
                            )}
                            {agent.contact.phone && (
                              <a href={`tel:${agent.contact.phone.replace(/\s+/g, '')}`}
                                 style={{ 
                                   color: theme.primary,
                                   textDecoration: 'none',
                                   display: 'flex',
                                   alignItems: 'center',
                                   gap: 4,
                                   fontSize: '0.9rem'
                                 }}>
                                📞 {agent.contact.phone}
                              </a>
                            )}
            </div>
          </div>
        ))}
                      <div style={{ 
                        display: 'flex', 
                        gap: 12, 
                        marginTop: 16,
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                      }}>
                        {parsed.structured.quickActions.map((action: any, i: number) => (
                          <button
                            key={i}
                            className="action-button"
                            onClick={() => {
                              if (action.action === 'contact_all') {
                                const emails = parsed.structured.agents
                                  .map((a: any) => a.contact.email)
                                  .filter(Boolean)
                                  .join(',');
                                window.location.href = `mailto:${emails}`;
                              }
                            }}
                          >
                            {action.icon} {action.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ 
                        marginTop: 16, 
                        color: theme.textLight,
                        fontSize: '0.9em',
                        textAlign: 'center',
                        fontStyle: 'italic'
                      }}>
                        {parsed.structured.recommendation}
                      </div>
                    </div>
                  );
                }
                return parsed.fallback;
              } catch {
                return msg.content;
              }
            })()}
          </div>

          {/* Citations */}
          {!isUser && msg.citations && msg.citations.length > 0 && msg.citations.some(c => c.url) && (
            <div style={{ 
              marginTop: 12,
              paddingTop: 12,
              borderTop: `1px solid ${theme.border}`,
              fontSize: '0.85rem'
            }}>
              <div style={{ 
                fontWeight: 500,
                marginBottom: 8,
                color: theme.textLight
              }}>Sources:</div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                {msg.citations.map((citation, i) => (
                  <div key={i}>
                    {citation.url ? (
                      <a 
                        href={citation.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="link-container"
                      >
                        {citation.title}
                        <span style={{ fontSize: '0.9em' }}>↗</span>
                      </a>
                    ) : (
                      <span style={{ color: theme.textLight }}>{citation.title}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
    }
    // Return null for other messages during workflow
    return null;
  }

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <h1 className="header-title">
          Checklist Copilot AI
        </h1>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="menu-button"
        >
          {isSidebarOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-container">
        {/* Chat Area */}
        <div className="flex-col w-full">
          {/* Messages Container */}
          <div className="flex-col gap-4 p-6">
            {messages.length === 0 && (
              <div className="flex-col gap-4 mt-4">
                <div className="opacity-60 text-center text-light text-lg mb-8">
                  Click one of these questions to get started:
                </div>
                <div className="flex-col gap-3">
                  <button
                    className="starter-question"
                    onClick={() => sendMessage("I want to export battery from Malaysia to Hong Kong")}
                  >
                    🔋 How do I export batteries from Malaysia to Hong Kong?
                  </button>
                  <button
                    className="starter-question"
                    onClick={() => sendMessage("Do I need to declare strategic goods when leaving Malaysia? What form should I use?")}
                  >
                    📋 Do I need to declare strategic goods when leaving Malaysia? What form should I use?
                  </button>
                  <button
                    className="starter-question"
                    onClick={() => sendMessage("What happens if I export strategic goods without a permit in Malaysia?")}
                  >
                    ⚠️ What happens if I export strategic goods without a permit in Malaysia?
                  </button>
                </div>
              </div>
            )}
            {messages.map((msg, i) => renderMessage(msg, i))}
            {loading && (
              <div style={{ 
                margin: '12px 0',
                color: theme.textLight,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: theme.primary,
                  animation: 'pulse 1s infinite'
                }} />
                Thinking…
              </div>
            )}
            <div ref={messagesEndRef} />
            
            {/* Workflow Input Controls */}
            {workflow?.ui.question && (
              <div className="card">
                <WorkflowInput
                  question={{
                    id: 'current_question',
                    label: workflow.ui.question || '',  // Use the question as the label
                    type: workflow.ui.choices ? 'single_select' : workflow.ui.question?.includes('Quantity') ? 'integer' : 'text',
                    options: workflow.ui.choices,
                    required: true
                  }}
                  loading={loading}
                  onSubmit={value => value === 'exit' ? exitWorkflow() : sendMessage(value)}
                />
              </div>
            )}
          </div>

          {/* Chat Input Area */}
          <div style={{
            position: 'sticky',
            bottom: 0,
            background: theme.surface,
            borderTop: `1px solid ${theme.border}`,
            padding: '16px 24px',
            zIndex: 10
          }}>
            <form 
              style={{ 
                display: 'flex', 
                gap: 12,
                maxWidth: 1200,
                margin: '0 auto'
              }} 
              onSubmit={e => { e.preventDefault(); sendMessage(); }}
            >
              <div style={{
                flex: 1,
                position: 'relative'
              }}>
        <input
                  className="input"
          value={input}
          onChange={e => setInput(e.target.value)}
                  placeholder={workflow?.ui.question ? "Workflow in progress..." : "Type your question…"}
                  disabled={loading || !!workflow?.ui.question}
                />
                {!workflow?.ui.question && (
                                                  <button
                                  type="submit"
                                  className={`submit-button ${loading || !input.trim() ? 'disabled' : ''}`}
                    disabled={loading || !input.trim()}
                  >
                    ↗
                  </button>
                )}
              </div>
              {workflow?.ui.question && (
                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button
                                    type="button"
                                    onClick={exitWorkflow}
                                    className="exit-button"
                  >
                    Exit
                  </button>
                  <button
                    type="submit"
                    className={`primary-button ${loading ? 'disabled' : ''}`}
          disabled={loading}
                  >
                    Submit
        </button>
                </div>
              )}
      </form>
          </div>
        </div>

        {/* Sidebar */}
        <div 
          className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
          {/* Workflow Status */}
          {workflow && (
            <div className="card">
              <h3 className="card-title">Current Workflow</h3>
              <div className="workflow-steps">
                {/* Basics */}
                <div className={`workflow-step ${workflow.state.answers.transport_mode ? 'completed' : workflow.state.currentStepId === 'routing_basics' ? 'current' : 'pending'}`}>
                  <div className="step-indicator">{workflow.state.answers.transport_mode ? '●' : '○'}</div>
                  <div className="step-content">
                    <div className="step-title">Basics</div>
                    <div className="step-detail">Transport Mode</div>
                    {workflow.state.answers.transport_mode && (
                      <div className="step-answer">{workflow.state.answers.transport_mode}</div>
                    )}
                  </div>
                </div>

                <div className={`workflow-step ${workflow.state.answers.battery_configuration ? 'completed' : workflow.state.currentStepId === 'routing_basics' ? 'current' : 'pending'}`}>
                  <div className="step-indicator">{workflow.state.answers.battery_configuration ? '●' : '○'}</div>
                  <div className="step-content">
                    <div className="step-title">Basics</div>
                    <div className="step-detail">Battery configuration</div>
                    {workflow.state.answers.battery_configuration && (
                      <div className="step-answer">{formatOptionLabel(workflow.state.answers.battery_configuration)}</div>
                    )}
                  </div>
                </div>

                <div className={`workflow-step ${workflow.state.answers.wh_or_li_content ? 'completed' : workflow.state.currentStepId === 'routing_basics' ? 'current' : 'pending'}`}>
                  <div className="step-indicator">{workflow.state.answers.wh_or_li_content ? '●' : '○'}</div>
                  <div className="step-content">
                    <div className="step-title">Basics</div>
                    <div className="step-detail">Battery Type</div>
                    {workflow.state.answers.wh_or_li_content && (
                      <div className="step-answer">{workflow.state.answers.wh_or_li_content}</div>
                    )}
                  </div>
                </div>

                <div className={`workflow-step ${workflow.state.answers.qty_per_pkg ? 'completed' : workflow.state.currentStepId === 'routing_basics' ? 'current' : 'pending'}`}>
                  <div className="step-indicator">{workflow.state.answers.qty_per_pkg ? '●' : '○'}</div>
                  <div className="step-content">
                    <div className="step-title">Basics</div>
                    <div className="step-detail">Quantity per package</div>
                    {workflow.state.answers.qty_per_pkg && (
                      <div className="step-answer">{workflow.state.answers.qty_per_pkg}</div>
                    )}
                  </div>
                </div>

                {/* Export Controls */}
                <div className={`workflow-step ${workflow.state.answers.exporter_has_permit ? 'completed' : workflow.state.currentStepId === 'export_controls_screening' ? 'current' : 'pending'}`}>
                  <div className="step-indicator">{workflow.state.answers.exporter_has_permit ? '●' : '○'}</div>
                  <div className="step-content">
                    <div className="step-title">Export Controls</div>
                    <div className="step-detail">Export/Strategic Permit</div>
                    {workflow.state.answers.exporter_has_permit && (
                      <div className="step-answer">{workflow.state.answers.exporter_has_permit}</div>
                    )}
                  </div>
                </div>

                {/* DG Classification */}
                <div className={`workflow-step ${workflow.state.answers.un_number ? 'completed' : workflow.state.currentStepId === 'air_dg_classification' ? 'current' : 'pending'}`}>
                  <div className="step-indicator">{workflow.state.answers.un_number ? '●' : '○'}</div>
                  <div className="step-content">
                    <div className="step-title">DG Classification</div>
                    <div className="step-detail">UN Number & Packing</div>
                    {workflow.state.answers.un_number && (
                      <div className="step-answer">{workflow.state.answers.un_number}</div>
                    )}
                  </div>
                </div>

                {/* Marks & Labels */}
                <div className={`workflow-step ${workflow.state.answers.has_msds ? 'completed' : workflow.state.currentStepId === 'air_marks_labels_docs' ? 'current' : 'pending'}`}>
                  <div className="step-indicator">{workflow.state.answers.has_msds ? '●' : '○'}</div>
                  <div className="step-content">
                    <div className="step-title">Marks & Labels</div>
                    <div className="step-detail">Documentation</div>
                    {workflow.state.answers.has_msds && (
                      <div className="step-answer">MSDS Ready</div>
                    )}
                  </div>
                </div>

                {/* HK Requirements */}
                <div className={`workflow-step ${workflow.state.answers.hk_consignee_br ? 'completed' : workflow.state.currentStepId === 'hk_import_requirements' ? 'current' : 'pending'}`}>
                  <div className="step-indicator">{workflow.state.answers.hk_consignee_br ? '●' : '○'}</div>
                  <div className="step-content">
                    <div className="step-title">HK Requirements</div>
                    <div className="step-detail">Import Requirements</div>
                    {workflow.state.answers.hk_consignee_br && (
                      <div className="step-answer">BR/CR: {workflow.state.answers.hk_consignee_br}</div>
                    )}
                  </div>
                </div>

                {/* Booking */}
                <div className={`workflow-step ${workflow.state.answers.carrier ? 'completed' : workflow.state.currentStepId === 'booking_and_handlers' ? 'current' : 'pending'}`}>
                  <div className="step-indicator">{workflow.state.answers.carrier ? '●' : '○'}</div>
                  <div className="step-content">
                    <div className="step-title">Booking</div>
                    <div className="step-detail">Carrier & Acceptance</div>
                    {workflow.state.answers.carrier && (
                      <div className="step-answer">{workflow.state.answers.carrier}</div>
                    )}
                  </div>
                </div>

                {/* Commercial Docs */}
                <div className={`workflow-step ${workflow.state.answers.hs_code ? 'completed' : workflow.state.currentStepId === 'packlist_and_invoice' ? 'current' : 'pending'}`}>
                  <div className="step-indicator">{workflow.state.answers.hs_code ? '●' : '○'}</div>
                  <div className="step-content">
                    <div className="step-title">Commercial Docs</div>
                    <div className="step-detail">Invoice & Packing List</div>
                    {workflow.state.answers.hs_code && (
                      <div className="step-answer">HS: {workflow.state.answers.hs_code}</div>
                    )}
                  </div>
                </div>

                {workflow.ui.help && (
                  <div className="guidance-section">
                    <div className="text-primary">Guidance:</div>
                    <div className="guidance-content">{workflow.ui.help}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reference Documents */}
          {context.length > 0 && context.some(doc => doc.url) && (
            <div className="card">
              <h3 className="card-title">Reference Documents</h3>
              <div className="card-list">
                {context.map((doc, i) => (
                  <div key={i} className="flex-col">
                    <div className="mb-4">
                      {doc.url ? (
                        <a 
                          href={doc.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="link"
                        >
                          {doc.title}
                          <span className="text-sm">↗</span>
                        </a>
                      ) : (
                        <span className="text-primary">{doc.title}</span>
                      )}
                    </div>
                    <div className="text-light card-content">
                      {doc.content.substring(0, 200)}...
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}