import { formatDate, formatPercent, scoreBenchmark, selectQuestions } from '../score.js';
import { getBenchmark, loadBenchmarkDetails, renderMathIn, summarizeToolPolicy } from './shared.js';
import { getModels, getTopModel } from './runtime.js';
import { createLatestTaskGuard } from './shared/async-guard.js';
import { logAppEvent, logAppWarning } from './shared/telemetry.js';

export function renderHome(appData) {
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

	const renderPreview = (benchmark, options = {}) => {
		const detailLoadFailed = Boolean(options.detailLoadFailed);
		const currentModels = getModels(benchmark.id, currentScores);
		const topCurrent = getTopModel(currentModels);

		preview.innerHTML = `
			<article class="panel panel--soft">
				<p class="eyebrow">Selected benchmark</p>
				<h2>${benchmark.name}</h2>
				<p>${benchmark.description}</p>
				${detailLoadFailed ? '<p class="eyebrow">Detailed benchmark data could not be loaded right now. Showing index metadata only.</p>' : ''}
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

	const selectionGuard = createLatestTaskGuard();

	const applySelection = async () => {
		const token = selectionGuard.nextToken();
		const benchmark = getBenchmark(benchmarkIndex, benchmarkSelect.value) ?? benchmarkIndex[0];

		if (!benchmark) {
			return;
		}

		logAppEvent('home.selection.start', {
			scope: 'home',
			outcome: 'start',
			benchmarkId: benchmark.id,
		});

		renderQuestionCounts(benchmark);
		renderPreview(benchmark);

		const benchmarkDetails = await loadBenchmarkDetails(appData, benchmark.id);
		if (!selectionGuard.isLatest(token)) {
			logAppWarning('home.selection.discardedStale', {
				scope: 'home',
				outcome: 'discarded',
				benchmarkId: benchmark.id,
			});
			return;
		}

		const detailLoadFailed = benchmarkDetails === benchmark || !Array.isArray(benchmarkDetails?.questions);
		renderQuestionCounts(benchmarkDetails ?? benchmark);
		renderPreview(benchmarkDetails ?? benchmark, { detailLoadFailed });

		logAppEvent('home.selection.complete', {
			scope: 'home',
			outcome: detailLoadFailed ? 'fallback' : 'success',
			benchmarkId: benchmark.id,
			detailLoadFailed,
		});
	};

	benchmarkSelect.addEventListener('change', () => {
		void applySelection();
	});

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		selectionGuard.invalidate();

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

		window.localStorage.setItem('humanmark-benchmark-state', JSON.stringify({
			benchmarkId: benchmark.id,
			questionCount,
			questionIds: selectedQuestions.map((question) => question.id),
			answers: {},
			currentQuestionPage: 1,
		}));

		window.location.href = 'questions.html';
	});

	void applySelection();
}
