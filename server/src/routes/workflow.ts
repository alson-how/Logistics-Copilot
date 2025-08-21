import { Router } from 'express';
import { loadWorkflow, advanceAsync } from '../workflow.js';
import { State } from '../types.js';
import path from 'path';

const WF_PATH = path.join(process.cwd(), 'workflows', 'export_batteries_MY_to_HK_v1.yaml');
const workflow = loadWorkflow(WF_PATH);

export const workflowRouter = Router();

workflowRouter.post('/workflow/start', async (_, res) => {
  const state: State = { currentStepId: workflow.steps[0].id, answers: {}, computed: {}, history: [] };
  const first = await advanceAsync(workflow, state);
  res.json(first);
});

workflowRouter.post('/workflow/answer', async (req, res) => {
  const { state, value } = req.body as { state: State; value: any };
  const out = await advanceAsync(workflow, state, { value });
  res.json(out);
});
