
// const modelName = 'claude-3-haiku-20240307';
const modelName = 'qwen3:4b-instruct';

export interface Agent {
    model: string;
    systemPrompt: string;
    actions: string[];
}


export const agents: Record<string, Agent> = {
    orchestrator: {
        model: modelName,
        systemPrompt: ``,
        actions: [

        ],
    },
};