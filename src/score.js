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

export function formatDelta(value, digits = 1) {
	const prefix = value > 0 ? '+' : '';
	return `${prefix}${formatPercent(value, digits)}`;
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

export function scoreResponses(questions, answers) {
	const reviewedQuestions = (questions ?? []).map((question) => {
		const selected = answers?.[question.id];
		const correct = Number(selected) === Number(question.answerIndex);

		return {
			...question,
			selectedIndex: selected === undefined ? null : Number(selected),
			isCorrect: correct,
		};
	});

	const totalQuestions = reviewedQuestions.length;
	const correctCount = reviewedQuestions.filter((question) => question.isCorrect).length;
	const accuracy = totalQuestions ? correctCount / totalQuestions : 0;
	const margin = calculateMarginOfError(correctCount, totalQuestions);

	return {
		correctCount,
		totalQuestions,
		accuracy,
		margin,
		lowerBound: clamp(accuracy - margin, 0, 1),
		upperBound: clamp(accuracy + margin, 0, 1),
		reviewedQuestions,
	};
}

export function scoreBenchmark(benchmark, questions, answers) {
	const scoringMethod = benchmark?.scoring?.method ?? 'pass@1';

	if (scoringMethod !== 'pass@1') {
		throw new Error(`Unsupported scoring method: ${scoringMethod}`);
	}

	return {
		...scoreResponses(questions, answers),
		method: scoringMethod,
		benchmarkId: benchmark?.id ?? null,
		benchmarkName: benchmark?.name ?? null,
	};
}

export function getBenchmarkModels(snapshot, benchmarkId) {
	return snapshot?.benchmarks?.[benchmarkId]?.models ?? [];
}

export function compareAgainstModels(userSummary, models) {
	return [...models]
		.map((model) => {
			const userDelta = userSummary.accuracy - model.score;
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
	const entries = [
		...models.map((model) => ({
			...model,
			isUser: false,
		})),
		{
			modelId: 'humanmark-user',
			model: 'You',
			score: userSummary.accuracy,
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

export function clearState() {
	window.localStorage.removeItem(STATE_KEY);
}
