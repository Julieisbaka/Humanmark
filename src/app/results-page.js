import { buildLeaderboard, compareAgainstModels, formatDate, formatPercent, formatRank, verdictLabel, getBenchmarkModels } from '../score.js';
import { escapeHtml, loadBenchmarkDetails, renderImageGallery, renderInlineMarkdown, renderMarkdown, renderMathIn, stripDuplicatedChoiceLines } from './shared.js';
import { getModels, getState } from './runtime.js';

const DEFAULT_LEADERBOARD_LIMIT = 100;
const LEADERBOARD_CONTEXT_WINDOW = 5;

export async function renderResults(appData) {
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

	const selectedQuestions = benchmark.questions.filter((question) => state.questionIds.includes(question.id));
	const currentModels = state.currentModels ?? getModels(benchmark.id, appData.currentScores);
	const comparisons = compareAgainstModels(state.score, currentModels);
	const userLeaderboard = buildLeaderboard(state.score, currentModels);
	const comparisonByModelKey = new Map(comparisons.map((comparison) => [String(comparison.modelId ?? comparison.model), comparison]));
	const currentRank = userLeaderboard.find((entry) => entry.isUser)?.estimatedRank ?? null;
	const userIndex = userLeaderboard.findIndex((entry) => entry.isUser);
	let showAllLeaderboardRows = false;

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
			<div class="leaderboard-actions" data-role="leaderboard-actions" hidden>
				<button class="button button--ghost" type="button" data-role="leaderboard-show-more">Show more models</button>
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
					<tbody data-role="leaderboard-body"></tbody>
				</table>
			</div>
		</article>
	`;

	const leaderboardSearch = leaderboard.querySelector('[data-role="leaderboard-search"]');
	const leaderboardFilter = leaderboard.querySelector('[data-role="leaderboard-filter"]');
	const leaderboardBody = leaderboard.querySelector('[data-role="leaderboard-body"]');
	const leaderboardSummary = leaderboard.querySelector('[data-role="leaderboard-summary"]');
	const leaderboardActions = leaderboard.querySelector('[data-role="leaderboard-actions"]');
	const leaderboardShowMore = leaderboard.querySelector('[data-role="leaderboard-show-more"]');

	const getDefaultVisibleRows = () => {
		const visibleRowIndexes = new Set();
		const maxTopRows = Math.min(DEFAULT_LEADERBOARD_LIMIT, userLeaderboard.length);

		for (let index = 0; index < maxTopRows; index += 1) {
			visibleRowIndexes.add(index);
		}

		if (userIndex >= 0) {
			const start = Math.max(0, userIndex - LEADERBOARD_CONTEXT_WINDOW);
			const end = Math.min(userLeaderboard.length - 1, userIndex + LEADERBOARD_CONTEXT_WINDOW);

			for (let index = start; index <= end; index += 1) {
				visibleRowIndexes.add(index);
			}
		}

		return userLeaderboard.filter((_, index) => visibleRowIndexes.has(index));
	};

	const renderLeaderboardRows = () => {
		const query = String(leaderboardSearch?.value ?? '').trim().toLowerCase();
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

		const limitedRows = getDefaultVisibleRows();
		const useDefaultLimit = !showAllLeaderboardRows && !query && filterValue === 'all';
		const rowsToRender = useDefaultLimit ? limitedRows : filteredRows;
		const hiddenDefaultCount = Math.max(0, userLeaderboard.length - limitedRows.length);

		if (leaderboardSummary) {
			if (useDefaultLimit && hiddenDefaultCount > 0) {
				leaderboardSummary.textContent = `Showing the top ${Math.min(DEFAULT_LEADERBOARD_LIMIT, userLeaderboard.length)} models and ${LEADERBOARD_CONTEXT_WINDOW} models around your rank. ${hiddenDefaultCount} more row${hiddenDefaultCount === 1 ? '' : 's'} are hidden.`;
			} else {
				leaderboardSummary.textContent = `${rowsToRender.length} row${rowsToRender.length === 1 ? '' : 's'} shown.`;
			}
		}

		if (leaderboardActions && leaderboardShowMore) {
			const shouldShowAction = useDefaultLimit && hiddenDefaultCount > 0;
			leaderboardActions.hidden = !shouldShowAction;
			leaderboardShowMore.textContent = shouldShowAction
				? `Show more models (${hiddenDefaultCount} hidden)`
				: 'Show more models';
		}

		if (!leaderboardBody) {
			return;
		}

		leaderboardBody.innerHTML = rowsToRender
			.map((entry) => {
				if (entry.isUser) {
					return `
						<tr class="leaderboard-you-row">
							<td>${formatRank(entry.estimatedRank)}</td>
							<td><strong>You</strong></td>
							<td>${formatPercent(entry.score)}</td>
							<td><span class="verdict verdict--within">Shown for this run</span></td>
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
	leaderboardShowMore?.addEventListener('click', () => {
		showAllLeaderboardRows = true;
		renderLeaderboardRows();
	});
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
						const explanation = question.explanation ?? question.answerExplanation ?? question.rationale ?? question.solution ?? question.analysis ?? '';
						const explanationMarkup = String(explanation).trim()
							? `<details class="review-explanation"><summary><span class="eyebrow">Benchmark explanation</span><span class="review-explanation-toggle">Show explanation</span></summary><div class="markdown-content">${renderMarkdown(explanation)}</div></details>`
							: '';
						const mediaMarkup = renderImageGallery(question.media, 'review-media');
						const selected = question.selectedIndex === null ? 'No answer selected' : question.choices[question.selectedIndex];

						return `
							<section class="review-item ${question.isCorrect ? 'review-item--correct' : 'review-item--wrong'}">
								<div>
									<p class="eyebrow">Question ${index + 1}</p>
									<div class="markdown-content review-prompt">${renderMarkdown(stripDuplicatedChoiceLines(question.prompt, question.choices))}</div>
									${mediaMarkup}
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
