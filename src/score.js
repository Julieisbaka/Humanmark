import { AIME_SCORING_METHOD, scoreAimeAnswer } from './app/shared/scoring/aime/index.js';

const DEFAULT_CONFIDENCE = 0.95;
const DEFAULT_Z_SCORE = 1.96;
export const STATE_KEY = 'humanmark-benchmark-state';

export function clamp(value, minimum, maximum) {
	return Math.min(Math.max(value, minimum), maximum);
}

function randomFloat() {
	if (window.crypto?.getRandomValues) {
		const values = new Uint32Array(1);
		window.crypto.getRandomValues(values);
		return values[0] / 0x100000000;
	}

	return Math.random();
}

function shuffle(values) {
	const items = [...values];

	for (let index = items.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(randomFloat() * (index + 1));
		[items[index], items[swapIndex]] = [items[swapIndex], items[index]];
	}

	return items;
}

export function selectQuestions(benchmark, count) {
	const total = benchmark?.questions?.length ?? 0;
	const targetCount = clamp(Number(count) || 0, 0, total);

	return shuffle(benchmark.questions ?? []).slice(0, targetCount);
}

export function calculateMarginOfError(correctCount, totalQuestions, confidence = DEFAULT_CONFIDENCE) {
	if (!totalQuestions) {
		return 0;
	}

	const adjustedScore = clamp((correctCount + 0.5) / (totalQuestions + 1), 0, 1);
	const zScore = confidence >= 0.99 ? 2.576 : confidence >= 0.975 ? 2.24 : DEFAULT_Z_SCORE;

	return zScore * Math.sqrt((adjustedScore * (1 - adjustedScore)) / totalQuestions);
}

export function formatPercent(value, digits = 1) {
	return `${(value * 100).toFixed(digits)}%`;
}

export function formatRank(rank) {
	const suffix =
		rank % 10 === 1 && rank % 100 !== 11
			? 'st'
			: rank % 10 === 2 && rank % 100 !== 12
				? 'nd'
				: rank % 10 === 3 && rank % 100 !== 13
					? 'rd'
					: 'th';

	return `${rank}${suffix}`;
}

export function formatDate(value) {
	if (!value) {
		return 'Unknown';
	}

	return new Date(value).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

function mean(values) {
	if (!values.length) {
		return 0;
	}

	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readNumber(value) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function getArcPmiInputs(question) {
	const pmi = question?.pmi ?? {};
	const questionProbability =
		readNumber(pmi.questionProbability) ??
		readNumber(pmi.px) ??
		readNumber(question?.questionProbability) ??
		readNumber(question?.px);
	const jointProbabilities =
		pmi.jointProbabilities ??
		pmi.pxy ??
		question?.jointProbabilities ??
		question?.pxy ??
		[];
	const choiceProbabilities =
		pmi.choiceProbabilities ??
		pmi.py ??
		question?.choiceProbabilities ??
		question?.py ??
		[];

	if (!questionProbability || questionProbability <= 0) {
		return null;
	}

	if (!Array.isArray(jointProbabilities) || !Array.isArray(choiceProbabilities)) {
		return null;
	}

	if (
		jointProbabilities.length !== choiceProbabilities.length ||
		jointProbabilities.length !== (question?.choices?.length ?? 0)
	) {
		return null;
	}

	return {
		questionProbability,
		jointProbabilities,
		choiceProbabilities,
	};
}

function scoreArcPmiQuestion(question, selectedIndex) {
	if (!Number.isInteger(selectedIndex)) {
		return null;
	}

	const inputs = getArcPmiInputs(question);
	if (!inputs) {
		return null;
	}

	const pmiValues = inputs.jointProbabilities.map((joint, index) => {
		const jointProbability = readNumber(joint);
		const choiceProbability = readNumber(inputs.choiceProbabilities[index]);

		if (!jointProbability || !choiceProbability || jointProbability <= 0 || choiceProbability <= 0) {
			return null;
		}

		return Math.log(jointProbability / (inputs.questionProbability * choiceProbability));
	});

	if (pmiValues.some((value) => value === null)) {
		return null;
	}

	const selected = pmiValues[selectedIndex];
	if (selected === null || selected === undefined) {
		return null;
	}

	const min = Math.min(...pmiValues);
	const max = Math.max(...pmiValues);

	if (max === min) {
		return 1;
	}

	return clamp((selected - min) / (max - min), 0, 1);
}

export function scoreResponses(questions, answers) {
	const methodScores = [];
	let methodScoredQuestions = 0;

	const reviewedQuestions = (questions ?? []).map((question) => {
		const selected = answers?.[question.id];
		let selectedIndex = selected === undefined ? null : Number(selected);
		let selectedText = selected === undefined || selected === null ? null : String(selected).trim();
		let correctAnswerText = null;
		let correct = Number(selected) === Number(question.answerIndex);

		let methodScore = correct ? 1 : 0;
		if (question?.scoringMethod === AIME_SCORING_METHOD || question?.answerText !== undefined) {
			const aimeScore = scoreAimeAnswer(question.answerText ?? question.answer, selected);
			correct = aimeScore.isCorrect;
			methodScore = aimeScore.methodScore;
			selectedIndex = null;
			selectedText = aimeScore.selectedAnswerText;
			correctAnswerText = aimeScore.expectedAnswerText;
			methodScoredQuestions += 1;
		} else if (question?.scoringMethod === 'arc_pmi') {
			const arcScore = scoreArcPmiQuestion(question, selectedIndex);
			if (arcScore !== null) {
				methodScore = arcScore;
				methodScoredQuestions += 1;
			}
		}

		methodScores.push(methodScore);

		return {
			...question,
			selectedIndex,
			selectedText,
			correctAnswerText,
			isCorrect: correct,
			methodScore,
		};
	});

	const totalQuestions = reviewedQuestions.length;
	const correctCount = reviewedQuestions.filter((question) => question.isCorrect).length;
	const correctnessAccuracy = totalQuestions ? correctCount / totalQuestions : 0;
	const accuracy = totalQuestions ? mean(methodScores) : 0;
	const margin = calculateMarginOfError(correctCount, totalQuestions);

	return {
		correctCount,
		totalQuestions,
		accuracy,
		correctnessAccuracy,
		comparisonScore: correctnessAccuracy,
		methodScoredQuestions,
		margin,
		lowerBound: clamp(correctnessAccuracy - margin, 0, 1),
		upperBound: clamp(correctnessAccuracy + margin, 0, 1),
		reviewedQuestions,
	};
}

export function scoreBenchmark(benchmark, questions, answers) {
	const scoringMethod = benchmark?.scoring?.method ?? 'pass@1';

	if (!['pass@1', 'arc_pmi', AIME_SCORING_METHOD].includes(scoringMethod)) {
		throw new Error(`Unsupported scoring method: ${scoringMethod}`);
	}

	const scoredQuestions = (questions ?? []).map((question) => ({
		...question,
		scoringMethod,
	}));
	const scoreSummary = scoreResponses(scoredQuestions, answers);

	const scoreLabel =
		scoringMethod === 'arc_pmi'
			? 'ARC PMI score (normalized, 0 to 1)'
			: scoringMethod === AIME_SCORING_METHOD
				? 'AIME exact-answer accuracy'
				: 'Accuracy (pass@1)';

	return {
		...scoreSummary,
		method: scoringMethod,
		scoreLabel,
		benchmarkId: benchmark?.id ?? null,
		benchmarkName: benchmark?.name ?? null,
	};
}

export function getBenchmarkModels(snapshot, benchmarkId) {
	return snapshot?.benchmarks?.[benchmarkId]?.models ?? [];
}

export function compareAgainstModels(userSummary, models) {
	const comparisonScore = userSummary.comparisonScore ?? userSummary.accuracy;

	return [...models]
		.map((model) => {
			const userDelta = comparisonScore - model.score;
			const verdict =
				userSummary.lowerBound > model.score
					? 'above'
					: userSummary.upperBound < model.score
						? 'below'
						: 'within';

			return {
				...model,
				userDelta,
				verdict,
			};
		})
		.sort((left, right) => right.score - left.score);
}

export function buildLeaderboard(userSummary, models) {
	const comparisonScore = userSummary.comparisonScore ?? userSummary.accuracy;

	const entries = [
		...models.map((model) => ({
			...model,
			isUser: false,
		})),
		{
			modelId: 'humanmark-user',
			model: 'You',
			score: comparisonScore,
			sampleSize: userSummary.totalQuestions,
			rank: null,
			isUser: true,
		},
	];

	return entries
		.sort((left, right) => right.score - left.score)
		.map((entry, index) => ({
			...entry,
			estimatedRank: index + 1,
		}));
}

export function verdictLabel(verdict) {
	if (verdict === 'above') {
		return 'Statistically above';
	}

	if (verdict === 'below') {
		return 'Statistically below';
	}

	return 'Overlaps';
}

export function saveState(state) {
	window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function loadState() {
	const raw = window.localStorage.getItem(STATE_KEY);

	if (!raw) {
		return null;
	}

	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
