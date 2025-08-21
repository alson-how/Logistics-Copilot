import fs from 'fs';
import yaml from 'js-yaml';
import { Workflow, State, Step, Q } from './types.js';
import * as rules_air from './rulesets/li_ion_air_v1.js';
import { getDocsByTitles, retrieve } from './rag.js';

export function loadWorkflow(path: string): Workflow {
  return yaml.load(fs.readFileSync(path, 'utf-8')) as Workflow;
}

function evalExpr(expr: string, answers: Record<string, any>): boolean {
  // Convert expressions like "transport_mode==air" to "transport_mode=='air'"
  const quotedExpr = expr.replace(/([a-zA-Z0-9_]+)==([a-zA-Z0-9_]+)/g, (_, left, right) => {
    // Don't quote true/false/null
    if (['true', 'false', 'null'].includes(right)) {
      return `${left}==${right}`;
    }
    return `${left}=='${right}'`;
  });
  
  const sanitized = quotedExpr.replace(/[^a-zA-Z0-9_\=\!\s\|\&\.']/g, '');
  const scope = answers;
  return Function('a', `with(a){ return (${sanitized}); }`)(scope);
}

function firstUnanswered(step: Step, state: State): Q | undefined {
  // First check if there are any required questions in sequence
  for (const q of step.ask || []) {
    // Skip derived fields
    if (q.derive_from) continue;

    // Check if the field is required based on conditions
    let isRequired = q.required;
    if (q.required_if) {
      isRequired = evalExpr(q.required_if, state.answers);
    }

    // If not required, continue to next question
    if (!isRequired) continue;

    // Check if the field has a value
    const has = state.answers[q.id] !== undefined && state.answers[q.id] !== '';
    if (!has) return q;
  }

  // Then check for optional questions
  return step.ask?.find(q => {
    if (q.derive_from) return false;
    const has = state.answers[q.id] !== undefined && state.answers[q.id] !== '';
    return !has;
  });
}

function validate(value: any, q: Q): string | null {
  if ((q.type === 'integer') && isNaN(Number(value))) return 'Please enter a number.';
  if (q.validate) {
    const re = new RegExp(q.validate);
    if (!re.test(String(value))) return 'Invalid format.';
  }
  return null;
}

function applyComputations(step: Step, state: State) {
  for (const c of step.compute || []) {
    if (c.using === 'ruleset_li_ion_air_v1') {
      state.computed[c.output] = rules_air.classify({
        battery_configuration: String(state.answers['battery_configuration'] || ''),
        wh_or_li_content: String(state.answers['wh_or_li_content'] || ''),
        qty_per_pkg: Number(state.answers['qty_per_pkg'] || 0),
        un_number: String(state.answers['un_number'] || ''),
        pi_candidate: String(state.answers['pi_candidate'] || '')
      });
    }
  }
}

function stepNext(step: Step, state: State): string {
  for (const rule of step.next || []) {
    if (rule.when === 'always' || evalExpr(rule.when, state.answers)) return rule.goto;
  }
  return 'done';
}

function formatOptionLabel(value: string): string {
  // Split by underscore and capitalize each word
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function trimSnippet(s: string, max = 400) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export async function getGuidanceHelp(step: Step): Promise<{ help?: string; citations?: string[] }> {
  const citations: string[] = [];
  if (Array.isArray(step.guidance_ref) || typeof step.guidance_ref === 'string') {
    const titles = Array.isArray(step.guidance_ref) ? step.guidance_ref : [step.guidance_ref];
    const docs = await getDocsByTitles(titles);
    if (docs.length) {
      citations.push(...docs.map(d => d.uri));
      return { help: trimSnippet(docs.map(d => d.content).join('\n\n')), citations };
    }
  }
  if (step.guidance_query) {
    const rows = await retrieve(step.guidance_query);
    if (rows.length) {
      citations.push(rows[0].uri);
      return { help: trimSnippet(rows[0].content), citations };
    }
  }
  return {};
}

async function generateWorkflowSummary(workflow: Workflow, state: State, blockedStep: string): Promise<any> {
  const steps = [];
  let foundBlocked = false;

  for (const step of workflow.steps) {
    if (step.id === 'done') continue;

    const status = foundBlocked ? 'pending' : 
                  step.id === blockedStep ? 'blocked' : 
                  'completed';

    if (step.id === blockedStep) {
      foundBlocked = true;
    }

    const stepSummary = {
      id: step.id,
      title: step.title,
      status,
      questions: [] as Array<{ label: string; answer?: string }>
    };

    // Add all questions and answers for the step
    stepSummary.questions = (step.ask || []).map(q => {
      let answer = state.answers[q.id];
      // Format the answer if it's a value from options
      if (answer !== undefined && q.options) {
        answer = formatOptionLabel(String(answer));
      }
      return {
        label: q.label,
        answer: answer !== undefined ? String(answer) : undefined
      };
    });

    steps.push(stepSummary);
  }

  return {
    completed: false,
    message: 'Looks like you are missing some crucial information here. You need to obtain the required permits before proceeding.',
    steps
  };
}

export async function advanceAsync(workflow: Workflow, state: State, input?: { value?: any }) {
  const step = workflow.steps.find(s => s.id === state.currentStepId)!;

  // resolve derived fields
  for (const q of step.ask || []) {
    if (q.derive_from && q.id && q.derive_from.startsWith('dg_profile.')) {
      const path = q.derive_from.split('.').slice(1);
      let val: any = state.computed['dg_profile'];
      for (const k of path) val = val ? val[k] : undefined;
      if (val !== undefined) state.answers[q.id] = val;
    }
  }

  const q = firstUnanswered(step, state);
  if (q) {
    if (input && 'value' in input) {
      const err = validate(input.value, q);
      if (err) {
        const g = await getGuidanceHelp(step);
        return { ui: { step_id: step.id, title: step.title, question: q.label, help: g.help, choices: q.options }, state, next_action: 'await_user', error: err, citations: g.citations };
      }
      state.answers[q.id] = q.type === 'integer' ? Number(input.value) : input.value;

      // Check for permit requirement
      if (q.id === 'exporter_has_permit' && input.value === 'no') {
        const summary = await generateWorkflowSummary(workflow, state, step.id);
        return { 
          ui: { step_id: step.id, title: step.title },
          state,
          next_action: 'await_user',
          summary,
          citations: [],
          response: 'I see that you don\'t have the required export permit. Let me summarize your progress and what you need to do next.'
        };
      }
    }
    const nextQ = firstUnanswered(step, state);
    if (nextQ) {
      const g = await getGuidanceHelp(step);
      return { ui: { step_id: step.id, title: step.title, question: nextQ.label, help: g.help, choices: nextQ.options }, state, next_action: 'await_user', citations: g.citations };
    }
  }

  applyComputations(step, state);
  const nextId = stepNext(step, state);
  state.history.push({ step: step.id, answers: { ...state.answers }, computed: { ...state.computed } });
  state.currentStepId = nextId;
  const nextStep = workflow.steps.find(s => s.id === nextId)!;
  const nq = firstUnanswered(nextStep, state);
  const g = await getGuidanceHelp(nextStep);
  return { ui: { step_id: nextStep.id, title: nextStep.title, question: nq?.label, help: g.help, choices: nq?.options }, state, next_action: 'await_user', citations: g.citations };
}
