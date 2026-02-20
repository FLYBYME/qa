import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredQuestion {
    id: string;
    type: 'boolean' | 'scale';
    label: string;
    minLabel?: string | null;
    maxLabel?: string | null;
}

export interface StoredAnswer {
    question: StoredQuestion;
    answer: string;
}

export interface StoredSummary {
    summary: string;
    insights: string[];
    recommendations: string[];
}

export interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
    ts: string;
}

export interface SurveyRecord {
    id: string;
    topic: string;
    createdAt: string;
    answers: StoredAnswer[];
    summary: StoredSummary | null;
    chat: ChatTurn[];
}

interface Store {
    surveys: Record<string, SurveyRecord>;
}

// ─── File path ────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'surveys.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore(): Store {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) return { surveys: {} };
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Store;
    } catch {
        return { surveys: {} };
    }
}

function saveStore(store: Store): void {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Create a new survey record and return its generated ID. */
export function createSurvey(topic: string): SurveyRecord {
    const store = loadStore();
    const id = crypto.randomUUID();
    const record: SurveyRecord = {
        id,
        topic,
        createdAt: new Date().toISOString(),
        answers: [],
        summary: null,
        chat: [],
    };
    store.surveys[id] = record;
    saveStore(store);
    return record;
}

/** Append new Q&A pairs to an existing survey. */
export function appendAnswers(surveyId: string, answers: StoredAnswer[]): void {
    const store = loadStore();
    const record = store.surveys[surveyId];
    if (!record) throw new Error(`Survey ${surveyId} not found`);
    record.answers.push(...answers);
    saveStore(store);
}

/** Persist the generated summary. */
export function saveSummary(surveyId: string, summary: StoredSummary): void {
    const store = loadStore();
    const record = store.surveys[surveyId];
    if (!record) throw new Error(`Survey ${surveyId} not found`);
    record.summary = summary;
    saveStore(store);
}

/** Append one or more chat turns (user + assistant). */
export function appendChatTurns(surveyId: string, turns: ChatTurn[]): void {
    const store = loadStore();
    const record = store.surveys[surveyId];
    if (!record) throw new Error(`Survey ${surveyId} not found`);
    record.chat.push(...turns);
    saveStore(store);
}

/** Retrieve a single survey record by ID. */
export function getSurvey(surveyId: string): SurveyRecord | null {
    const store = loadStore();
    return store.surveys[surveyId] ?? null;
}

/** List all surveys (id, topic, createdAt only). */
export function listSurveys(): Pick<SurveyRecord, 'id' | 'topic' | 'createdAt'>[] {
    const store = loadStore();
    return Object.values(store.surveys).map(({ id, topic, createdAt }) => ({ id, topic, createdAt }));
}
