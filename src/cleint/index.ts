import './css/main.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionType = 'boolean' | 'scale';

interface Question {
    id: string;
    type: QuestionType;
    label: string;
    minLabel?: string | null;
    maxLabel?: string | null;
}

interface SurveyOutput {
    surveyId: string;
    questions: Question[];
}

interface SubmitSurveyResponse {
    surveyId: string;
    summary: string;
    insights: string[];
    recommendations: string[];
}

interface AnsweredQuestion {
    question: Question;
    answer: string;
}

interface ChatHistoryItem {
    role: 'user' | 'assistant';
    content: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:3000/api';

// ─── State ────────────────────────────────────────────────────────────────────

let selectedTopic = '';
let currentSurveyId = '';
let allAnswers: AnsweredQuestion[] = [];
let questionQueue: Question[] = [];
let currentQuestionIndex = 0;
let chatHistory: ChatHistoryItem[] = [];

// ─── URL Routing ──────────────────────────────────────────────────────────────

function syncUrlHash(): void {
    if (currentSurveyId) {
        window.location.hash = `id=${currentSurveyId}`;
    } else {
        // Clear hash if no survey is active
        if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }
}

async function handleDeepLink(): Promise<void> {
    const hash = window.location.hash.slice(1); // remove #
    const params = new URLSearchParams(hash);
    const id = params.get('id');

    if (id && id.length > 10) { // basic uuid check
        await resumeSurvey(id);
    }
}

// ─── Screen helpers ───────────────────────────────────────────────────────────

type ScreenId = 'splash' | 'loading' | 'question' | 'decision' | 'results' | 'chat' | 'history' | 'review';

function showScreen(id: ScreenId): void {
    document.querySelectorAll<HTMLElement>('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(`screen-${id}`)!.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

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
const $chatMessages = document.getElementById('chat-messages') as HTMLDivElement;
const $chatInput = document.getElementById('chat-input') as HTMLInputElement;
const $btnChatSend = document.getElementById('btn-chat-send') as HTMLButtonElement;
const $chatTopicLabel = document.getElementById('chat-topic-label') as HTMLSpanElement;
const $historyList = document.getElementById('history-list') as HTMLDivElement;
const $btnShowHistory = document.getElementById('btn-show-history') as HTMLButtonElement;
const $btnHistoryBack = document.getElementById('btn-history-back') as HTMLButtonElement;
const $reviewList = document.getElementById('review-list') as HTMLDivElement;
const $btnShowReview = document.getElementById('btn-show-review') as HTMLButtonElement;
const $btnReviewBack = document.getElementById('btn-review-back') as HTMLButtonElement;

// ─── Toast ────────────────────────────────────────────────────────────────────

function showError(msg: string): void {
    $errorMessage.textContent = msg;
    $errorToast.classList.remove('hidden');
    setTimeout(() => $errorToast.classList.add('hidden'), 4000);
}

// ─── Topic selection ──────────────────────────────────────────────────────────

function setTopic(topic: string, sourceChip?: HTMLButtonElement): void {
    selectedTopic = topic.trim();
    $topicPresets.querySelectorAll<HTMLButtonElement>('.topic-chip').forEach(c =>
        c.classList.toggle('selected', c === sourceChip)
    );
    if (sourceChip) $topicInput.value = '';
    $btnStart.disabled = selectedTopic.length === 0;
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchQuestions(): Promise<{ surveyId: string; questions: Question[] }> {
    const response = await fetch(`${API_URL}/survay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            topic: selectedTopic,
            surveyId: currentSurveyId || undefined,
            answers: allAnswers,
        }),
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    return response.json() as Promise<SurveyOutput>;
}

async function submitAnswers(): Promise<SubmitSurveyResponse> {
    const response = await fetch(`${API_URL}/submit-survay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId: currentSurveyId, answers: allAnswers }),
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    return response.json();
}

async function sendChatMessage(message: string): Promise<string> {
    const response = await fetch(`${API_URL}/survay-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId: currentSurveyId, message, history: chatHistory }),
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const data = await response.json();
    return data.reply as string;
}

async function fetchHistory(): Promise<{ id: string; topic: string; createdAt: string }[]> {
    const response = await fetch(`${API_URL}/surveys`);
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const data = await response.json();
    return data.surveys;
}

async function fetchSurveyRecord(id: string): Promise<any> {
    const response = await fetch(`${API_URL}/survay/${id}`);
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    return response.json();
}

async function downloadPdf(): Promise<void> {
    if (!currentSurveyId) return;

    // Show some loading state on the button
    const $btn = document.getElementById('btn-download-pdf') as HTMLButtonElement;
    const originalText = $btn.textContent;
    $btn.disabled = true;
    $btn.textContent = 'Generating...';

    try {
        const response = await fetch(`${API_URL}/survay-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ surveyId: currentSurveyId }),
        });
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();

        const blob = await (await fetch(`data:application/pdf;base64,${data.pdfBase64}`)).blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || 'Survey_Report.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error(err);
        showError('Failed to generate PDF. Please try again.');
    } finally {
        $btn.disabled = false;
        $btn.textContent = originalText;
    }
}

// ─── Question rendering ───────────────────────────────────────────────────────

function cleanLabel(raw?: string | null): string {
    if (!raw) return '';
    const trimmed = raw.split(/[.()\d]/)[0].trim();
    return trimmed.length > 0 ? trimmed : raw;
}

function renderQuestion(q: Question): void {
    const total = questionQueue.length;
    const current = currentQuestionIndex + 1;
    $progressBar.style.width = `${((current - 1) / total) * 100}%`;
    $progressText.textContent = `Question ${current} of ${total}`;
    $questionLabel.textContent = q.label;

    $booleanArea.classList.add('hidden');
    $scaleArea.classList.add('hidden');

    if (q.type === 'boolean') {
        $booleanArea.classList.remove('hidden');
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

function advanceQuestion(answer: string): void {
    allAnswers.push({ question: questionQueue[currentQuestionIndex], answer });
    currentQuestionIndex++;

    if (currentQuestionIndex < questionQueue.length) {
        renderQuestion(questionQueue[currentQuestionIndex]);
    } else {
        $progressBar.style.width = '100%';
        $progressText.textContent = `All ${questionQueue.length} questions answered`;
        showScreen('decision');
    }
}

// ─── Rounds ───────────────────────────────────────────────────────────────────

async function startNewRound(isFirst: boolean): Promise<void> {
    $loadingMsg.textContent = isFirst ? 'Generating your questions…' : 'Generating follow-up questions…';
    showScreen('loading');

    try {
        const data = await fetchQuestions();
        currentSurveyId = data.surveyId;

        if (!data.questions || data.questions.length === 0) {
            throw new Error('No questions returned from the server.');
        }

        questionQueue = data.questions;
        currentQuestionIndex = 0;
        if (isFirst) $resultsTitle.textContent = `Your ${selectedTopic} Insights`;

        syncUrlHash();
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
        currentSurveyId = result.surveyId;

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

// ─── Review ──────────────────────────────────────────────────────────────────

function openReview(): void {
    $reviewList.innerHTML = '';

    if (allAnswers.length === 0) {
        $reviewList.innerHTML = '<p class="empty-msg">No answers recorded yet.</p>';
    } else {
        allAnswers.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'review-item';

            const qType = item.question.type === 'boolean' ? 'Yes/No' : '0-10';

            row.innerHTML = `
                <div class="review-q-num">Question ${index + 1}</div>
                <div class="review-q-label">${item.question.label}</div>
                <div class="review-answer-row">
                    <span class="review-answer-pill">${item.answer}</span>
                    <span class="review-type-pill">${qType}</span>
                </div>
            `;
            $reviewList.appendChild(row);
        });
    }

    showScreen('review');
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function appendChatBubble(role: 'user' | 'assistant', content: string): void {
    // Remove welcome message on first real message
    const welcome = $chatMessages.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble-${role}`;
    bubble.textContent = content;
    $chatMessages.appendChild(bubble);
    $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

function appendTypingIndicator(): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'chat-bubble chat-bubble-assistant chat-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    $chatMessages.appendChild(el);
    $chatMessages.scrollTop = $chatMessages.scrollHeight;
    return el;
}

async function handleChatSend(): Promise<void> {
    const message = $chatInput.value.trim();
    if (!message || $btnChatSend.disabled) return;

    $chatInput.value = '';
    $btnChatSend.disabled = true;
    appendChatBubble('user', message);
    chatHistory.push({ role: 'user', content: message });

    const indicator = appendTypingIndicator();

    try {
        const reply = await sendChatMessage(message);
        indicator.remove();
        appendChatBubble('assistant', reply);
        chatHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
        indicator.remove();
        showError('Failed to get a reply. Please try again.');
        // Remove the failed user message from history
        chatHistory.pop();
    } finally {
        $btnChatSend.disabled = false;
        $chatInput.focus();
    }
}

function openChat(): void {
    if (chatHistory.length === 0) {
        $chatMessages.innerHTML = `
            <div class="chat-welcome">
                <span class="chat-welcome-icon">✦</span>
                <p>I have full context on your survey. Ask me anything!</p>
            </div>`;
    } else {
        $chatMessages.innerHTML = '';
        chatHistory.forEach(turn => appendChatBubble(turn.role, turn.content));
    }
    $chatTopicLabel.textContent = selectedTopic;
    showScreen('chat');
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

// Topic chips
$topicPresets.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.topic-chip');
    if (!chip) return;
    setTopic(chip.dataset.topic!, chip);
});

// Topic input
$topicInput.addEventListener('input', () => {
    setTopic($topicInput.value);
    $topicPresets.querySelectorAll<HTMLButtonElement>('.topic-chip').forEach(c =>
        c.classList.remove('selected')
    );
});

// ─── History ──────────────────────────────────────────────────────────────────

async function openHistory(): Promise<void> {
    showScreen('loading');
    try {
        const surveys = await fetchHistory();
        renderHistory(surveys);
        showScreen('history');
    } catch (err) {
        console.error(err);
        showError('Failed to load history.');
        showScreen('splash');
    }
}

function renderHistory(surveys: any[]): void {
    $historyList.innerHTML = '';
    if (surveys.length === 0) {
        $historyList.innerHTML = '<p class="empty-msg">No history found.</p>';
        return;
    }

    surveys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    surveys.forEach(s => {
        const item = document.createElement('div');
        item.className = 'history-item';
        const date = new Date(s.createdAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        item.innerHTML = `
            <div class="history-info">
                <span class="history-topic">${s.topic}</span>
                <span class="history-date">${date}</span>
            </div>
            <button class="btn btn-secondary btn-sm" data-id="${s.id}">View</button>
        `;
        $historyList.appendChild(item);
    });
}

async function resumeSurvey(id: string): Promise<void> {
    showScreen('loading');
    try {
        const record = await fetchSurveyRecord(id);

        // Populate state
        currentSurveyId = record.id;
        selectedTopic = record.topic;
        allAnswers = record.answers || [];
        chatHistory = (record.chat || []).map((t: any) => ({ role: t.role, content: t.content }));

        // Update UI
        $resultsTitle.textContent = `Your ${selectedTopic} Insights`;
        if (record.summary) {
            document.getElementById('result-summary')!.textContent = record.summary.summary;
            const $insights = document.getElementById('result-insights')!;
            const $recs = document.getElementById('result-recommendations')!;
            $insights.innerHTML = '';
            $recs.innerHTML = '';
            (record.summary.insights || []).forEach((text: string) => {
                const li = document.createElement('li');
                li.textContent = text;
                $insights.appendChild(li);
            });
            (record.summary.recommendations || []).forEach((text: string) => {
                const li = document.createElement('li');
                li.textContent = text;
                $recs.appendChild(li);
            });
            syncUrlHash();
            showScreen('results');
        } else {
            // Not summarised yet - go to decision screen if answered, or question screen
            syncUrlHash();
            if (allAnswers.length > 0) {
                showScreen('decision');
            } else {
                startNewRound(true);
            }
        }
    } catch (err) {
        console.error(err);
        showError('Failed to load survey details.');
        showScreen('history');
    }
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

// Splash screen
$btnShowHistory.addEventListener('click', openHistory);
$btnStart.addEventListener('click', () => startNewRound(true));

// History screen
$btnHistoryBack.addEventListener('click', () => showScreen('splash'));
$historyList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn || !btn.dataset.id) return;
    resumeSurvey(btn.dataset.id);
});

// Boolean answers
$booleanArea.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('btn-choice')) return;
    $booleanArea.querySelectorAll<HTMLButtonElement>('.btn-choice').forEach(b => b.classList.remove('selected'));
    target.classList.add('selected');
    setTimeout(() => advanceQuestion(target.dataset.value!), 260);
});

// Scale
$scaleInput.addEventListener('input', () => { $scaleValueDisplay.textContent = $scaleInput.value; });
document.getElementById('btn-scale-next')!.addEventListener('click', () => advanceQuestion($scaleInput.value));

// Decision screen
document.getElementById('btn-more-questions')!.addEventListener('click', () => startNewRound(false));
document.getElementById('btn-get-summary')!.addEventListener('click', showSummary);

// Results screen
document.getElementById('btn-open-chat')!.addEventListener('click', openChat);
document.getElementById('btn-download-pdf')!.addEventListener('click', downloadPdf);
document.getElementById('btn-results-more')!.addEventListener('click', () => startNewRound(false));
document.getElementById('btn-show-review')!.addEventListener('click', openReview);
document.getElementById('btn-restart')!.addEventListener('click', () => {
    allAnswers = [];
    questionQueue = [];
    currentQuestionIndex = 0;
    currentSurveyId = '';
    chatHistory = [];
    selectedTopic = '';
    currentSurveyId = '';
    syncUrlHash();
    $btnStart.disabled = true;
    $topicInput.value = '';
    $topicPresets.querySelectorAll<HTMLButtonElement>('.topic-chip').forEach(c => c.classList.remove('selected'));
    showScreen('splash');
});

// Chat screen
$btnChatSend.addEventListener('click', handleChatSend);
$chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleChatSend(); });
document.getElementById('btn-chat-back')!.addEventListener('click', () => showScreen('results'));

// Review screen
$btnReviewBack.addEventListener('click', () => showScreen('results'));

// ─── Boot ─────────────────────────────────────────────────────────────────────

window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const id = params.get('id');
    if (id && id !== currentSurveyId) {
        resumeSurvey(id);
    } else if (!id && currentSurveyId) {
        // User cleared the hash manually or went back to start
        location.reload();
    }
});

handleDeepLink().catch(err => {
    console.warn('Deep link failed:', err);
    showScreen('splash');
});

showScreen('splash');