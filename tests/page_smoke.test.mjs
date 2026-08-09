import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { renderHome } from '../src/app/home-page.js';
import { renderSettings } from '../src/app/settings-page.js';
import { renderQuestions } from '../src/app/questions-page.js';
import { renderResults } from '../src/app/results-page.js';
import { STATE_KEY } from '../src/score.js';
import { SETTINGS_KEY } from '../src/app/shared/constants.js';

function setupDom(bodyHtml, url = 'http://localhost/src/index.html') {
	const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, { url });
	const { window } = dom;

	globalThis.window = window;
	globalThis.document = window.document;
	Object.defineProperty(globalThis, 'navigator', {
		value: window.navigator,
		configurable: true,
	});
	globalThis.localStorage = window.localStorage;
	globalThis.Event = window.Event;
	globalThis.MouseEvent = window.MouseEvent;
	globalThis.CustomEvent = window.CustomEvent;
	globalThis.HTMLElement = window.HTMLElement;
	globalThis.Node = window.Node;
	if (typeof window.HTMLElement.prototype.scrollIntoView !== 'function') {
		window.HTMLElement.prototype.scrollIntoView = () => {};
	}
	window.renderMathInElement = () => {};

	return dom;
}

function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

test('home page selection ignores stale async benchmark detail responses', async () => {
	const dom = setupDom(`
		<form data-role="benchmark-form">
			<select data-role="benchmark-select"></select>
			<input data-role="question-count" type="number" />
			<button type="submit">Start benchmark</button>
		</form>
		<div data-role="benchmark-preview"></div>
		<div data-role="scoreboard"></div>
	`);

	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input) => {
		const url = String(input);
		if (url.includes('/bench-a.json')) {
			await delay(35);
			return new Response(JSON.stringify({
				questions: [{ id: 'a1', prompt: 'A?', choices: ['x', 'y'], answerIndex: 0 }],
			}), { status: 200, headers: { 'content-type': 'application/json' } });
		}

		if (url.includes('/bench-b.json')) {
			await delay(5);
			return new Response(JSON.stringify({
				questions: [
					{ id: 'b1', prompt: 'B1?', choices: ['x', 'y'], answerIndex: 0 },
					{ id: 'b2', prompt: 'B2?', choices: ['x', 'y'], answerIndex: 0 },
				],
			}), { status: 200, headers: { 'content-type': 'application/json' } });
		}

		throw new Error(`Unexpected fetch URL: ${url}`);
	};

	const appData = {
		dataRoot: 'data',
		benchmarksData: { generatedAt: '2026-08-01T00:00:00.000Z' },
		currentScores: { benchmarks: {} },
		benchmarkIndex: [
			{ id: 'bench-a', file: 'bench-a.json', name: 'Benchmark A', description: 'A', options: 2, source: { dataset: 'ds-a' }, questionCount: 1 },
			{ id: 'bench-b', file: 'bench-b.json', name: 'Benchmark B', description: 'B', options: 2, source: { dataset: 'ds-b' }, questionCount: 2 },
		],
	};

	renderHome(appData);

	const select = document.querySelector('[data-role="benchmark-select"]');
	assert.ok(select);
	select.value = 'bench-b';
	select.dispatchEvent(new window.Event('change', { bubbles: true }));

	await delay(80);

	const previewTitle = document.querySelector('[data-role="benchmark-preview"] h2')?.textContent ?? '';
	assert.equal(previewTitle, 'Benchmark B');

	globalThis.fetch = originalFetch;
	dom.window.close();
});

test('settings page supports dirty state, reset to defaults, and save', () => {
	const dom = setupDom(`
		<form data-role="settings-form">
			<input data-role="setting-questions-per-page" type="number" />
			<input data-role="setting-leaderboard-limit" type="number" />
			<input data-role="setting-sort-numeric-choices" type="checkbox" />
			<button data-role="settings-save" type="submit">Save settings</button>
			<button data-role="settings-reset" type="button">Reset</button>
			<p data-role="settings-status"></p>
		</form>
	`);

	localStorage.removeItem(SETTINGS_KEY);
	renderSettings();

	const saveButton = document.querySelector('[data-role="settings-save"]');
	const resetButton = document.querySelector('[data-role="settings-reset"]');
	const questionsPerPageInput = document.querySelector('[data-role="setting-questions-per-page"]');
	const status = document.querySelector('[data-role="settings-status"]');
	const form = document.querySelector('[data-role="settings-form"]');

	assert.ok(saveButton);
	assert.ok(resetButton);
	assert.ok(questionsPerPageInput);
	assert.ok(form);

	assert.equal(saveButton.disabled, true);

	questionsPerPageInput.value = '8';
	questionsPerPageInput.dispatchEvent(new window.Event('input', { bubbles: true }));
	assert.equal(saveButton.disabled, false);

	resetButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
	assert.equal(status.textContent, 'Defaults restored. Save to keep these values.');
	assert.equal(saveButton.disabled, true);

	questionsPerPageInput.value = '7';
	questionsPerPageInput.dispatchEvent(new window.Event('input', { bubbles: true }));
	form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

	assert.equal(saveButton.disabled, true);
	assert.equal(status.textContent, 'Settings saved.');
	assert.ok(localStorage.getItem(SETTINGS_KEY)?.includes('"questionsPerPage":7'));

	dom.window.close();
});

test('questions page paginates and transitions from Next to Score button', async () => {
	const dom = setupDom(`
		<div data-role="questions-status"></div>
		<div data-role="questions-shell"></div>
	`);

	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input) => {
		const url = String(input);
		if (url.includes('/bench-q.json')) {
			return new Response(JSON.stringify({
				questions: [
					{ id: 'q1', prompt: 'P1', choices: ['A', 'B'], answerIndex: 0 },
					{ id: 'q2', prompt: 'P2', choices: ['A', 'B'], answerIndex: 1 },
					{ id: 'q3', prompt: 'P3', choices: ['A', 'B'], answerIndex: 1 },
				],
			}), { status: 200, headers: { 'content-type': 'application/json' } });
		}
		throw new Error(`Unexpected fetch URL: ${url}`);
	};

	localStorage.setItem(SETTINGS_KEY, JSON.stringify({ questionsPerPage: 1, leaderboardLimit: 50, sortNumericChoices: true }));
	localStorage.setItem(STATE_KEY, JSON.stringify({
		benchmarkId: 'bench-q',
		questionIds: ['q1', 'q2', 'q3'],
		answers: {},
		currentQuestionPage: 1,
	}));

	await renderQuestions({
		dataRoot: 'data',
		currentScores: { benchmarks: {} },
		benchmarkIndex: [{
			id: 'bench-q',
			file: 'bench-q.json',
			name: 'Question Bench',
			description: 'desc',
			options: 2,
			source: { dataset: 'ds-q' },
		}],
	});

	const status = document.querySelector('[data-role="questions-status"]')?.textContent ?? '';
	assert.ok(status.includes('page 1/3'));
	assert.equal(document.querySelector('[data-role="prev-page"]'), null);

	const nextButton = document.querySelector('[data-role="next-page"]');
	assert.ok(nextButton);
	nextButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

	const statusAfterNext = document.querySelector('[data-role="questions-status"]')?.textContent ?? '';
	assert.ok(statusAfterNext.includes('page 2/3'));
	assert.ok(document.querySelector('[data-role="prev-page"]'));

	const secondNext = document.querySelector('[data-role="next-page"]');
	assert.ok(secondNext);
	secondNext.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

	const scoreButton = document.querySelector('button[type="submit"]');
	assert.ok(scoreButton);
	assert.equal(scoreButton.textContent?.trim(), 'Score my answers');

	globalThis.fetch = originalFetch;
	dom.window.close();
});

test('questions page drops persisted answers for crossed-out choices', async () => {
	const dom = setupDom(`
		<div data-role="questions-status"></div>
		<div data-role="questions-shell"></div>
	`);

	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input) => {
		const url = String(input);
		if (url.includes('/bench-crossout.json')) {
			return new Response(JSON.stringify({
				questions: [
					{ id: 'q1', prompt: 'P1', choices: ['A', 'B'], answerIndex: 0 },
					{ id: 'q2', prompt: 'P2', choices: ['C', 'D'], answerIndex: 1 },
				],
			}), { status: 200, headers: { 'content-type': 'application/json' } });
		}
		throw new Error(`Unexpected fetch URL: ${url}`);
	};

	localStorage.setItem(SETTINGS_KEY, JSON.stringify({ questionsPerPage: 1, leaderboardLimit: 50, sortNumericChoices: true }));
	localStorage.setItem(STATE_KEY, JSON.stringify({
		benchmarkId: 'bench-crossout',
		questionIds: ['q1', 'q2'],
		answers: { q1: 1 },
		crossedOutChoices: { q1: [1] },
		currentQuestionPage: 1,
	}));

	await renderQuestions({
		dataRoot: 'data',
		currentScores: { benchmarks: {} },
		benchmarkIndex: [{
			id: 'bench-crossout',
			file: 'bench-crossout.json',
			name: 'Crossout Bench',
			description: 'desc',
			options: 2,
			source: { dataset: 'ds-crossout' },
		}],
	});

	const crossedOutInput = document.querySelector('input[name="q1"][value="1"]');
	assert.ok(crossedOutInput);
	assert.equal(crossedOutInput.disabled, true);
	assert.equal(crossedOutInput.checked, false);
	assert.equal(document.querySelector('input[name="q1"]:checked'), null);

	const nextButton = document.querySelector('[data-role="next-page"]');
	assert.ok(nextButton);
	nextButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

	const savedState = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}');
	assert.deepEqual(savedState.answers ?? {}, {});

	globalThis.fetch = originalFetch;
	dom.window.close();
});

test('results page respects leaderboard truncation setting and show-more expansion', async () => {
	const dom = setupDom(`
		<div data-role="results-meta"></div>
		<div data-role="result-summary"></div>
		<div data-role="leaderboard"></div>
		<div data-role="review"></div>
	`);

	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input) => {
		const url = String(input);
		if (url.includes('/bench-r.json')) {
			return new Response(JSON.stringify({
				questions: [{ id: 'rq1', prompt: 'RP?', choices: ['A', 'B'], answerIndex: 0 }],
			}), { status: 200, headers: { 'content-type': 'application/json' } });
		}
		throw new Error(`Unexpected fetch URL: ${url}`);
	};

	localStorage.setItem(SETTINGS_KEY, JSON.stringify({ questionsPerPage: 5, leaderboardLimit: 10, sortNumericChoices: true }));

	const models = Array.from({ length: 30 }, (_unused, index) => ({
		modelId: `m-${index + 1}`,
		model: `Model ${index + 1}`,
		score: 0.99 - index * 0.01,
		sampleSize: 100,
		rank: index + 1,
	}));

	localStorage.setItem(STATE_KEY, JSON.stringify({
		benchmarkId: 'bench-r',
		questionIds: ['rq1'],
		completedAt: '2026-08-01T00:00:00.000Z',
		score: {
			accuracy: 0.95,
			scoreLabel: 'Accuracy (pass@1)',
			correctCount: 1,
			totalQuestions: 1,
			correctnessAccuracy: 1,
			margin: 0,
			lowerBound: 0.95,
			upperBound: 0.95,
			comparisonScore: 0.95,
			method: 'pass@1',
			reviewedQuestions: [
				{ id: 'rq1', prompt: 'RP?', choices: ['A', 'B'], answerIndex: 0, selectedIndex: 0, isCorrect: true },
			],
		},
	}));

	await renderResults({
		dataRoot: 'data',
		benchmarkIndex: [{
			id: 'bench-r',
			file: 'bench-r.json',
			name: 'Results Bench',
			description: 'desc',
			source: { dataset: 'ds-r' },
		}],
		currentScores: {
			benchmarks: {
				'bench-r': {
					models,
				},
			},
		},
	});

	const summaryText = document.querySelector('[data-role="leaderboard-summary"]')?.textContent ?? '';
	assert.ok(summaryText.includes('top 10'));

	const initialRows = document.querySelectorAll('[data-role="leaderboard-body"] tr').length;
	assert.ok(initialRows >= 10);

	const showMoreButton = document.querySelector('[data-role="leaderboard-show-more"]');
	assert.ok(showMoreButton);
	showMoreButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

	const expandedRows = document.querySelectorAll('[data-role="leaderboard-body"] tr').length;
	assert.equal(expandedRows, 31);

	globalThis.fetch = originalFetch;
	dom.window.close();
});
