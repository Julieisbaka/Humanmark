import {
	DEFAULT_QUESTIONS_PER_PAGE,
	DEFAULT_SORT_NUMERIC_CHOICES,
	MAX_QUESTIONS_PER_PAGE,
	MIN_QUESTIONS_PER_PAGE,
	SETTINGS_KEY,
} from './constants.js';

export function clampQuestionsPerPage(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return DEFAULT_QUESTIONS_PER_PAGE;
	}

	return Math.min(MAX_QUESTIONS_PER_PAGE, Math.max(MIN_QUESTIONS_PER_PAGE, Math.floor(parsed)));
}

export function loadSettings() {
	const fallback = {
		questionsPerPage: DEFAULT_QUESTIONS_PER_PAGE,
		sortNumericChoices: DEFAULT_SORT_NUMERIC_CHOICES,
	};
	const raw = window.localStorage.getItem(SETTINGS_KEY);

	if (!raw) {
		return fallback;
	}

	try {
		const parsed = JSON.parse(raw);
		return {
			questionsPerPage: clampQuestionsPerPage(parsed?.questionsPerPage),
			sortNumericChoices:
				typeof parsed?.sortNumericChoices === 'boolean'
					? parsed.sortNumericChoices
					: DEFAULT_SORT_NUMERIC_CHOICES,
		};
	} catch {
		return fallback;
	}
}

export function saveSettings(settings) {
	window.localStorage.setItem(
		SETTINGS_KEY,
		JSON.stringify({
			questionsPerPage: clampQuestionsPerPage(settings?.questionsPerPage),
			sortNumericChoices: Boolean(settings?.sortNumericChoices),
		}),
	);
}
