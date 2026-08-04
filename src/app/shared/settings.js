import {
	DEFAULT_LEADERBOARD_LIMIT,
	DEFAULT_QUESTIONS_PER_PAGE,
	DEFAULT_SORT_NUMERIC_CHOICES,
	MAX_LEADERBOARD_LIMIT,
	MAX_QUESTIONS_PER_PAGE,
	MIN_LEADERBOARD_LIMIT,
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

export function clampLeaderboardLimit(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return DEFAULT_LEADERBOARD_LIMIT;
	}

	return Math.min(MAX_LEADERBOARD_LIMIT, Math.max(MIN_LEADERBOARD_LIMIT, Math.floor(parsed)));
}

export function loadSettings() {
	const fallback = {
		questionsPerPage: DEFAULT_QUESTIONS_PER_PAGE,
		leaderboardLimit: DEFAULT_LEADERBOARD_LIMIT,
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
			leaderboardLimit: clampLeaderboardLimit(parsed?.leaderboardLimit),
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
			leaderboardLimit: clampLeaderboardLimit(settings?.leaderboardLimit),
			sortNumericChoices: Boolean(settings?.sortNumericChoices),
		}),
	);
}
