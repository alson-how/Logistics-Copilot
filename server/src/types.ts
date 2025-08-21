export type Answer = string | number | boolean;

export type Q = {
  id: string;
  label: string;
  type: "single_select" | "boolean" | "string" | "integer" | "long_text" | "text";
  options?: string[];
  required?: boolean;
  required_if?: string; // expression like a==true
  validate?: string; // regex
  derive_from?: string; // path in computed
};

export type Step = {
  id: string;
  title: string;
  guidance_ref?: string | string[]; // exact doc titles
  guidance_query?: string;          // semantic query
  ask?: Q[];
  actions_if?: { when: string; advise: string[] }[];
  compute?: { output: string; from: string; using: string }[];
  outputs?: string[];
  next?: { when: string; goto: string }[];
};

export type Workflow = {
  workflow_id: string;
  title: string;
  version: string;
  steps: Step[];
};

export type State = {
  currentStepId: string;
  answers: Record<string, Answer>;
  computed: Record<string, any>;
  history: any[];
};
