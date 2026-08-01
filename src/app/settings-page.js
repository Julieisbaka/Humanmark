import { MAX_QUESTIONS_PER_PAGE, MIN_QUESTIONS_PER_PAGE, loadSettings, saveSettings } from './shared.js';

export function renderSettings() {
	const form = document.querySelector('[data-role="settings-form"]');
	const questionsPerPageInput = document.querySelector('[data-role="setting-questions-per-page"]');
	const sortNumericChoicesInput = document.querySelector('[data-role="setting-sort-numeric-choices"]');
	const status = document.querySelector('[data-role="settings-status"]');

	if (!form || !questionsPerPageInput || !sortNumericChoicesInput) {
		return;
	}

	const settings = loadSettings();
	questionsPerPageInput.min = String(MIN_QUESTIONS_PER_PAGE);
	questionsPerPageInput.max = String(MAX_QUESTIONS_PER_PAGE);
	questionsPerPageInput.value = String(settings.questionsPerPage);
	sortNumericChoicesInput.checked = Boolean(settings.sortNumericChoices);

	form.addEventListener('submit', (event) => {
		event.preventDefault();

		saveSettings({
			questionsPerPage: questionsPerPageInput.value,
			sortNumericChoices: sortNumericChoicesInput.checked,
		});

		if (status) {
			status.textContent = 'Settings saved.';
		}
	});
}
