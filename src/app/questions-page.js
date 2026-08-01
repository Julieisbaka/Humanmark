import { scoreBenchmark } from '../score.js';
import { escapeAttribute, loadBenchmarkDetails, loadSettings, renderInlineMarkdown, renderMarkdown, renderMathIn, sortQuestionChoicesForHumans, stripDuplicatedChoiceLines, summarizeToolPolicy, clampQuestionsPerPage } from './shared.js';
import { getModels, getState } from './runtime.js';
import { saveState } from '../score.js';

export async function renderQuestions(appData) {
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
