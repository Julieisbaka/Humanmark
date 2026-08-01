import { init } from './app/pages.js';

const PAGE = document.body.dataset.page;

document.addEventListener('DOMContentLoaded', () => {
	void init().catch((error) => {
		console.error(error);

		if (PAGE === 'home') {
			const preview = document.querySelector('[data-role="benchmark-preview"]');
			const scoreboard = document.querySelector('[data-role="scoreboard"]');
			if (preview) {
				preview.innerHTML = '<article class="panel panel--soft"><p>Unable to load benchmark data right now.</p></article>';
			}
			if (scoreboard) {
				scoreboard.innerHTML = '<article class="panel panel--soft"><p>Please try refreshing in a moment.</p></article>';
			}
		}
	});
});
