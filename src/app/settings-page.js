import { MAX_LEADERBOARD_LIMIT, MAX_QUESTIONS_PER_PAGE, MIN_LEADERBOARD_LIMIT, MIN_QUESTIONS_PER_PAGE, loadSettings, saveSettings } from './shared.js';

export function renderSettings() {
	const form = document.querySelector('[data-role="settings-form"]');
	const questionsPerPageInput = document.querySelector('[data-role="setting-questions-per-page"]');
	const leaderboardLimitInput = document.querySelector('[data-role="setting-leaderboard-limit"]');
	const sortNumericChoicesInput = document.querySelector('[data-role="setting-sort-numeric-choices"]');
	const status = document.querySelector('[data-role="settings-status"]');

	if (!form || !questionsPerPageInput || !leaderboardLimitInput || !sortNumericChoicesInput) {
		return;
	}

	const settings = loadSettings();
	questionsPerPageInput.min = String(MIN_QUESTIONS_PER_PAGE);
	questionsPerPageInput.max = String(MAX_QUESTIONS_PER_PAGE);
	questionsPerPageInput.value = String(settings.questionsPerPage);
	leaderboardLimitInput.min = String(MIN_LEADERBOARD_LIMIT);
	leaderboardLimitInput.max = String(MAX_LEADERBOARD_LIMIT);
	leaderboardLimitInput.value = String(settings.leaderboardLimit);
	sortNumericChoicesInput.checked = Boolean(settings.sortNumericChoices);

	form.addEventListener('submit', (event) => {
		event.preventDefault();

		saveSettings({
			questionsPerPage: questionsPerPageInput.value,
			leaderboardLimit: leaderboardLimitInput.value,
			sortNumericChoices: sortNumericChoicesInput.checked,
		});

		if (status) {
			status.textContent = 'Settings saved.';
		}
	});
}
