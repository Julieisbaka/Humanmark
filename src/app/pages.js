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
} from '../score.js';
import {
	MAX_QUESTIONS_PER_PAGE,
	MIN_QUESTIONS_PER_PAGE,
	clampQuestionsPerPage,
	escapeAttribute,
	escapeHtml,
	getBenchmark,
	loadBenchmarkDetails,
	loadSettings,
	renderInlineMarkdown,
	renderMarkdown,
	renderMathIn,
	resolveDataRoot,
	saveSettings,
	sortQuestionChoicesForHumans,
	stripDuplicatedChoiceLines,
	summarizeToolPolicy,
} from './shared.js';

const PAGE = document.body.dataset.page;

function getState() {
	return loadState();
}

function getModels(benchmarkId, snapshot) {
	return getBenchmarkModels(snapshot, benchmarkId);
}

function getTopModel(models) {
	return [...models].sort((left, right) => right.score - left.score)[0] ?? null;
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

function renderHome(appData) {
	const benchmarkSelect = document.querySelector('[data-role="benchmark-select"]');
	const questionCountSelect = document.querySelector('[data-role="question-count"]');
	const preview = document.querySelector('[data-role="benchmark-preview"]');
	const scoreboard = document.querySelector('[data-role="scoreboard"]');
	const form = document.querySelector('[data-role="benchmark-form"]');
	const startButton = form?.querySelector('button[type="submit"]');
	const { benchmarkIndex, benchmarksData, currentScores } = appData;

	if (!benchmarkSelect || !questionCountSelect || !preview || !scoreboard || !form) {
		return;
	}

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

	if (!state || !benchmark || !container || !status) {
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

		form?.addEventListener('submit', (event) => {
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

	if (!state || !benchmark || !state.score || !summary || !leaderboard || !review || !meta) {
		window.location.href = 'index.html';
		return;
	}

	const selectedQuestions = benchmark.questions.filter((question) =>
		state.questionIds.includes(question.id),
	);
	const currentModels = state.currentModels ?? getModels(benchmark.id, appData.currentScores);
	const comparisons = compareAgainstModels(state.score, currentModels);
	const userLeaderboard = buildLeaderboard(state.score, currentModels);
	const comparisonByModelKey = new Map(
		comparisons.map((comparison) => [String(comparison.modelId ?? comparison.model), comparison]),
	);
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
				<span>${state.score.scoreLabel ?? 'Score'}</span>
			</div>
			<div class="summary-copy">
				<p>
					Correct answers: ${state.score.correctCount}/${state.score.totalQuestions}
					(${formatPercent(state.score.correctnessAccuracy ?? state.score.accuracy)}).
				</p>
				<p>Your estimated margin of error is ±${formatPercent(state.score.margin)}.</p>
				<p>
					Confidence band: ${formatPercent(state.score.lowerBound)} to ${formatPercent(state.score.upperBound)}.
				</p>
				${state.score.method === 'arc_pmi' ? `<p>ARC PMI scoring is normalized to 0-1 per question when probability inputs exist.</p>` : ''}
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
			<div class="leaderboard-controls">
				<label class="field">
					<span>Search model</span>
					<input type="search" data-role="leaderboard-search" placeholder="e.g. GPT, Claude, Gemini" />
				</label>
				<label class="field">
					<span>Filter</span>
					<select data-role="leaderboard-filter">
						<option value="all">All rows</option>
						<option value="models">Models only</option>
						<option value="you">You only</option>
						<option value="above">Models you are above</option>
						<option value="within">Models overlapping your confidence band</option>
						<option value="below">Models above your confidence band</option>
					</select>
				</label>
			</div>
			<p class="leaderboard-summary" data-role="leaderboard-summary"></p>
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
					<tbody data-role="leaderboard-body"></tbody>
				</table>
			</div>
		</article>
	`;

	const leaderboardSearch = leaderboard.querySelector('[data-role="leaderboard-search"]');
	const leaderboardFilter = leaderboard.querySelector('[data-role="leaderboard-filter"]');
	const leaderboardBody = leaderboard.querySelector('[data-role="leaderboard-body"]');
	const leaderboardSummary = leaderboard.querySelector('[data-role="leaderboard-summary"]');

	const renderLeaderboardRows = () => {
		const query = String(leaderboardSearch?.value ?? '')
			.trim()
			.toLowerCase();
		const filterValue = String(leaderboardFilter?.value ?? 'all');

		const filteredRows = userLeaderboard.filter((entry) => {
			const modelName = String(entry.model ?? '').toLowerCase();
			if (query && !modelName.includes(query)) {
				return false;
			}

			if (filterValue === 'all') {
				return true;
			}

			if (filterValue === 'models') {
				return !entry.isUser;
			}

			if (filterValue === 'you') {
				return entry.isUser;
			}

			if (entry.isUser) {
				return false;
			}

			const comparison = comparisonByModelKey.get(String(entry.modelId ?? entry.model));
			return comparison?.verdict === filterValue;
		});

		if (leaderboardSummary) {
			leaderboardSummary.textContent = `${filteredRows.length} row${filteredRows.length === 1 ? '' : 's'} shown. "You" rank is temporary for this run and is not saved.`;
		}

		if (!leaderboardBody) {
			return;
		}

		leaderboardBody.innerHTML = filteredRows
			.map((entry) => {
				if (entry.isUser) {
					return `
						<tr class="leaderboard-you-row">
							<td>${formatRank(entry.estimatedRank)}</td>
							<td><strong>You</strong> <span class="leaderboard-you-tag">Current run</span></td>
							<td>${formatPercent(entry.score)}</td>
							<td><span class="verdict verdict--within">Temporary rank</span></td>
						</tr>
					`;
				}

				const comparison = comparisonByModelKey.get(String(entry.modelId ?? entry.model));
				const verdict = comparison?.verdict ?? 'within';
				const verdictClass = `verdict--${verdict}`;

				return `
					<tr>
						<td>${formatRank(entry.estimatedRank)}</td>
						<td>${escapeHtml(entry.model ?? 'Unknown model')}</td>
						<td>${formatPercent(entry.score)}</td>
						<td><span class="verdict ${verdictClass}">${verdictLabel(verdict)}</span></td>
					</tr>
				`;
			})
			.join('');
	};

	leaderboardSearch?.addEventListener('input', renderLeaderboardRows);
	leaderboardFilter?.addEventListener('change', renderLeaderboardRows);
	renderLeaderboardRows();

	review.innerHTML = `
		<article class="panel">
			<div class="panel-heading">
				<h2>Question review</h2>
				<p>See how each answer contributed to the final score.</p>
			</div>
			<div class="review-list">
				${state.score.reviewedQuestions
					.map((question, index) => {
						const explanation =
							question.explanation ??
							question.answerExplanation ??
							question.rationale ??
							question.solution ??
							question.analysis ??
							'';
						const explanationMarkup = String(explanation).trim()
							? `<div class="review-explanation"><p class="eyebrow">Benchmark explanation</p><div class="markdown-content">${renderMarkdown(explanation)}</div></div>`
							: '';
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
								${explanationMarkup}
							</section>
						`;
					})
					.join('')}
			</div>
		</article>
	`;

	renderMathIn(review);
}

export async function init() {
	if (PAGE === 'settings') {
		renderSettings();
		return;
	}

	const { dataRoot, benchmarksData } = await resolveDataRoot();
	const currentScores = await fetch(new URL(`${dataRoot}/scores/current.json`, window.location.href))
		.then((response) => (response.ok ? response.json() : { benchmarks: {} }))
		.catch(() => ({ benchmarks: {} }));

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
