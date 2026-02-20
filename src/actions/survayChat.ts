import { ServiceAction, Context } from 'tool-ms';
import { z } from 'zod';
import { adapter } from '../main';
import { AdapterSystemPromptState } from 'tool-ms/dist/lib/Adapter';
import { getSurvey, appendChatTurns } from '../store/surveyStore';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ChatHistoryItemSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
});

export const SurvayChatInputSchema = z.object({
    surveyId: z.string().describe('The survey ID to chat about'),
    message: z.string().describe('The user message'),
    history: z.array(ChatHistoryItemSchema).optional().describe('All previous turns in this chat, oldest first'),
});
export type SurvayChatInput = z.infer<typeof SurvayChatInputSchema>;

export const SurvayChatOutputSchema = z.object({
    surveyId: z.string(),
    reply: z.string(),
});
export type SurvayChatOutput = z.infer<typeof SurvayChatOutputSchema>;

// ─── Action ───────────────────────────────────────────────────────────────────

export const SurvayChatAction: ServiceAction<SurvayChatInput, SurvayChatOutput> = {
    name: 'survayChat',
    version: 1,
    description: 'Chat with the LLM about a completed survey. Survey context (topic, summary, Q&A) is automatically injected.',
    domain: 'survay',
    tags: ['survay', 'chat'],
    input: SurvayChatInputSchema,
    output: SurvayChatOutputSchema,
    rest: { method: 'POST', path: '/survay-chat' },
    handler: async (ctx: Context<SurvayChatInput>): Promise<SurvayChatOutput> => {
        const { surveyId, message, history } = ctx.params;

        // Load survey context
        const record = getSurvey(surveyId);
        if (!record) throw new Error(`Survey ${surveyId} not found`);

        // Build a rich context block from the stored data
        const answerBlock = record.answers
            .map((a, i) => `${i + 1}. [${a.question.type}] ${a.question.label} → ${a.answer}`)
            .join('\n');

        const summaryBlock = record.summary
            ? `Summary: ${record.summary.summary}
Key insights:
${record.summary.insights.map(s => `- ${s}`).join('\n')}
Recommendations:
${record.summary.recommendations.map(s => `- ${s}`).join('\n')}`
            : '(No summary generated yet)';

        const systemPrompt = `You are a knowledgeable wellness and personal development coach. The user just completed a survey on "${record.topic}" and you have access to all their responses and analysis.

=== SURVEY CONTEXT ===
Topic: ${record.topic}
Date: ${record.createdAt}

Answers:
${answerBlock}

${summaryBlock}
=== END CONTEXT ===

Use this context to give personalised, specific advice. Reference the user's actual answers when relevant. Be warm, encouraging, and practical. Keep replies focused — 2-4 sentences unless the user asks for more detail.`;

        // Assemble messages: system + history + new user message
        const messages: AdapterSystemPromptState['messages'] = [
            { role: 'system', content: systemPrompt },
            ...(history ?? []).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            { role: 'user', content: message },
        ];

        const promptState: AdapterSystemPromptState = { messages, model: 'qwen3:4b-instruct' };
        const result = await adapter.prompt(promptState);
        const reply = result.message.content?.trim() ?? '(no reply)';

        // Persist both turns to the store
        try {
            const now = new Date().toISOString();
            appendChatTurns(surveyId, [
                { role: 'user', content: message, ts: now },
                { role: 'assistant', content: reply, ts: now },
            ]);
        } catch (err) {
            console.warn('Could not persist chat turns:', err);
        }

        return { surveyId, reply };
    },
};
