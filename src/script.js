import {
	buildLeaderboard,
	compareAgainstModels,
	formatDate,
	formatPercent,
	formatRank,
	getBenchmarkModels,
	loadState,
	saveState,
	scoreBenchmark,
	selectQuestions,
	verdictLabel,
} from './score.js';

const DATA_ROOT_CANDIDATES = ['data', './data', '../data'];
const SETTINGS_KEY = 'humanmark-settings';
const DEFAULT_QUESTIONS_PER_PAGE = 5;
const MIN_QUESTIONS_PER_PAGE = 1;
const MAX_QUESTIONS_PER_PAGE = 20;
const DEFAULT_SORT_NUMERIC_CHOICES = true;

const PAGE = document.body.dataset.page;

document.addEventListener('DOMContentLoaded', () => {
	void init().catch((error) => {
		console.error(error);

		if (PAGE === 'home') {
			const preview = document.querySelector('[data-role="benchmark-preview"]');
			const scoreboard = document.querySelector('[data-role="scoreboard"]');
			if (preview) {
				preview.innerHTML = '<article class="panel panel--soft"><p>Unable to load benchmark data right now.</p></article>';
			}
			if (scoreboard) {
				scoreboard.innerHTML = '<article class="panel panel--soft"><p>Please try refreshing in a moment.</p></article>';
			}
		}
	});
});

async function loadJSON(relativePath) {
	const response = await fetch(new URL(relativePath, window.location.href));

	if (!response.ok) {
		throw new Error(`Failed to load ${relativePath}: ${response.status} ${response.statusText}`);
	}

	return response.json();
}

async function resolveDataRoot() {
	for (const candidate of DATA_ROOT_CANDIDATES) {
		try {
			const benchmarksData = await loadJSON(`${candidate}/benchmarks/index.json`);
			return {
				dataRoot: candidate,
				benchmarksData,
			};
		} catch {
			// Try next candidate.
		}
	}

	throw new Error('Failed to resolve benchmark data path.');
}

async function init() {
	if (PAGE === 'settings') {
		renderSettings();
		return;
	}

	const { dataRoot, benchmarksData } = await resolveDataRoot();

	const currentScores = await loadJSON(`${dataRoot}/scores/current.json`).catch(() => ({ benchmarks: {} }));

	const appData = {
		dataRoot,
		benchmarksData,
		currentScores,
		benchmarkIndex: benchmarksData.benchmarks ?? [],
	};

	if (PAGE === 'home') {
		renderHome(appData);
		return;
	}

	if (PAGE === 'questions') {
		void renderQuestions(appData);
		return;
	}

	if (PAGE === 'results') {
		void renderResults(appData);
	}
}

function clampQuestionsPerPage(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return DEFAULT_QUESTIONS_PER_PAGE;
	}

	return Math.min(MAX_QUESTIONS_PER_PAGE, Math.max(MIN_QUESTIONS_PER_PAGE, Math.floor(parsed)));
}

function loadSettings() {
	const fallback = {
		questionsPerPage: DEFAULT_QUESTIONS_PER_PAGE,
		sortNumericChoices: DEFAULT_SORT_NUMERIC_CHOICES,
	};
	const raw = window.localStorage.getItem(SETTINGS_KEY);

	if (!raw) {
		return fallback;
	}

	try {
		const parsed = JSON.parse(raw);
		return {
			questionsPerPage: clampQuestionsPerPage(parsed?.questionsPerPage),
			sortNumericChoices:
				typeof parsed?.sortNumericChoices === 'boolean'
					? parsed.sortNumericChoices
					: DEFAULT_SORT_NUMERIC_CHOICES,
		};
	} catch {
		return fallback;
	}
}

function saveSettings(settings) {
	window.localStorage.setItem(
		SETTINGS_KEY,
		JSON.stringify({
			questionsPerPage: clampQuestionsPerPage(settings?.questionsPerPage),
			sortNumericChoices: Boolean(settings?.sortNumericChoices),
		}),
	);
}

function parseSortableChoiceValue(choice) {
	if (choice === null || choice === undefined) {
		return null;
	}

	const raw = String(choice).trim();
	if (!raw) {
		return null;
	}

	const normalized = raw.replaceAll(',', '');
	const numberPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
	const percentPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%$/i;

	if (percentPattern.test(normalized)) {
		return Number.parseFloat(normalized.slice(0, -1)) / 100;
	}

	if (numberPattern.test(normalized)) {
		return Number.parseFloat(normalized);
	}

	return null;
}

function sortQuestionChoicesForHumans(question, enabled) {
	if (!enabled) {
		return question;
	}

	const choices = question?.choices ?? [];
	if (choices.length < 2) {
		return question;
	}

	const parsedChoices = choices.map((choice, index) => ({
		index,
		choice,
		value: parseSortableChoiceValue(choice),
	}));

	if (parsedChoices.some((entry) => entry.value === null)) {
		return question;
	}

	const originalAnswerIndex = Number(question.answerIndex);
	if (!Number.isInteger(originalAnswerIndex)) {
		return question;
	}

	const sortedChoices = [...parsedChoices].sort((left, right) => left.value - right.value || left.index - right.index);
	const nextAnswerIndex = sortedChoices.findIndex((entry) => entry.index === originalAnswerIndex);

	if (nextAnswerIndex < 0) {
		return question;
	}

	return {
		...question,
		choices: sortedChoices.map((entry) => entry.choice),
		answerIndex: nextAnswerIndex,
	};
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
	return escapeHtml(value).replaceAll('`', '&#96;');
}

function sanitizeHref(rawHref) {
	const decoded = String(rawHref).replaceAll('&amp;', '&').trim();

	if (!decoded) {
		return '#';
	}

	try {
		const resolved = new URL(decoded, window.location.origin);
		if (["http:", "https:", "mailto:"].includes(resolved.protocol)) {
			return decoded;
		}
	} catch {
		return '#';
	}

	return '#';
}

function renderInlineMarkdown(value) {
	const escaped = escapeHtml(value);

	return escaped
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>')
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
			const safeHref = escapeAttribute(sanitizeHref(href));
			return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
		});
}

function renderMarkdown(value) {
	if (value === null || value === undefined) {
		return '';
	}

	const normalized = String(value).replace(/\r\n/g, '\n').trim();
	if (!normalized) {
		return '';
	}

	const blocks = normalized.split(/\n{2,}/);

	return blocks
		.map((block) => {
			const lines = block.split('\n').map((line) => line.trimEnd());
			const isUnorderedList = lines.every((line) => /^[-*]\s+/.test(line));

			if (isUnorderedList) {
				return `<ul>${lines
					.map((line) => `<li>${renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`)
					.join('')}</ul>`;
			}

			return `<p>${lines.map((line) => renderInlineMarkdown(line)).join('<br>')}</p>`;
		})
		.join('');
}

function renderMathIn(element) {
	if (!element || typeof window.renderMathInElement !== 'function') {
		return;
	}

	window.renderMathInElement(element, {
		delimiters: [
			{ left: '$$', right: '$$', display: true },
			{ left: '$', right: '$', display: false },
		],
		throwOnError: false,
		strict: 'ignore',
	});
}

function normalizeChoiceText(value) {
	return String(value)
		.trim()
		.replace(/^[a-z]\s*[\)\.\-:]\s*/i, '')
		.replace(/^\d+\s*[\)\.\-:]\s*/, '')
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

function stripDuplicatedChoiceLines(prompt, choices) {
	if (!prompt) {
		return '';
	}

	if (!Array.isArray(choices) || !choices.length) {
		return String(prompt);
	}

	const lines = String(prompt).split(/\r?\n/);
	if (lines.length <= 1) {
		return String(prompt);
	}

	const normalizedChoices = new Set(choices.map((choice) => normalizeChoiceText(choice)));

	const filteredLines = lines.filter((line, index) => {
		if (index === 0) {
			return true;
		}

		const normalizedLine = normalizeChoiceText(line);
		return !normalizedChoices.has(normalizedLine);
	});

	return filteredLines.join('\n');
}

function renderSettings() {
	const form = document.querySelector('[data-role="settings-form"]');
	const questionsPerPageInput = document.querySelector('[data-role="setting-questions-per-page"]');
	const sortNumericChoicesInput = document.querySelector('[data-role="setting-sort-numeric-choices"]');
	const status = document.querySelector('[data-role="settings-status"]');

	if (!form || !questionsPerPageInput || !sortNumericChoicesInput) {
		return;
	}

	const settings = loadSettings();
	questionsPerPageInput.min = String(MIN_QUESTIONS_PER_PAGE);
	questionsPerPageInput.max = String(MAX_QUESTIONS_PER_PAGE);
	questionsPerPageInput.value = String(settings.questionsPerPage);
	sortNumericChoicesInput.checked = Boolean(settings.sortNumericChoices);

	form.addEventListener('submit', (event) => {
		event.preventDefault();

		saveSettings({
			questionsPerPage: questionsPerPageInput.value,
			sortNumericChoices: sortNumericChoicesInput.checked,
		});

		if (status) {
			status.textContent = 'Settings saved.';
		}
	});
}

function getState() {
	return loadState();
}

function getBenchmark(benchmarks, benchmarkId) {
	return benchmarks.find((benchmark) => benchmark.id === benchmarkId) ?? null;
}

async function loadBenchmarkDetails(appData, benchmarkId) {
	const benchmarkMeta = getBenchmark(appData.benchmarkIndex, benchmarkId);

	if (!benchmarkMeta) {
		return null;
	}

	try {
		const benchmarkData = await loadJSON(`${appData.dataRoot}/benchmarks/${benchmarkMeta.file}`);
		return {
			...benchmarkMeta,
			...benchmarkData,
		};
	} catch {
		return benchmarkMeta;
	}
}

function getModels(benchmarkId, snapshot) {
	return getBenchmarkModels(snapshot, benchmarkId);
}

function getTopModel(models) {
	return [...models].sort((left, right) => right.score - left.score)[0] ?? null;
}

function summarizeToolPolicy(toolPolicy) {
	if (!toolPolicy) {
		return 'Tool policy is not specified for this benchmark.';
	}

	const modelAllowed = Boolean(toolPolicy.modelToolsAllowed);
	const humanAllowed = Boolean(toolPolicy.humanToolsAllowed);

	const allowedTools = (toolPolicy.allowedTools ?? []).filter(Boolean);
	const modelMessage = modelAllowed
		? allowedTools.length
			? `Model evaluations allowed tools: ${allowedTools.join(', ')}.`
			: 'Model evaluations allowed external tools.'
		: 'Model evaluations did not use external tools.';

	const humanMessage = humanAllowed
		? 'Human participants may use tools.'
		: 'Human participants should not use tools.';

	if (!toolPolicy.notes) {
		return `${modelMessage} ${humanMessage}`;
	}

	return `${modelMessage} ${humanMessage} ${toolPolicy.notes}`;
}

function renderHome(appData) {
	const benchmarkSelect = document.querySelector('[data-role="benchmark-select"]');
	const questionCountSelect = document.querySelector('[data-role="question-count"]');
	const preview = document.querySelector('[data-role="benchmark-preview"]');
	const scoreboard = document.querySelector('[data-role="scoreboard"]');
	const form = document.querySelector('[data-role="benchmark-form"]');
	const startButton = form.querySelector('button[type="submit"]');
	const { benchmarkIndex, benchmarksData, currentScores } = appData;

	const renderQuestionCounts = (benchmark) => {
		const availableQuestions = Number(benchmark.questionCount ?? benchmark.questions?.length ?? 0);

		if (availableQuestions <= 0) {
			questionCountSelect.value = '0';
			questionCountSelect.min = '0';
			questionCountSelect.max = '0';
			questionCountSelect.placeholder = 'No questions available';
			questionCountSelect.disabled = true;
			if (startButton) {
				startButton.disabled = true;
			}
			return;
		}

		const maxCount = availableQuestions;
		const currentValue = Number(questionCountSelect.value);
		const defaultValue = Math.min(10, maxCount);
		const nextValue = Number.isFinite(currentValue) && currentValue > 0 ? Math.min(currentValue, maxCount) : defaultValue;

		questionCountSelect.value = String(nextValue);
		questionCountSelect.min = '1';
		questionCountSelect.max = String(maxCount);
		questionCountSelect.placeholder = `1-${maxCount}`;
		questionCountSelect.disabled = false;
		if (startButton) {
			startButton.disabled = false;
		}
	};

	const renderPreview = (benchmark) => {
		const currentModels = getModels(benchmark.id, currentScores);
		const topCurrent = getTopModel(currentModels);

		preview.innerHTML = `
			<article class="panel panel--soft">
				<p class="eyebrow">Selected benchmark</p>
				<h2>${benchmark.name}</h2>
				<p>${benchmark.description}</p>
				<p>${summarizeToolPolicy(benchmark.toolPolicy)}</p>
				<dl class="stats-grid">
					<div>
						<dt>Question pool</dt>
						<dd>${benchmark.questionCount ?? benchmark.questions?.length ?? 'Unavailable'}</dd>
					</div>
					<div>
						<dt>Options</dt>
						<dd>${benchmark.options}</dd>
					</div>
					<div>
						<dt>Source</dt>
						<dd>${benchmark.source.dataset}${benchmark.source.subset ? ` / ${benchmark.source.subset}` : ''}</dd>
					</div>
					<div>
						<dt>Data refreshed</dt>
						<dd>${formatDate(benchmarksData.generatedAt)}</dd>
					</div>
				</dl>
			</article>
		`;

		scoreboard.innerHTML = `
			<article class="panel panel--soft">
				<p class="eyebrow">Stored scores</p>
				<h2>Current leaderboard</h2>
				<p>
					Top model this week: <strong>${topCurrent?.model ?? 'Unavailable'}</strong>
					(${topCurrent ? formatPercent(topCurrent.score) : 'n/a'})
				</p>
				<p>Comparisons use the current score snapshot from JSON.</p>
			</article>
		`;

		renderMathIn(preview);
	};

	benchmarkIndex.forEach((benchmark) => {
		const option = document.createElement('option');
		option.value = benchmark.id;
		option.textContent = benchmark.name;
		benchmarkSelect.appendChild(option);
	});

	const applySelection = async () => {
		const benchmark = getBenchmark(benchmarkIndex, benchmarkSelect.value) ?? benchmarkIndex[0];

		if (!benchmark) {
			return;
		}

		const benchmarkDetails = await loadBenchmarkDetails(appData, benchmark.id);
		renderQuestionCounts(benchmarkDetails ?? benchmark);
		renderPreview(benchmarkDetails ?? benchmark);
	};

	benchmarkSelect.addEventListener('change', applySelection);
	form.addEventListener('submit', async (event) => {
		event.preventDefault();

		const benchmark = getBenchmark(benchmarkIndex, benchmarkSelect.value) ?? benchmarkIndex[0];
		if (!benchmark) {
			return;
		}

		const benchmarkDetails = await loadBenchmarkDetails(appData, benchmark.id);
		if (!benchmarkDetails || !benchmarkDetails.questions) {
			return;
		}

		const questionCount = Number(questionCountSelect.value);
		const selectedQuestions = selectQuestions(benchmarkDetails, questionCount);

		saveState({
			benchmarkId: benchmark.id,
			questionCount,
			questionIds: selectedQuestions.map((question) => question.id),
			answers: {},
			currentQuestionPage: 1,
		});

		window.location.href = 'questions.html';
	});

	void applySelection();
}

async function renderQuestions(appData) {
	const state = getState();
	const settings = loadSettings();
	const questionsPerPage = clampQuestionsPerPage(settings.questionsPerPage);
	const sortNumericChoices = Boolean(settings.sortNumericChoices);
	const benchmark = state ? await loadBenchmarkDetails(appData, state.benchmarkId) : null;
	const container = document.querySelector('[data-role="questions-shell"]');
	const status = document.querySelector('[data-role="questions-status"]');

	if (!state || !benchmark) {
		window.location.href = 'index.html';
		return;
	}

	const selectedQuestions = benchmark.questions
		.filter((question) => state.questionIds.includes(question.id))
		.map((question) => sortQuestionChoicesForHumans(question, sortNumericChoices));
	const totalPages = Math.max(1, Math.ceil(selectedQuestions.length / questionsPerPage));
	let currentPage = Math.min(Math.max(Number(state.currentQuestionPage ?? 1), 1), totalPages);
	let draftAnswers = { ...(state.answers ?? {}) };

	const pageWindow = () => {
		const start = (currentPage - 1) * questionsPerPage;
		const end = start + questionsPerPage;
		return selectedQuestions.slice(start, end);
	};

	const collectCurrentPageResponses = () => {
		pageWindow().forEach((question) => {
			const selected = container.querySelector(`input[name="${question.id}"]:checked`);
			if (selected) {
				draftAnswers[question.id] = Number(selected.value);
			}
		});
	};

	const renderPage = () => {
		const currentQuestions = pageWindow();
		status.textContent = `${benchmark.name} · ${selectedQuestions.length} question${selectedQuestions.length === 1 ? '' : 's'} · page ${currentPage}/${totalPages}`;

		container.innerHTML = `
			<article class="panel panel--soft tool-policy-note">
				<p class="eyebrow">Tool policy</p>
				<p>${summarizeToolPolicy(benchmark.toolPolicy)}</p>
				${benchmark.toolPolicy?.notes ? `<p>${benchmark.toolPolicy.notes}</p>` : ''}
			</article>
			<form class="stack" data-role="question-form">
			${currentQuestions
				.map(
					(question, index) => `
						<fieldset class="question-card">
							<legend>
								<span class="question-number">Question ${(currentPage - 1) * questionsPerPage + index + 1}</span>
								<div class="question-prompt markdown-content">${renderMarkdown(stripDuplicatedChoiceLines(question.prompt, question.choices))}</div>
							</legend>
							<div class="choice-list">
								${question.choices
									.map(
										(choice, choiceIndex) => `
											<label class="choice-item">
												<input
													type="radio"
													name="${escapeAttribute(question.id)}"
													value="${choiceIndex}"
													${draftAnswers?.[question.id] === choiceIndex ? 'checked' : ''}
												/>
												<span>${renderInlineMarkdown(choice)}</span>
											</label>
										`,
									)
									.join('')}
							</div>
						</fieldset>
					`,
				)
				.join('')}
			<div class="actions-row questions-actions-row">
				<a class="button button--ghost" href="index.html">Choose a different benchmark</a>
				<div class="actions-row">
					<button class="button button--ghost" type="button" data-role="prev-page" ${currentPage === 1 ? 'disabled' : ''}>Previous page</button>
					${currentPage < totalPages ? '<button class="button" type="button" data-role="next-page">Next page</button>' : '<button class="button" type="submit">Score my answers</button>'}
				</div>
			</div>
		</form>
		`;

		const form = container.querySelector('[data-role="question-form"]');
		const prevButton = container.querySelector('[data-role="prev-page"]');
		const nextButton = container.querySelector('[data-role="next-page"]');

		prevButton?.addEventListener('click', () => {
			collectCurrentPageResponses();
			currentPage = Math.max(1, currentPage - 1);
			saveState({
				...state,
				answers: draftAnswers,
				currentQuestionPage: currentPage,
			});
			renderPage();
		});

		nextButton?.addEventListener('click', () => {
			collectCurrentPageResponses();
			currentPage = Math.min(totalPages, currentPage + 1);
			saveState({
				...state,
				answers: draftAnswers,
				currentQuestionPage: currentPage,
			});
			renderPage();
		});

		form.addEventListener('submit', (event) => {
			event.preventDefault();
			collectCurrentPageResponses();

			const score = scoreBenchmark(benchmark, selectedQuestions, draftAnswers);
			const currentModels = getModels(benchmark.id, appData.currentScores);

			saveState({
				...state,
				answers: draftAnswers,
				currentQuestionPage: 1,
				completedAt: new Date().toISOString(),
				score,
				currentModels,
			});

			window.location.href = 'results.html';
		});

		renderMathIn(container);
	};

	renderPage();
}

async function renderResults(appData) {
	const state = getState();
	const benchmark = state ? await loadBenchmarkDetails(appData, state.benchmarkId) : null;
	const summary = document.querySelector('[data-role="result-summary"]');
	const leaderboard = document.querySelector('[data-role="leaderboard"]');
	const review = document.querySelector('[data-role="review"]');
	const meta = document.querySelector('[data-role="results-meta"]');

	if (!state || !benchmark || !state.score) {
		window.location.href = 'index.html';
		return;
	}

	const selectedQuestions = benchmark.questions.filter((question) =>
		state.questionIds.includes(question.id),
	);
	const currentModels = state.currentModels ?? getModels(benchmark.id, appData.currentScores);
	const comparisons = compareAgainstModels(state.score, currentModels);
	const userLeaderboard = buildLeaderboard(state.score, currentModels);
	const currentRank = userLeaderboard.find((entry) => entry.isUser)?.estimatedRank ?? null;

	meta.innerHTML = `
		<p class="eyebrow">${benchmark.name}</p>
		<h1>Your benchmark result</h1>
		<p>
			${selectedQuestions.length} question${selectedQuestions.length === 1 ? '' : 's'} answered ·
			finished ${formatDate(state.completedAt)}
		</p>
	`;

	summary.innerHTML = `
		<article class="panel panel--accent">
			<div class="score-ring">
				<strong>${formatPercent(state.score.accuracy)}</strong>
				<span>${state.score.correctCount}/${state.score.totalQuestions} correct</span>
			</div>
			<div class="summary-copy">
				<p>Your estimated margin of error is ±${formatPercent(state.score.margin)}.</p>
				<p>
					Confidence band: ${formatPercent(state.score.lowerBound)} to ${formatPercent(state.score.upperBound)}.
				</p>
				<p>
					Estimated rank against current model scores: <strong>${currentRank ? formatRank(currentRank) : 'n/a'}</strong>.
				</p>
			</div>
		</article>
	`;

	leaderboard.innerHTML = `
		<article class="panel">
			<div class="panel-heading">
				<h2>Current leaderboard comparison</h2>
				<p>Sorted by the current stored scores for this benchmark.</p>
			</div>
			<div class="table-wrap">
				<table class="score-table">
					<thead>
						<tr>
							<th>Rank</th>
							<th>Model</th>
							<th>Current</th>
							<th>You vs model</th>
						</tr>
					</thead>
					<tbody>
						${comparisons
							.map((comparison) => {
								const verdictClass = `verdict--${comparison.verdict}`;
								return `
									<tr>
										<td>${formatRank(comparison.rank)}</td>
										<td>${comparison.model}</td>
										<td>${formatPercent(comparison.score)}</td>
										<td><span class="verdict ${verdictClass}">${verdictLabel(comparison.verdict)}</span></td>
									</tr>
								`;
							})
							.join('')}
					</tbody>
				</table>
			</div>
		</article>
	`;

	review.innerHTML = `
		<article class="panel">
			<div class="panel-heading">
				<h2>Question review</h2>
				<p>See how each answer contributed to the final score.</p>
			</div>
			<div class="review-list">
				${state.score.reviewedQuestions
					.map((question, index) => {
						const selected =
							question.selectedIndex === null
								? 'No answer selected'
								: question.choices[question.selectedIndex];

						return `
							<section class="review-item ${question.isCorrect ? 'review-item--correct' : 'review-item--wrong'}">
								<div>
									<p class="eyebrow">Question ${index + 1}</p>
									<div class="markdown-content review-prompt">${renderMarkdown(stripDuplicatedChoiceLines(question.prompt, question.choices))}</div>
								</div>
								<dl class="stats-grid stats-grid--compact">
									<div>
										<dt>Your answer</dt>
										<dd>${renderInlineMarkdown(selected)}</dd>
									</div>
									<div>
										<dt>Correct answer</dt>
										<dd>${renderInlineMarkdown(question.choices[question.answerIndex])}</dd>
									</div>
								</dl>
								<div class="markdown-content">${renderMarkdown(question.explanation)}</div>
							</section>
						`;
					})
					.join('')}
			</div>
		</article>
	`;

	renderMathIn(review);
}
