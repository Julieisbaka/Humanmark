import { loadAppData } from './runtime.js';
import { renderHome } from './home-page.js';
import { renderQuestions } from './questions-page.js';
import { renderResults } from './results-page.js';
import { renderSettings } from './settings-page.js';

const PAGE = document.body.dataset.page;

export async function init() {
	if (PAGE === 'settings') {
		renderSettings();
		return;
	}

	const appData = await loadAppData();

	if (PAGE === 'home') {
		renderHome(appData);
		return;
	}

	if (PAGE === 'questions') {
		void renderQuestions(appData);
		return;
	}

	if (PAGE === 'results') {
		void renderResults(appData);
	}
}
