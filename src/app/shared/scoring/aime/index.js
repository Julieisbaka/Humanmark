export const AIME_SCORING_METHOD = 'aime';
export const AIME_SCORING_MODE = 'standardized-answer';
export const AIME_ANSWER_FORMAT = 'integer';

function normalizeIntegerString(value) {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value === 'boolean') {
		return null;
	}

	if (typeof value === 'number') {
		if (!Number.isFinite(value) || !Number.isInteger(value)) {
			return null;
		}

		if (value < 0 || value > 999) {
			return null;
		}

		return String(value);
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			const normalized = normalizeIntegerString(item);
			if (normalized !== null) {
				return normalized;
			}
		}

		return null;
	}

	if (typeof value === 'object') {
		for (const key of ['answer', 'final_answer', 'value', 'text', 'label', 'index']) {
			if (key in value) {
				const normalized = normalizeIntegerString(value[key]);
				if (normalized !== null) {
					return normalized;
				}
			}
		}

		return null;
	}

	const cleaned = String(value).trim().replaceAll(',', '');
	if (!cleaned) {
		return null;
	}

	if (!/^[-+]?\d+(?:\.0+)?$/.test(cleaned)) {
		return null;
	}

	const numericValue = Number(cleaned);
	if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue > 999) {
		return null;
	}

	return String(numericValue);
}

export function normalizeAimeAnswer(value) {
	return normalizeIntegerString(value);
}

export function scoreAimeAnswer(expectedAnswer, selectedAnswer) {
	const normalizedExpected = normalizeAimeAnswer(expectedAnswer);
	const normalizedSelected = normalizeAimeAnswer(selectedAnswer);
	const isCorrect = normalizedExpected !== null && normalizedSelected !== null && normalizedExpected === normalizedSelected;

	return {
		isCorrect,
		methodScore: isCorrect ? 1 : 0,
		expectedAnswerText: normalizedExpected,
		selectedAnswerText: normalizedSelected,
	};
}