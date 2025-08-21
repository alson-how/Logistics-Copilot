import { useState, FormEvent } from 'react';

const API = (import.meta as any).env.VITE_API_BASE || 'http://localhost:8080';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface WorkflowUI {
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
  context: Array<{ title: string; content: string }>;
  workflow?: WorkflowState;
  error?: string;
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
    .join(' ');
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
      onSubmit(value);
      setValue('');
    }
  };

  const renderInput = () => {
    switch (question.type) {
      case 'single_select':
        return (
          <>
            <div style={{ marginBottom: 16, fontSize: '1.1em' }}>{question.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {question.options?.map((option, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="radio"
                    name={question.id}
                    value={option}
                    checked={value === option}
                    onChange={e => setValue(e.target.value)}
                    disabled={loading}
                  />
                  {formatOptionLabel(option)}
                </label>
              ))}
            </div>
          </>
        );
      
      case 'multi_select':
        return (
          <select 
            value={value} 
            onChange={e => setValue(e.target.value)}
            disabled={loading}
            style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%' }}
          >
            <option value="">Select an option...</option>
            {question.options?.map((option, i) => (
              <option key={i} value={option}>{formatOptionLabel(option)}</option>
            ))}
          </select>
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
      
      case 'integer':
        return (
          <input
            type="number"
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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {renderInput()}
    </form>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<Array<{ title: string; content: string }>>([]);
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);

  async function exitWorkflow() {
    setWorkflow(null);
    setMessages(msgs => [...msgs, { 
      role: 'assistant', 
      content: 'Our conversation has been cut off early unfortunately. Let me know what I can help you next?' 
    }]);
  }

  async function sendMessage(workflowValue?: string) {
    const messageContent = workflowValue || input.trim();
    if (!messageContent) return;
    
    const userMsg: Message = { role: 'user', content: messageContent };
    setMessages(msgs => [...msgs, userMsg]);
    setLoading(true);
    setInput('');


    
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.concat(userMsg) })
      });
      const data: ChatResponse = await res.json();
      
      if (data.ok) {
        setContext(data.context);
        setWorkflow(data.workflow || null);
        
        // Add the response message
        if (data.response) {
          setMessages(msgs => [...msgs, { role: 'assistant', content: data.response }]);
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
      setMessages(msgs => [...msgs, { 
        role: 'assistant', 
        content: 'Error: Could not get response.' 
      }]);
    }
    setLoading(false);
  }
  return (
    <div style={{ maxWidth: 1200, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Checklist Copilot AI Chat</h1>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Chat Messages */}
          <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 16, minHeight: 300, background: '#fafbfc', marginBottom: 16, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {messages.length === 0 && <div style={{ opacity: 0.6 }}>Type "help" to see available commands, or ask a question about batteries, export, or regulations…</div>}
              {messages.map((msg, i) => (
                <div key={i} style={{ margin: '12px 0', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                  <div style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 8, background: msg.role === 'user' ? '#dbeafe' : '#e5e7eb', color: '#222', maxWidth: '80%', whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && <div style={{ margin: '12px 0', color: '#888' }}>Thinking…</div>}
            </div>
            
            {/* Workflow Input Controls */}
            {workflow?.ui.question && (
              <div style={{ 
                marginTop: 16, 
                padding: 16, 
                background: 'white', 
                borderRadius: 8, 
                border: '1px solid #e5e7eb'
              }}>

                <WorkflowInput
                  question={{
                    id: 'current_question',
                    label: workflow.ui.question,
                    type: workflow.ui.choices ? 'single_select' : 'text',
                    options: workflow.ui.choices
                  }}
                  loading={loading}
                  onSubmit={value => sendMessage(value)}
                />
                <form onSubmit={e => {
                  e.preventDefault();
                  if (workflow.ui.choices) {
                    const input = document.querySelector('input[name="current_question"]:checked') as HTMLInputElement;
                    if (input) sendMessage(input.value);
                  } else {
                    const input = document.querySelector('input[type="number"], input[type="text"]') as HTMLInputElement;
                    if (input?.value) sendMessage(input.value);
                  }
                }}>
                  <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={exitWorkflow}
                      style={{ 
                        padding: '8px 16px', 
                        fontSize: 14,
                        borderRadius: 6,
                        border: 'none',
                        background: '#DC2626',
                        color: 'white',
                        cursor: 'pointer'
                      }}
                    >
                      Exit
                    </button>
                    <button
                      type="submit"
                      style={{ 
                        padding: '8px 16px', 
                        fontSize: 14,
                        borderRadius: 6,
                        border: 'none',
                        background: loading ? '#ccc' : '#0284c7',
                        color: 'white',
                        cursor: loading ? 'not-allowed' : 'pointer'
                      }}
                      disabled={loading}
                    >
                      Submit
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Chat Input Area */}
          <form style={{ display: 'flex', gap: 8 }} onSubmit={e => { e.preventDefault(); sendMessage(); }}>
            <input
              style={{ 
                flex: 1, 
                padding: 10, 
                fontSize: 16, 
                borderRadius: 6, 
                border: '1px solid #ccc',
                background: workflow?.ui.question ? '#f3f4f6' : 'white'
              }}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={workflow?.ui.question ? "Workflow in progress..." : "Type your question…"}
              disabled={loading || !!workflow?.ui.question}
            />
            {workflow?.ui.question ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={exitWorkflow}
                  style={{ 
                    padding: '0 18px', 
                    fontSize: 16,
                    borderRadius: 6,
                    border: 'none',
                    background: '#DC2626',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Exit
                </button>
                <button
                  type="submit"
                  style={{ 
                    padding: '0 18px', 
                    fontSize: 16,
                    borderRadius: 6,
                    border: 'none',
                    background: loading ? '#ccc' : '#0284c7',
                    color: 'white',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                  disabled={loading}
                >
                  Submit
                </button>
              </div>
            ) : (
              <button 
                type="submit" 
                style={{ 
                  padding: '0 18px', 
                  fontSize: 16,
                  borderRadius: 6,
                  border: 'none',
                  background: loading || !input.trim() ? '#ccc' : '#0284c7',
                  color: 'white',
                  cursor: loading || !input.trim() ? 'not-allowed' : 'pointer'
                }} 
                disabled={loading || !input.trim()}
              >
                Send
              </button>
            )}
          </form>
        </div>

        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Workflow Status */}
          {workflow && (
            <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, background: '#fff' }}>
              <h3 style={{ margin: '0 0 12px 0' }}>Current Workflow</h3>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 500, color: '#666' }}>Step</div>
                <div>{workflow.ui.title}</div>
              </div>
              {workflow.ui.help && (
                <div style={{ marginTop: 12, padding: 8, background: '#f3f4f6', borderRadius: 4, fontSize: '0.9em' }}>
                  <div style={{ fontWeight: 500, color: '#666', marginBottom: 4 }}>Guidance:</div>
                  <div>{workflow.ui.help}</div>
                </div>
              )}
            </div>
          )}

          {/* Reference Documents */}
          {context.length > 0 && (
            <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, background: '#fff' }}>
              <h3 style={{ margin: '0 0 12px 0' }}>Reference Documents</h3>
              {context.map((doc, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 500 }}>{doc.title}</div>
                  <div style={{ color: '#666', fontSize: '0.9em' }}>{doc.content.substring(0, 200)}...</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

