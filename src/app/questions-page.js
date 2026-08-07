import { scoreBenchmark } from '../score.js';
import { escapeAttribute, loadBenchmarkDetails, loadSettings, renderImageGallery, renderInlineMarkdown, renderMarkdown, renderMathIn, sortQuestionChoicesForHumans, stripDuplicatedChoiceLines, numberStandaloneBulletLists, summarizeToolPolicy, clampQuestionsPerPage } from './shared.js';
import { getModels, getState } from './runtime.js';
import { saveState } from '../score.js';

function normalizeCrossedOutChoices(value) {
	if (!value || typeof value !== 'object') {
		return {};
	}

	const normalized = {};

	for (const [questionId, crossedChoices] of Object.entries(value)) {
		const uniqueChoices = [...new Set((Array.isArray(crossedChoices) ? crossedChoices : [])
			.map((choice) => Number(choice))
			.filter((choice) => Number.isInteger(choice) && choice >= 0))]
			.sort((left, right) => left - right);

		if (uniqueChoices.length) {
			normalized[questionId] = uniqueChoices;
		}
	}

	return normalized;
}

export async function renderQuestions(appData) {
	const state = getState();
	const settings = loadSettings();
	const questionsPerPage = clampQuestionsPerPage(settings.questionsPerPage);
	const sortNumericChoices = Boolean(settings.sortNumericChoices);
	const benchmark = state ? await loadBenchmarkDetails(appData, state.benchmarkId) : null;
	const container = document.querySelector('[data-role="questions-shell"]');
	const status = document.querySelector('[data-role="questions-status"]');
	const standardizedAnswerMode = benchmark?.scoring?.mode === 'standardized-answer';
	let draftCrossedOutChoices = normalizeCrossedOutChoices(state?.crossedOutChoices);

	if (!state || !benchmark || !container || !status) {
		window.location.href = 'index.html';
		return;
	}

	if (!Array.isArray(benchmark.questions) || benchmark.questions.length === 0) {
		status.textContent = `${benchmark.name} · unavailable`;
		container.innerHTML = `
			<article class="panel panel--soft">
				<p class="eyebrow">Questions unavailable</p>
				<p>We couldn\'t load the full question set for this benchmark right now.</p>
				<div class="actions-row">
					<a class="button button--ghost" href="index.html">Return home</a>
				</div>
			</article>
		`;
		return;
	}

	const selectedQuestions = benchmark.questions
		.filter((question) => state.questionIds.includes(question.id))
		.map((question) => sortQuestionChoicesForHumans(question, sortNumericChoices));
	const totalPages = Math.max(1, Math.ceil(selectedQuestions.length / questionsPerPage));
	let currentPage = Math.min(Math.max(Number(state.currentQuestionPage ?? 1), 1), totalPages);
	let draftAnswers = { ...(state.answers ?? {}) };
	let pendingCrossoutSaveTimer = null;

	const persistProgress = (overrides = {}) => {
		saveState({
			...state,
			answers: draftAnswers,
			crossedOutChoices: draftCrossedOutChoices,
			currentQuestionPage: currentPage,
			...overrides,
		});
	};

	const pageWindow = () => {
		const start = (currentPage - 1) * questionsPerPage;
		const end = start + questionsPerPage;
		return selectedQuestions.slice(start, end);
	};

	const collectCurrentPageResponses = () => {
		pageWindow().forEach((question) => {
			if (standardizedAnswerMode) {
				const selected = container.querySelector(`input[name="${question.id}"]`);
				if (selected) {
					draftAnswers[question.id] = String(selected.value ?? '').trim();
				}
				return;
			}

			const selected = container.querySelector(`input[name="${question.id}"]:checked`);
			if (selected) {
				draftAnswers[question.id] = Number(selected.value);
			}
		});
	};

	const scrollToPageStart = () => {
		status.scrollIntoView({ block: 'start', behavior: 'auto' });
	};

	const scheduleCrossoutSave = () => {
		if (pendingCrossoutSaveTimer !== null) {
			window.clearTimeout(pendingCrossoutSaveTimer);
		}

		pendingCrossoutSaveTimer = window.setTimeout(() => {
			pendingCrossoutSaveTimer = null;
			persistProgress();
		}, 150);
	};

	const flushPendingCrossoutSave = () => {
		if (pendingCrossoutSaveTimer === null) {
			return;
		}

		window.clearTimeout(pendingCrossoutSaveTimer);
		pendingCrossoutSaveTimer = null;
		persistProgress();
	};

	const renderPage = () => {
		const currentQuestions = pageWindow();
		status.textContent = `${benchmark.name} · ${selectedQuestions.length} question${selectedQuestions.length === 1 ? '' : 's'} · page ${currentPage}/${totalPages}`;

		container.innerHTML = `
			<article class="panel panel--soft tool-policy-note">
				<p class="eyebrow">Tool policy</p>
				<p>${summarizeToolPolicy(benchmark.toolPolicy)}</p>
			</article>
			${standardizedAnswerMode ? `
				<article class="panel panel--soft aime-scoring-note">
					<p class="eyebrow">AIME scoring</p>
					<p>
						Answers on AIME are scored with logic-based normalization instead of multiple choice.
						Enter the exact mathematical answer; equivalent integer forms are accepted when they normalize to the same value.
					</p>
				</article>
			` : ''}
			<form class="stack" data-role="question-form">
			${currentQuestions
				.map(
					(question, index) => {
						const crossedOut = new Set(draftCrossedOutChoices[question.id] ?? []);
						const promptText = numberStandaloneBulletLists(stripDuplicatedChoiceLines(question.prompt, question.choices));
						const mediaMarkup = renderImageGallery(question.media, 'question-media');
						const currentAnswer = String(draftAnswers?.[question.id] ?? '');

						if (standardizedAnswerMode) {
							return `
								<fieldset class="question-card">
									<legend>
										<span class="question-number">Question ${(currentPage - 1) * questionsPerPage + index + 1}</span>
										<div class="question-prompt markdown-content content-truncate content-truncate--question" title="${escapeAttribute(promptText)}">${renderMarkdown(promptText)}</div>
										${mediaMarkup}
									</legend>
									<label class="field">
										<input
											type="text"
											name="${escapeAttribute(question.id)}"
											value="${escapeAttribute(currentAnswer)}"
											placeholder="Enter answer"
											inputmode="numeric"
											pattern="[0-9]*"
											autocomplete="off"
											spellcheck="false"
										/>
									</label>
								</fieldset>
							`;
						}

						return `
							<fieldset class="question-card">
								<legend>
									<span class="question-number">Question ${(currentPage - 1) * questionsPerPage + index + 1}</span>
									<div class="question-prompt markdown-content content-truncate content-truncate--question" title="${escapeAttribute(promptText)}">${renderMarkdown(promptText)}</div>
									${mediaMarkup}
								</legend>
								<div class="choice-list">
									${question.choices
										.map(
											(choice, choiceIndex) => {
												const isCrossedOut = crossedOut.has(choiceIndex);

												return `
													<div class="choice-item ${isCrossedOut ? 'choice-item--crossed' : ''}">
														<label class="choice-select">
															<input
																type="radio"
																name="${escapeAttribute(question.id)}"
																value="${choiceIndex}"
																${draftAnswers?.[question.id] === choiceIndex ? 'checked' : ''}
															/>
																<span class="choice-text content-truncate content-truncate--answer" title="${escapeAttribute(String(choice ?? ''))}">${renderInlineMarkdown(choice)}</span>
														</label>
														<button
															type="button"
															class="choice-crossout-button"
															data-role="choice-crossout-toggle"
															data-question-id="${escapeAttribute(question.id)}"
															data-choice-index="${choiceIndex}"
															aria-pressed="${isCrossedOut ? 'true' : 'false'}"
														>
															${isCrossedOut ? 'Restore' : 'Cross out'}
														</button>
													</div>
											`;
										},
									)
									.join('')}
								</div>
							</fieldset>
						`;
					},
				)
				.join('')}
			<div class="actions-row questions-actions-row">
				<a class="button button--ghost" href="index.html">Choose a different benchmark</a>
				<div class="actions-row">
					${currentPage > 1 ? '<button class="button button--ghost" type="button" data-role="prev-page">Previous page</button>' : ''}
					${currentPage < totalPages ? '<button class="button" type="button" data-role="next-page">Next page</button>' : '<button class="button" type="submit">Score my answers</button>'}
				</div>
			</div>
		</form>
		`;

		const form = container.querySelector('[data-role="question-form"]');
		const prevButton = container.querySelector('[data-role="prev-page"]');
		const nextButton = container.querySelector('[data-role="next-page"]');
		prevButton?.addEventListener('click', () => {
			flushPendingCrossoutSave();
			collectCurrentPageResponses();
			currentPage = Math.max(1, currentPage - 1);
			persistProgress();
			renderPage();
			scrollToPageStart();
		});

		nextButton?.addEventListener('click', () => {
			flushPendingCrossoutSave();
			collectCurrentPageResponses();
			currentPage = Math.min(totalPages, currentPage + 1);
			persistProgress();
			renderPage();
			scrollToPageStart();
		});

		form?.addEventListener('submit', (event) => {
			event.preventDefault();
			flushPendingCrossoutSave();
			collectCurrentPageResponses();

			const score = scoreBenchmark(benchmark, selectedQuestions, draftAnswers);
			const currentModels = getModels(benchmark.id, appData.currentScores);

			persistProgress({
				currentQuestionPage: 1,
				completedAt: new Date().toISOString(),
				score,
				currentModels,
			});

			window.location.href = 'results.html';
		});

		renderMathIn(container);
	};

	container.addEventListener('click', (event) => {
		const target = event.target;
		if (!target || typeof target.closest !== 'function') {
			return;
		}

		const button = target.closest('[data-role="choice-crossout-toggle"]');
		if (!button || !container.contains(button)) {
			return;
		}

		collectCurrentPageResponses();
		const questionId = button.dataset.questionId;
		const choiceIndex = Number(button.dataset.choiceIndex);

		if (!questionId || !Number.isInteger(choiceIndex)) {
			return;
		}

		const existing = new Set(draftCrossedOutChoices[questionId] ?? []);
		if (existing.has(choiceIndex)) {
			existing.delete(choiceIndex);
		} else {
			existing.add(choiceIndex);
		}

		const nextCrossedOutChoices = { ...draftCrossedOutChoices };
		if (existing.size) {
			nextCrossedOutChoices[questionId] = [...existing].sort((left, right) => left - right);
		} else {
			delete nextCrossedOutChoices[questionId];
		}

		draftCrossedOutChoices = nextCrossedOutChoices;
		scheduleCrossoutSave();
		renderPage();
	});

	renderPage();
}
