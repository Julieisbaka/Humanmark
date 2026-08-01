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

function renderHome(appData) {
	const benchmarkSelect = document.querySelector('[data-role="benchmark-select"]');
	const questionCountSelect = document.querySelector('[data-role="question-count"]');
	const preview = document.querySelector('[data-role="benchmark-preview"]');
	const scoreboard = document.querySelector('[data-role="scoreboard"]');
	const form = document.querySelector('[data-role="benchmark-form"]');
	const { benchmarkIndex, benchmarksData, currentScores } = appData;

	const renderQuestionCounts = (benchmark) => {
		const maxCount = Math.max(1, Math.min(benchmark.questionCount ?? benchmark.questions?.length ?? 1, 10));
		questionCountSelect.value = String(maxCount);
		questionCountSelect.min = '1';
		questionCountSelect.max = String(maxCount);
		questionCountSelect.placeholder = `1-${maxCount}`;
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
		});

		window.location.href = 'questions.html';
	});

	void applySelection();
}

async function renderQuestions(appData) {
	const state = getState();
	const benchmark = state ? await loadBenchmarkDetails(appData, state.benchmarkId) : null;
	const container = document.querySelector('[data-role="questions-shell"]');
	const status = document.querySelector('[data-role="questions-status"]');

	if (!state || !benchmark) {
		window.location.href = 'index.html';
		return;
	}

	const selectedQuestions = benchmark.questions.filter((question) =>
		state.questionIds.includes(question.id),
	);

	status.textContent = `${benchmark.name} · ${selectedQuestions.length} question${selectedQuestions.length === 1 ? '' : 's'}`;

	container.innerHTML = `
		<form class="stack" data-role="question-form">
			${selectedQuestions
				.map(
					(question, index) => `
						<fieldset class="question-card">
							<legend>
								<span class="question-number">Question ${index + 1}</span>
								<span class="question-prompt">${question.prompt}</span>
							</legend>
							<div class="choice-list">
								${question.choices
									.map(
										(choice, choiceIndex) => `
											<label class="choice-item">
												<input
													type="radio"
													name="${question.id}"
													value="${choiceIndex}"
													${state.answers?.[question.id] === choiceIndex ? 'checked' : ''}
												/>
												<span>${choice}</span>
											</label>
										`,
									)
									.join('')}
							</div>
						</fieldset>
					`,
				)
				.join('')}
			<div class="actions-row">
				<a class="button button--ghost" href="index.html">Choose a different benchmark</a>
				<button class="button" type="submit">Score my answers</button>
			</div>
		</form>
	`;

	const form = container.querySelector('[data-role="question-form"]');

	form.addEventListener('submit', (event) => {
		event.preventDefault();

		const responses = {};

		selectedQuestions.forEach((question) => {
			const selected = container.querySelector(`input[name="${question.id}"]:checked`);
			if (selected) {
				responses[question.id] = Number(selected.value);
			}
		});

		const score = scoreBenchmark(benchmark, selectedQuestions, responses);
		const currentModels = getModels(benchmark.id, currentScores);

		saveState({
			...state,
			answers: responses,
			completedAt: new Date().toISOString(),
			score,
			currentModels,
		});

		window.location.href = 'results.html';
	});
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
									<h3>${question.prompt}</h3>
								</div>
								<dl class="stats-grid stats-grid--compact">
									<div>
										<dt>Your answer</dt>
										<dd>${selected}</dd>
									</div>
									<div>
										<dt>Correct answer</dt>
										<dd>${question.choices[question.answerIndex]}</dd>
									</div>
								</dl>
								<p>${question.explanation}</p>
							</section>
						`;
					})
					.join('')}
			</div>
		</article>
	`;
}
