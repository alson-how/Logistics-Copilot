export interface Document {
    id: number;
    uri: string;
    title: string;
    content: string;
    created_at: Date;
}

export interface WorkflowState {
    state: State;
    ui: {
        step_id: string;
        title: string;
        question?: string;
        help?: string;
        choices?: string[];
    };
    next_action?: string;
    summary?: WorkflowSummary;
}

export interface State {
    currentStepId: string;
    answers: Record<string, any>;
    computed: Record<string, any>;
    history: Array<{
        step: string;
        answers: Record<string, any>;
        computed: Record<string, any>;
    }>;
}

export interface Workflow {
    title: string;
    steps: Step[];
}

export interface Step {
    id: string;
    title: string;
    ask?: Q[];
    compute?: Array<{
        target: string;
        expr: string;
        using?: string[];
        output?: string;
    }>;
    next?: Array<{
        when: string;
        goto: string;
    }>;
    guidance_ref?: string | string[];
    guidance_query?: string;
    actions_if?: Array<{
        when: string;
        advise?: string[];
    }>;
}

export interface Q {
    todo: any;
    id: string;
    label: string;
    type?: string;
    options?: string[];
    required?: boolean;
    required_if?: string;
    derive_from?: string;
    validate?: string;
}

export interface WorkflowSummary {
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

export interface WorkflowResult {
    state: State;
    next_question?: Q;
    next_action: string;
    message?: string;
    summary?: WorkflowSummary;
}