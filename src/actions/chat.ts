import { ServiceAction, Context } from 'tool-ms';
import { z } from 'zod';
import { manager, adapter } from '../main';
import { AdapterSystemPromptState } from 'tool-ms/dist/lib/Adapter';
import { agents } from '../agents';

let state: AdapterSystemPromptState = {
    messages: [],
    model: '',
};

async function createSession(agentID: string) {
    const agent = agents[agentID];
    if (!agent) {
        throw new Error('Agent not found');
    }
    state.messages = [];
    state.actions = [];
    state.model = agent.model;
    if (agent.systemPrompt) {
        state.messages.push({
            role: 'system',
            content: agent.systemPrompt,
        });
    }
    if (agent.actions && agent.actions.length > 0) {
        for (const action of agent.actions) {
            const service = manager.get(action);
            if (service) {
                state.actions?.push(service);
            } else {
                console.log(`Action ${action} not found`);
            }
        }
    }
}

export const SessionChatInputSchema = z.object({
    prompt: z.string().describe('The prompt to send to the model'),
});
export type SessionChatInput = z.infer<typeof SessionChatInputSchema>;

export const ToolCallSchema = z.object({
    id: z.string(),
    type: z.string(),
    function: z.object({
        name: z.string(),
        arguments: z.string(),
    }),
});

export const MessageSchema = z.object({
    role: z.string(),
    content: z.string().optional().nullable(),
    tool_calls: z.array(ToolCallSchema).optional().nullable(),
    tool_call_id: z.string().optional().nullable(),
});

export const ChatOutputSchema = z.object({
    messages: z.array(MessageSchema),
    message: MessageSchema,
    usage: z.object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number(),
    }).optional().nullable(),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export const ChatAction: ServiceAction<SessionChatInput, ChatOutput> = {
    name: 'agents.chat',
    version: 1,
    description: 'Chat with the model',
    domain: 'chat',
    tags: ['chat'],
    input: SessionChatInputSchema,
    output: ChatOutputSchema,
    rest: {
        method: 'POST',
        path: '/agents/chat',
    },
    handler: async (ctx: Context<SessionChatInput>): Promise<ChatOutput> => {
        const { prompt } = ctx.params;

        ctx.metadata.agentID = 'orchestrator';

        state.messages.push({
            role: 'user',
            content: prompt,
        });

        state.ctx = ctx;
        const result = await adapter.prompt(state);
        state.ctx = undefined;

        console.log('Chat result:');
        console.dir(result, { depth: null });

        return result as ChatOutput;
    },
    started: async () => {
        createSession('orchestrator');
    }
};

// --- clearSession ---

export const ClearSessionInputSchema = z.object({});
export const ClearSessionOutputSchema = z.object({
    success: z.boolean(),
});

export const clearSession: ServiceAction<{}, { success: boolean }> = {
    name: 'agents.clearSession',
    version: 1,
    description: 'Clear the session',
    domain: 'chat',
    tags: ['chat'],
    input: ClearSessionInputSchema,
    output: ClearSessionOutputSchema,
    rest: { method: 'POST', path: '/agents/clearSession' },
    handler: async (ctx) => {
        createSession('orchestrator');
        return { success: true };
    },
};