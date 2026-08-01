import {
	buildLeaderboard,
	compareAgainstModels,
	formatDate,
	formatDelta,
	formatPercent,
	formatRank,
	getBenchmarkModels,
	loadState,
	saveState,
	scoreBenchmark,
	selectQuestions,
	verdictLabel,
} from './score.js';

const DATA_ROOT = '../data';

const PAGE = document.body.dataset.page;

document.addEventListener('DOMContentLoaded', () => {
	void init();
});

async function loadJSON(relativePath) {
	const response = await fetch(new URL(relativePath, window.location.href));

	if (!response.ok) {
		throw new Error(`Failed to load ${relativePath}: ${response.status} ${response.statusText}`);
	}

	return response.json();
}

async function init() {
	const [benchmarksData, currentScores, lastWeekScores] = await Promise.all([
		loadJSON(`${DATA_ROOT}/benchmarks/index.json`),
		loadJSON(`${DATA_ROOT}/scores/current.json`),
		loadJSON(`${DATA_ROOT}/scores/last_week.json`),
	]);

	const benchmarks = await Promise.all(
		(benchmarksData.benchmarks ?? []).map((benchmark) =>
			loadJSON(`${DATA_ROOT}/benchmarks/${benchmark.file}`),
		),
	);

	const appData = {
		benchmarksData,
		currentScores,
		lastWeekScores,
		benchmarks,
	};

	if (PAGE === 'home') {
		renderHome(appData);
		return;
	}

	if (PAGE === 'questions') {
		renderQuestions(appData);
		return;
	}

	if (PAGE === 'results') {
		renderResults(appData);
	}
}

function getState() {
	return loadState();
}

function getBenchmark(benchmarks, benchmarkId) {
	return benchmarks.find((benchmark) => benchmark.id === benchmarkId) ?? null;
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
	const { benchmarks, benchmarksData, currentScores, lastWeekScores } = appData;

	const renderQuestionCounts = (benchmark) => {
		questionCountSelect.innerHTML = '';

		const maxCount = Math.min(benchmark.questions.length, 10);

		for (let count = 1; count <= maxCount; count += 1) {
			const option = document.createElement('option');
			option.value = String(count);
			option.textContent = `${count} question${count === 1 ? '' : 's'}`;
			questionCountSelect.appendChild(option);
		}
	};

	const renderPreview = (benchmark) => {
		const currentModels = getModels(benchmark.id, currentScores);
		const previousModels = getModels(benchmark.id, lastWeekScores);
		const topCurrent = getTopModel(currentModels);
		const topPrevious = getTopModel(previousModels);

		preview.innerHTML = `
			<article class="panel panel--soft">
				<p class="eyebrow">Selected benchmark</p>
				<h2>${benchmark.name}</h2>
				<p>${benchmark.description}</p>
				<dl class="stats-grid">
					<div>
						<dt>Question pool</dt>
						<dd>${benchmark.questions.length}</dd>
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
				<p>
					Last week: <strong>${topPrevious?.model ?? 'Unavailable'}</strong>
					(${topPrevious ? formatPercent(topPrevious.score) : 'n/a'})
				</p>
				<p>Comparisons use current and previous score snapshots from JSON.</p>
			</article>
		`;
	};

	benchmarks.forEach((benchmark) => {
		const option = document.createElement('option');
		option.value = benchmark.id;
		option.textContent = benchmark.name;
		benchmarkSelect.appendChild(option);
	});

	const applySelection = () => {
		const benchmark = getBenchmark(benchmarkSelect.value) ?? benchmarks[0];

		if (!benchmark) {
			return;
		}

		renderQuestionCounts(benchmark);
		renderPreview(benchmark);
	};

	benchmarkSelect.addEventListener('change', applySelection);
	form.addEventListener('submit', (event) => {
		event.preventDefault();

		const benchmark = getBenchmark(benchmarkSelect.value) ?? benchmarks[0];
		const questionCount = Number(questionCountSelect.value);
		const selectedQuestions = selectQuestions(benchmark, questionCount);

		saveState({
			benchmarkId: benchmark.id,
			questionCount,
			questionIds: selectedQuestions.map((question) => question.id),
			answers: {},
		});

		window.location.href = 'questions.html';
	});

	applySelection();
}

function renderQuestions(appData) {
	const state = getState();
	const benchmark = state ? getBenchmark(appData.benchmarks, state.benchmarkId) : null;
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
		const previousModels = getModels(benchmark.id, lastWeekScores);

		saveState({
			...state,
			answers: responses,
			completedAt: new Date().toISOString(),
			score,
			currentModels,
			previousModels,
		});

		window.location.href = 'results.html';
	});
}

function renderResults(appData) {
	const state = getState();
	const benchmark = state ? getBenchmark(appData.benchmarks, state.benchmarkId) : null;
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
	const previousModels = state.previousModels ?? getModels(benchmark.id, appData.lastWeekScores);
	const comparisons = compareAgainstModels(state.score, currentModels, previousModels);
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
							<th>Last week</th>
							<th>Change</th>
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
										<td>${comparison.previousScore === null ? '—' : formatPercent(comparison.previousScore)}</td>
										<td>${comparison.previousScore === null ? '—' : formatDelta(comparison.weekDelta)}</td>
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
