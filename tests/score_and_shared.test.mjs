import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
	buildLeaderboard,
	calculateMarginOfError,
	compareAgainstModels,
	formatRank,
	getBenchmarkModels,
	scoreBenchmark,
	scoreResponses,
	selectQuestions,
} from '../src/score.js';
import { normalizeAimeAnswer } from '../src/app/shared/scoring/aime/index.js';
import { clampLeaderboardLimit, clampQuestionsPerPage, loadSettings, saveSettings } from '../src/app/shared/settings.js';
import { sortQuestionChoicesForHumans } from '../src/app/shared/sorting.js';
import { summarizeToolPolicy } from '../src/app/shared/benchmark-data.js';
import { getTopModel } from '../src/app/runtime.js';

function setupDom(url = 'http://localhost/src/index.html') {
	const dom = new JSDOM('<!doctype html><html><body></body></html>', { url });
	const { window } = dom;
	globalThis.window = window;
	globalThis.document = window.document;
	globalThis.localStorage = window.localStorage;
	return dom;
}

test('scoreResponses computes pass@1 accuracy and bounds', () => {
	const summary = scoreResponses([
		{ id: 'q1', answerIndex: 1 },
		{ id: 'q2', answerIndex: 0 },
	], { q1: 1, q2: 2 });

	assert.equal(summary.correctCount, 1);
	assert.equal(summary.totalQuestions, 2);
	assert.equal(summary.correctnessAccuracy, 0.5);
	assert.equal(summary.comparisonScore, 0.5);
	assert.ok(summary.lowerBound >= 0);
	assert.ok(summary.upperBound <= 1);
});

test('scoreBenchmark handles arc_pmi scoring and labels correctly', () => {
	const benchmark = { id: 'b1', name: 'Arc', scoring: { method: 'arc_pmi' } };
	const questions = [{
		id: 'q1',
		answerIndex: 0,
		choices: ['A', 'B'],
		pmi: {
			questionProbability: 0.5,
			jointProbabilities: [0.3, 0.1],
			choiceProbabilities: [0.5, 0.5],
		},
	}];

	const summary = scoreBenchmark(benchmark, questions, { q1: 0 });
	assert.equal(summary.method, 'arc_pmi');
	assert.equal(summary.methodScoredQuestions, 1);
	assert.equal(summary.scoreLabel, 'ARC PMI score (normalized, 0 to 1)');
	assert.equal(summary.benchmarkId, 'b1');
});

test('scoreBenchmark rejects unsupported scoring methods', () => {
	assert.throws(
		() => scoreBenchmark({ scoring: { method: 'unknown' } }, [], {}),
		/Unsupported scoring method/,
	);
});

test('scoreBenchmark handles AIME exact-answer scoring and normalization', () => {
	const benchmark = { id: 'aime', name: 'AIME', scoring: { method: 'aime', mode: 'standardized-answer' } };
	const questions = [{ id: 'q1', answerText: '7' }];

	const summary = scoreBenchmark(benchmark, questions, { q1: '007' });
	assert.equal(summary.method, 'aime');
	assert.equal(summary.scoreLabel, 'AIME exact-answer accuracy');
	assert.equal(summary.correctCount, 1);
	assert.equal(summary.reviewedQuestions[0].selectedText, '7');
	assert.equal(summary.reviewedQuestions[0].correctAnswerText, '7');
});

test('normalizeAimeAnswer accepts integer-like strings and rejects invalid formats', () => {
	assert.equal(normalizeAimeAnswer('007'), '7');
	assert.equal(normalizeAimeAnswer('7.0'), '7');
	assert.equal(normalizeAimeAnswer('1,000'), null);
	assert.equal(normalizeAimeAnswer('3/4'), null);
});

test('compareAgainstModels classifies above/within/below correctly', () => {
	const userSummary = { accuracy: 0.6, lowerBound: 0.55, upperBound: 0.65 };
	const comparisons = compareAgainstModels(userSummary, [
		{ model: 'M1', score: 0.5 },
		{ model: 'M2', score: 0.6 },
		{ model: 'M3', score: 0.7 },
	]);

	assert.equal(comparisons.find((row) => row.model === 'M1')?.verdict, 'above');
	assert.equal(comparisons.find((row) => row.model === 'M2')?.verdict, 'within');
	assert.equal(comparisons.find((row) => row.model === 'M3')?.verdict, 'below');
});

test('buildLeaderboard injects user row and estimated ranks', () => {
	const leaderboard = buildLeaderboard({ accuracy: 0.75, totalQuestions: 10 }, [
		{ modelId: 'm1', model: 'Model 1', score: 0.9 },
		{ modelId: 'm2', model: 'Model 2', score: 0.7 },
	]);

	assert.equal(leaderboard.length, 3);
	assert.ok(leaderboard.some((entry) => entry.isUser));
	assert.deepEqual(leaderboard.map((entry) => entry.estimatedRank), [1, 2, 3]);
});

test('utility score helpers: margin, formatRank, model access', () => {
	assert.equal(calculateMarginOfError(0, 0), 0);
	assert.equal(formatRank(1), '1st');
	assert.equal(formatRank(2), '2nd');
	assert.equal(formatRank(3), '3rd');
	assert.equal(formatRank(11), '11th');
	assert.deepEqual(getBenchmarkModels({ benchmarks: { b1: { models: [1] } } }, 'b1'), [1]);
	assert.deepEqual(getBenchmarkModels({}, 'b1'), []);
});

test('selectQuestions clamps count and returns subset from pool', () => {
	const dom = setupDom();
	const benchmark = { questions: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
	const picked = selectQuestions(benchmark, 99);
	assert.equal(picked.length, 3);
	assert.ok(picked.every((question) => benchmark.questions.some((q) => q.id === question.id)));
	dom.window.close();
});

test('settings clamp/load/save paths', () => {
	const dom = setupDom();

	assert.equal(clampQuestionsPerPage('abc'), 5);
	assert.equal(clampQuestionsPerPage(999), 20);
	assert.equal(clampLeaderboardLimit(-10), 1);

	saveSettings({ questionsPerPage: 7, leaderboardLimit: 44, sortNumericChoices: true });
	assert.deepEqual(loadSettings(), {
		questionsPerPage: 7,
		leaderboardLimit: 44,
		sortNumericChoices: true,
	});

	localStorage.setItem('humanmark-settings', '{bad json');
	assert.deepEqual(loadSettings(), {
		questionsPerPage: 5,
		leaderboardLimit: 50,
		sortNumericChoices: true,
	});

	dom.window.close();
});

test('sortQuestionChoicesForHumans sorts numeric-like choices and remaps answer index', () => {
	const sorted = sortQuestionChoicesForHumans({
		choices: ['10%', '2%', '7%'],
		answerIndex: 2,
	}, true);

	assert.deepEqual(sorted.choices, ['2%', '7%', '10%']);
	assert.equal(sorted.answerIndex, 1);
});

test('sortQuestionChoicesForHumans leaves mixed non-numeric choices unchanged', () => {
	const question = { choices: ['ten', '2', '7'], answerIndex: 2 };
	const sorted = sortQuestionChoicesForHumans(question, true);
	assert.deepEqual(sorted, question);
});

test('summarizeToolPolicy handles absent, explicit, and duplicate notes cases', () => {
	assert.equal(
		summarizeToolPolicy(null),
		'Tool policy is not specified for this benchmark.',
	);

	const withNotes = summarizeToolPolicy({
		modelToolsAllowed: true,
		allowedTools: ['calculator'],
		notes: 'Use only allowed tools.',
	});
	assert.ok(withNotes.includes('allowed these tools: calculator.'));
	assert.ok(withNotes.includes('Try to match this same tool allowance'));

	const mirror = 'Try to match this same tool allowance when taking the benchmark for a fair comparison.';
	const withMirrorAlready = summarizeToolPolicy({
		modelToolsAllowed: false,
		allowedTools: [],
		notes: mirror,
	});
	const occurrences = withMirrorAlready.split(mirror).length - 1;
	assert.equal(occurrences, 1);
});

test('getTopModel returns best score or null', () => {
	assert.equal(getTopModel([]), null);
	const top = getTopModel([{ model: 'A', score: 0.4 }, { model: 'B', score: 0.9 }]);
	assert.equal(top?.model, 'B');
});
