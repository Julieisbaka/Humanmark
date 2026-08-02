import { CURRENCY_PREFIXES, MEASUREMENT_UNITS, SCALE_WORDS } from './constants.js';

function parseSortableChoiceValue(choice) {
	if (choice === null || choice === undefined) {
		return null;
	}

	const raw = String(choice).trim();
	if (!raw) {
		return null;
	}

	const normalized = raw.replaceAll(',', '').replace(/\s+/g, ' ');
	const numberPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
	const percentPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%$/i;

	if (percentPattern.test(normalized)) {
		return Number.parseFloat(normalized.slice(0, -1)) / 100;
	}

	if (numberPattern.test(normalized)) {
		return Number.parseFloat(normalized);
	}

	const quantityMatch = normalized.match(/^([€£¥₹₩₽₺₫₱₪$]|USD|EUR|GBP|JPY|AUD|CAD|CNY|INR)?\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-zA-Zµμ°%]{0,10})?(?:\s+([a-zA-Z]{1,16}))?$/i);
	if (quantityMatch) {
		const prefix = (quantityMatch[1] ?? '').toLowerCase();
		const numericValue = Number.parseFloat(quantityMatch[2]);
		const attachedSuffix = (quantityMatch[3] ?? '').toLowerCase();
		const separatedSuffix = (quantityMatch[4] ?? '').toLowerCase();
		const suffix = attachedSuffix || separatedSuffix;

		if (Number.isFinite(numericValue)) {
			if (CURRENCY_PREFIXES.has(prefix) || CURRENCY_PREFIXES.has(suffix)) {
				const scale = SCALE_WORDS.get(suffix);
				if (scale) {
					return numericValue * scale;
				}

				return numericValue;
			}

			const measurement = MEASUREMENT_UNITS.get(suffix);
			if (measurement) {
				return numericValue * measurement.factor;
			}

			const scale = SCALE_WORDS.get(suffix);
			if (scale) {
				return numericValue * scale;
			}

			if (!prefix && !suffix) {
				return numericValue;
			}
		}
	}

	return null;
}

export function sortQuestionChoicesForHumans(question, enabled) {
	if (!enabled) {
		return question;
	}

	const choices = question?.choices ?? [];
	if (choices.length < 2) {
		return question;
	}

	const parsedChoices = choices.map((choice, index) => ({
		index,
		choice,
		value: parseSortableChoiceValue(choice),
	}));

	if (parsedChoices.some((entry) => entry.value === null)) {
		return question;
	}

	const originalAnswerIndex = Number(question.answerIndex);
	if (!Number.isInteger(originalAnswerIndex)) {
		return question;
	}

	const sortedChoices = [...parsedChoices].sort((left, right) => left.value - right.value || left.index - right.index);
	const nextAnswerIndex = sortedChoices.findIndex((entry) => entry.index === originalAnswerIndex);

	if (nextAnswerIndex < 0) {
		return question;
	}

	return {
		...question,
		choices: sortedChoices.map((entry) => entry.choice),
		answerIndex: nextAnswerIndex,
	};
}
