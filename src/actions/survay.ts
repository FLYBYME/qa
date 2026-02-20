import { ServiceAction, Context } from 'tool-ms';
import { z } from 'zod';
import { adapter } from '../main';
import { AdapterSystemPromptState } from 'tool-ms/dist/lib/Adapter';
import {
    createSurvey,
    setAnswers,
    saveSummary,
    getSurvey,
    listSurveys,
} from '../store/surveyStore';

// ─── Shared schemas ───────────────────────────────────────────────────────────

const QuestionSchema = z.object({
    id: z.string().describe('The id of the question'),
    type: z.enum(['boolean', 'scale']).describe('boolean = yes/no, scale = 0-10'),
    label: z.string().describe('The question text'),
    minLabel: z.string().optional().nullable(),
    maxLabel: z.string().optional().nullable(),
});

const AnswerSchema = z.object({
    question: QuestionSchema,
    answer: z.string(),
});

// ─── SurvayAction — generate questions ───────────────────────────────────────

export const SurvayInputSchema = z.object({
    topic: z.string().describe('The topic of the survey'),
    surveyId: z.string().optional().nullable().describe('Existing survey ID. Omit to start a new survey.'),
    answers: z.array(AnswerSchema).describe('Previously answered questions (all rounds so far)'),
});
export type SurvayInput = z.infer<typeof SurvayInputSchema>;

export const SurvayOutputSchema = z.object({
    surveyId: z.string().describe('The survey ID (use this in all subsequent calls)'),
    questions: z.array(QuestionSchema),
});
export type SurvayOutput = z.infer<typeof SurvayOutputSchema>;

export const SurvayAction: ServiceAction<SurvayInput, SurvayOutput> = {
    name: 'survay',
    version: 1,
    description: 'Generate survey questions. Creates a new survey if surveyId is absent.',
    domain: 'survay',
    tags: ['survay'],
    input: SurvayInputSchema,
    output: SurvayOutputSchema,
    rest: { method: 'POST', path: '/survay' },
    handler: async (ctx: Context<SurvayInput>): Promise<SurvayOutput> => {
        const { topic, answers } = ctx.params;
        let { surveyId } = ctx.params;

        // Create or retrieve the survey
        if (!surveyId) {
            const record = createSurvey(topic);
            surveyId = record.id;
        }

        // Persist the cumulative answers that arrived with this request
        if (answers && answers.length > 0) {
            setAnswers(surveyId, answers);
        }

        // Build the LLM prompt
        const hasPreviousAnswers = answers && answers.length > 0;
        const promptState: AdapterSystemPromptState = {
            messages: [],
            model: 'qwen3:4b-instruct',
            outputStructure: z.object({ questions: z.array(QuestionSchema) }),
        };

        promptState.messages.push({
            role: 'system',
            content: hasPreviousAnswers
                ? `You are a professional survey generator. Your task is to generate the next set of survey questions on the given topic.

Rules you MUST follow:
1. Do NOT repeat or rephrase any of the previously asked questions — treat them as permanently off-limits.
2. Each new question must explore a DIFFERENT dimension or angle of the topic that has NOT been covered yet.
3. Use the respondent's previous answers to guide the direction — if they rated something low, dig into why; if they rated something high, explore adjacent areas.
4. Avoid semantically similar questions (e.g. do not ask both "How satisfied are you?" and "How happy are you?").
5. Output only the structured question list in the required JSON format. Do not include any explanation or markdown.`
                : `You are a professional survey generator. Your task is to create an initial set of survey questions for the given topic.

Rules you MUST follow:
1. Cover a broad range of dimensions relevant to the topic.
2. Mix question types (boolean yes/no and 0-10 scale) appropriately.
3. Keep questions concise, neutral, and non-leading.
4. Output only the structured question list in the required JSON format. Do not include any explanation or markdown.`,
        });

        let userPrompt: string;
        if (hasPreviousAnswers) {
            const previousQuestionsBlock = answers
                .map((a, i) => `${i + 1}. [${a.question.type}] ${a.question.label} — Answer: ${a.answer}`)
                .join('\n');
            userPrompt = `Topic: ${topic}

Previously asked questions and answers (DO NOT ask these again or anything semantically similar):
${previousQuestionsBlock}

Generate new survey questions that explore unexplored aspects of the topic, informed by the answers above.`;
        } else {
            userPrompt = `Topic: ${topic}\n\nGenerate an initial set of survey questions for this topic.`;
        }

        promptState.messages.push({ role: 'user', content: userPrompt });
        const result = await adapter.prompt(promptState);
        const json = JSON.parse(result.message.content || '{}');

        return { surveyId, questions: json.questions ?? [] };
    },
};

// ─── SubmitSurvayAction — generate summary ────────────────────────────────────

export const SubmitSurvayInputSchema = z.object({
    surveyId: z.string().describe('The survey ID returned by /survay'),
    answers: z.array(AnswerSchema).describe('All answered questions across all rounds'),
});
export type SubmitSurvayInput = z.infer<typeof SubmitSurvayInputSchema>;

export const SubmitSurvayOutputSchema = z.object({
    surveyId: z.string(),
    summary: z.string(),
    insights: z.array(z.string()),
    recommendations: z.array(z.string()),
});
export type SubmitSurvayOutput = z.infer<typeof SubmitSurvayOutputSchema>;

export const SubmitSurvayAction: ServiceAction<SubmitSurvayInput, SubmitSurvayOutput> = {
    name: 'submitsurvay',
    version: 1,
    description: 'Analyse all survey answers and produce a summary with insights and recommendations.',
    domain: 'survay',
    tags: ['survay'],
    input: SubmitSurvayInputSchema,
    output: SubmitSurvayOutputSchema,
    rest: { method: 'POST', path: '/submit-survay' },
    handler: async (ctx: Context<SubmitSurvayInput>): Promise<SubmitSurvayOutput> => {
        const { surveyId, answers } = ctx.params;

        // Persist the final list of answers before/during summary generation
        if (answers && answers.length > 0) {
            try {
                setAnswers(surveyId, answers);
            } catch (err) {
                console.warn('Could not persist final answers:', err);
            }
        }

        const promptState: AdapterSystemPromptState = {
            messages: [],
            model: 'qwen3:4b-instruct',
            outputStructure: z.object({
                summary: z.string(),
                insights: z.array(z.string()),
                recommendations: z.array(z.string()),
            }),
        };

        promptState.messages.push({
            role: 'system',
            content: `You are a professional survey analyst. Analyse the provided survey answers and return a JSON object with:
- "summary": a concise paragraph summarising the overall picture
- "insights": an array of 3-5 specific observations drawn from the answers
- "recommendations": an array of 3-5 actionable recommendations

Output only the JSON object. No markdown, no extra text.`,
        });

        promptState.messages.push({
            role: 'user',
            content: JSON.stringify(answers),
        });

        const result = await adapter.prompt(promptState);
        const json = JSON.parse(result.message.content || '{}');

        const summaryData = {
            summary: json.summary ?? '',
            insights: json.insights ?? [],
            recommendations: json.recommendations ?? [],
        };

        // Persist the summary
        try {
            saveSummary(surveyId, summaryData);
        } catch (err) {
            console.warn('Could not persist summary:', err);
        }

        return { surveyId, ...summaryData };
    },
};

// ─── GetSurvayAction — retrieve a stored survey ───────────────────────────────

export const GetSurvayAction: ServiceAction<{ id: string }, any> = {
    name: 'getSurvay',
    version: 1,
    description: 'Retrieve a stored survey by ID',
    domain: 'survay',
    tags: ['survay'],
    input: z.object({ id: z.string() }),
    output: z.any(),
    rest: { method: 'GET', path: '/survay/:id' },
    handler: async (ctx: Context<{ id: string }>) => {
        const record = getSurvey(ctx.params.id);
        if (!record) throw new Error(`Survey ${ctx.params.id} not found`);
        return record;
    },
};

// ─── ListSurvaysAction — list all surveys ────────────────────────────────────

export const ListSurvaysAction: ServiceAction<{}, any> = {
    name: 'listSurvays',
    version: 1,
    description: 'List all stored surveys',
    domain: 'survay',
    tags: ['survay'],
    input: z.object({}),
    output: z.any(),
    rest: { method: 'GET', path: '/surveys' },
    handler: async () => {
        return { surveys: listSurveys() };
    },
};