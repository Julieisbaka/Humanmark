function isTruncated(element) {
	return (element.scrollHeight - element.clientHeight) > 1 || (element.scrollWidth - element.clientWidth) > 1;
}

let expanderIdCounter = 0;

function getButtonAnchor(element) {
	const parent = element.parentElement;
	if (!parent) {
		return element;
	}

	return parent.tagName === 'LABEL' ? parent : element;
}

function getContentTypeLabel(element) {
	if (element.classList.contains('question-prompt') || element.classList.contains('review-prompt')) {
		return 'question';
	}

	if (element.classList.contains('choice-text') || element.classList.contains('review-answer-text')) {
		return 'answer';
	}

	return 'content';
}

export function initTruncationExpanders(root = document) {
	const initialize = () => {
		const elements = root.querySelectorAll('.content-truncate');

		elements.forEach((element) => {
			if (!(element instanceof HTMLElement) || element.dataset.expandReady === 'true') {
				return;
			}

			if (!isTruncated(element)) {
				return;
			}

			const contentId = element.id || `content-truncate-${expanderIdCounter += 1}`;
			element.id = contentId;

			const ownerDocument = element.ownerDocument || document;
			const button = ownerDocument.createElement('button');
			const contentType = getContentTypeLabel(element);
			button.type = 'button';
			button.className = 'content-expand-button';
			button.dataset.role = 'content-expand-toggle';
			button.textContent = 'Expand';
			button.setAttribute('aria-expanded', 'false');
			button.setAttribute('aria-controls', contentId);
			button.setAttribute('aria-label', `Expand full ${contentType}`);

			button.addEventListener('click', () => {
				const expanded = element.classList.toggle('content-truncate--expanded');
				button.textContent = expanded ? 'Collapse' : 'Expand';
				button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
				button.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} full ${contentType}`);
			});

			getButtonAnchor(element).insertAdjacentElement('afterend', button);
			element.dataset.expandReady = 'true';
		});
	};

	initialize();
	if (typeof window.requestAnimationFrame === 'function') {
		window.requestAnimationFrame(initialize);
	}
}
