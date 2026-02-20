import './css/main.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type QuestionType = 'boolean' | 'scale';

interface Question {
    id: string;
    type: QuestionType;
    label: string;
    minLabel?: string | null;
    maxLabel?: string | null;
}

interface SurveyOutput {
    questions: Question[];
}

interface SubmitSurveyResponse {
    summary: string;
    insights: string[];
    recommendations: string[];
}

interface AnsweredQuestion {
    question: Question;
    answer: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:3000/api';

// ─── Topic state ─────────────────────────────────────────────────────────────

let selectedTopic = '';


// ─── State ───────────────────────────────────────────────────────────────────

let allAnswers: AnsweredQuestion[] = [];   // every answer across all rounds
let questionQueue: Question[] = [];        // pending questions this round
let currentQuestionIndex = 0;             // index into questionQueue

// ─── Screen helpers ──────────────────────────────────────────────────────────

type ScreenId = 'splash' | 'loading' | 'question' | 'decision' | 'results';

function showScreen(id: ScreenId): void {
    document.querySelectorAll<HTMLElement>('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(`screen-${id}`)!.classList.add('active');
}

// ─── DOM refs ────────────────────────────────────────────────────────────────

const $loadingMsg = document.getElementById('loading-message') as HTMLParagraphElement;
const $progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const $progressText = document.getElementById('progress-text') as HTMLSpanElement;
const $questionLabel = document.getElementById('question-label') as HTMLParagraphElement;
const $booleanArea = document.getElementById('answer-boolean') as HTMLDivElement;
const $scaleArea = document.getElementById('answer-scale') as HTMLDivElement;
const $scaleInput = document.getElementById('scale-input') as HTMLInputElement;
const $scaleValueDisplay = document.getElementById('scale-value-display') as HTMLDivElement;
const $scaleMinLabel = document.getElementById('scale-min-label') as HTMLSpanElement;
const $scaleMaxLabel = document.getElementById('scale-max-label') as HTMLSpanElement;
const $errorToast = document.getElementById('error-toast') as HTMLDivElement;
const $errorMessage = document.getElementById('error-message') as HTMLSpanElement;
const $btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const $topicInput = document.getElementById('topic-input') as HTMLInputElement;
const $topicPresets = document.getElementById('topic-presets') as HTMLDivElement;
const $resultsTitle = document.getElementById('results-title') as HTMLHeadingElement;

// ─── Topic selection helpers ──────────────────────────────────────────────────

function setTopic(topic: string, sourceChip?: HTMLButtonElement): void {
    selectedTopic = topic.trim();
    // Sync chip highlight
    $topicPresets.querySelectorAll<HTMLButtonElement>('.topic-chip').forEach(c =>
        c.classList.toggle('selected', c === sourceChip)
    );
    // Sync text input (only when chip drove the change)
    if (sourceChip) $topicInput.value = '';
    $btnStart.disabled = selectedTopic.length === 0;
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function showError(msg: string): void {
    $errorMessage.textContent = msg;
    $errorToast.classList.remove('hidden');
    setTimeout(() => $errorToast.classList.add('hidden'), 4000);
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function fetchQuestions(): Promise<Question[]> {
    const response = await fetch(`${API_URL}/survay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: selectedTopic, answers: allAnswers }),
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const data: SurveyOutput = await response.json();
    return data.questions;
}

async function submitAnswers(): Promise<SubmitSurveyResponse> {
    const response = await fetch(`${API_URL}/submit-survay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: allAnswers }),
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    return response.json();
}

// ─── Question rendering ───────────────────────────────────────────────────────

function renderQuestion(q: Question): void {
    const total = questionQueue.length;
    const current = currentQuestionIndex + 1;
    const pct = ((current - 1) / total) * 100;

    $progressBar.style.width = `${pct}%`;
    $progressText.textContent = `Question ${current} of ${total}`;
    $questionLabel.textContent = q.label;

    $booleanArea.classList.add('hidden');
    $scaleArea.classList.add('hidden');

    if (q.type === 'boolean') {
        $booleanArea.classList.remove('hidden');
        // reset any previous selection highlight
        $booleanArea.querySelectorAll<HTMLButtonElement>('.btn-choice').forEach(b =>
            b.classList.remove('selected')
        );
    } else {
        $scaleArea.classList.remove('hidden');
        $scaleMinLabel.textContent = cleanLabel(q.minLabel);
        $scaleMaxLabel.textContent = cleanLabel(q.maxLabel);
        $scaleInput.value = '5';
        $scaleValueDisplay.textContent = '5';
    }
}

/** Strip any trailing verbose explanation the LLM appended to min/max labels */
function cleanLabel(raw?: string | null): string {
    if (!raw) return '';
    // Keep only the first sentence / phrase (up to the first period, or 40 chars)
    const trimmed = raw.split(/[.()\d]/)[0].trim();
    return trimmed.length > 0 ? trimmed : raw;
}

function advanceQuestion(answer: string): void {
    const q = questionQueue[currentQuestionIndex];
    allAnswers.push({ question: q, answer });

    currentQuestionIndex++;

    if (currentQuestionIndex < questionQueue.length) {
        renderQuestion(questionQueue[currentQuestionIndex]);
    } else {
        // Round complete
        $progressBar.style.width = '100%';
        $progressText.textContent = `All ${questionQueue.length} questions answered`;
        showScreen('decision');
    }
}

// ─── Start a new round of questions ──────────────────────────────────────────

async function startNewRound(isFirst: boolean): Promise<void> {
    $loadingMsg.textContent = isFirst
        ? 'Generating your questions…'
        : 'Generating follow-up questions…';
    showScreen('loading');

    try {
        const questions = await fetchQuestions();
        if (!questions || questions.length === 0) {
            throw new Error('No questions returned from the server.');
        }
        questionQueue = questions;
        currentQuestionIndex = 0;
        if (isFirst) $resultsTitle.textContent = `Your ${selectedTopic} Insights`;
        renderQuestion(questionQueue[0]);
        showScreen('question');
    } catch (err) {
        console.error(err);
        showError('Failed to load questions. Please try again.');
        showScreen(isFirst ? 'splash' : 'decision');
    }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

async function showSummary(): Promise<void> {
    $loadingMsg.textContent = 'Analysing your answers…';
    showScreen('loading');

    try {
        const result = await submitAnswers();
        document.getElementById('result-summary')!.textContent = result.summary;

        const $insights = document.getElementById('result-insights')!;
        const $recs = document.getElementById('result-recommendations')!;
        $insights.innerHTML = '';
        $recs.innerHTML = '';

        (result.insights || []).forEach(text => {
            const li = document.createElement('li');
            li.textContent = text;
            $insights.appendChild(li);
        });

        (result.recommendations || []).forEach(text => {
            const li = document.createElement('li');
            li.textContent = text;
            $recs.appendChild(li);
        });

        showScreen('results');
    } catch (err) {
        console.error(err);
        showError('Failed to generate summary. Please try again.');
        showScreen('decision');
    }
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

// Topic chips
$topicPresets.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.topic-chip');
    if (!chip) return;
    setTopic(chip.dataset.topic!, chip);
});

// Topic text input
$topicInput.addEventListener('input', () => {
    setTopic($topicInput.value);
    // deselect any chip when user types freely
    $topicPresets.querySelectorAll<HTMLButtonElement>('.topic-chip').forEach(c =>
        c.classList.remove('selected')
    );
});

document.getElementById('btn-start')!.addEventListener('click', () => startNewRound(true));

// Boolean choices – delegate on the container
$booleanArea.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('btn-choice')) return;
    const value = target.dataset.value!;

    // Visual feedback
    $booleanArea.querySelectorAll<HTMLButtonElement>('.btn-choice').forEach(b =>
        b.classList.remove('selected')
    );
    target.classList.add('selected');

    // Short pause so user sees the selection before screen advances
    setTimeout(() => advanceQuestion(value), 260);
});

// Scale – live display then confirm with "Next" button
$scaleInput.addEventListener('input', () => {
    $scaleValueDisplay.textContent = $scaleInput.value;
});

document.getElementById('btn-scale-next')!.addEventListener('click', () => {
    advanceQuestion($scaleInput.value);
});

document.getElementById('btn-more-questions')!.addEventListener('click', () => startNewRound(false));
document.getElementById('btn-get-summary')!.addEventListener('click', showSummary);

document.getElementById('btn-restart')!.addEventListener('click', () => {
    allAnswers = [];
    questionQueue = [];
    currentQuestionIndex = 0;
    selectedTopic = '';
    $btnStart.disabled = true;
    $topicInput.value = '';
    $topicPresets.querySelectorAll<HTMLButtonElement>('.topic-chip').forEach(c =>
        c.classList.remove('selected')
    );
    showScreen('splash');
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

showScreen('splash');