import {
	DEFAULT_LEADERBOARD_LIMIT,
	DEFAULT_QUESTIONS_PER_PAGE,
	DEFAULT_SORT_NUMERIC_CHOICES,
	MAX_LEADERBOARD_LIMIT,
	MAX_QUESTIONS_PER_PAGE,
	MIN_LEADERBOARD_LIMIT,
	MIN_QUESTIONS_PER_PAGE,
	clampLeaderboardLimit,
	clampQuestionsPerPage,
	loadSettings,
	saveSettings,
} from './shared.js';

export function renderSettings() {
	const form = document.querySelector('[data-role="settings-form"]');
	const questionsPerPageInput = document.querySelector('[data-role="setting-questions-per-page"]');
	const leaderboardLimitInput = document.querySelector('[data-role="setting-leaderboard-limit"]');
	const sortNumericChoicesInput = document.querySelector('[data-role="setting-sort-numeric-choices"]');
	const saveButton = document.querySelector('[data-role="settings-save"]');
	const resetButton = document.querySelector('[data-role="settings-reset"]');
	const status = document.querySelector('[data-role="settings-status"]');

	if (!form || !questionsPerPageInput || !leaderboardLimitInput || !sortNumericChoicesInput || !saveButton || !resetButton) {
		return;
	}

	const normalizeSettings = (value) => ({
		questionsPerPage: clampQuestionsPerPage(value?.questionsPerPage),
		leaderboardLimit: clampLeaderboardLimit(value?.leaderboardLimit),
		sortNumericChoices: Boolean(value?.sortNumericChoices),
	});

	const defaults = normalizeSettings({
		questionsPerPage: DEFAULT_QUESTIONS_PER_PAGE,
		leaderboardLimit: DEFAULT_LEADERBOARD_LIMIT,
		sortNumericChoices: DEFAULT_SORT_NUMERIC_CHOICES,
	});

	const applyToForm = (value) => {
		questionsPerPageInput.value = String(value.questionsPerPage);
		leaderboardLimitInput.value = String(value.leaderboardLimit);
		sortNumericChoicesInput.checked = Boolean(value.sortNumericChoices);
	};

	const readFromForm = () => normalizeSettings({
		questionsPerPage: questionsPerPageInput.value,
		leaderboardLimit: leaderboardLimitInput.value,
		sortNumericChoices: sortNumericChoicesInput.checked,
	});

	const sameSettings = (left, right) => (
		left.questionsPerPage === right.questionsPerPage
		&& left.leaderboardLimit === right.leaderboardLimit
		&& left.sortNumericChoices === right.sortNumericChoices
	);

	let savedSettings = normalizeSettings(loadSettings());
	questionsPerPageInput.min = String(MIN_QUESTIONS_PER_PAGE);
	questionsPerPageInput.max = String(MAX_QUESTIONS_PER_PAGE);
	questionsPerPageInput.value = String(savedSettings.questionsPerPage);
	leaderboardLimitInput.min = String(MIN_LEADERBOARD_LIMIT);
	leaderboardLimitInput.max = String(MAX_LEADERBOARD_LIMIT);
	leaderboardLimitInput.value = String(savedSettings.leaderboardLimit);
	sortNumericChoicesInput.checked = Boolean(savedSettings.sortNumericChoices);

	const updateSaveButtonState = () => {
		saveButton.disabled = sameSettings(readFromForm(), savedSettings);
	};

	const markEditing = () => {
		if (status) {
			status.textContent = '';
		}
		updateSaveButtonState();
	};

	form.addEventListener('input', markEditing);
	form.addEventListener('change', markEditing);

	resetButton.addEventListener('click', () => {
		applyToForm(defaults);
		if (status) {
			status.textContent = 'Defaults restored. Save to keep these values.';
		}
		updateSaveButtonState();
	});

	form.addEventListener('submit', (event) => {
		event.preventDefault();
		const nextSettings = readFromForm();

		saveSettings(nextSettings);
		savedSettings = nextSettings;
		applyToForm(savedSettings);
		updateSaveButtonState();

		if (status) {
			status.textContent = 'Settings saved.';
		}
	});

	updateSaveButtonState();
}
