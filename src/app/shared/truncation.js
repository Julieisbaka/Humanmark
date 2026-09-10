function isTruncated(element) {
	return (element.scrollHeight - element.clientHeight) > 1 || (element.scrollWidth - element.clientWidth) > 1;
}

let expanderIdCounter = 0;
const expanderButtons = new WeakMap();
const resizeObservers = new WeakMap();

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
	const getResizeObserver = (ownerDocument) => {
		if (!ownerDocument || ownerDocument.nodeType !== 9 || typeof window.ResizeObserver !== 'function') {
			return null;
		}

		let observer = resizeObservers.get(ownerDocument);
		if (!observer) {
			observer = new window.ResizeObserver((entries) => {
				entries.forEach(({ target }) => {
					if (!(target instanceof HTMLElement)) {
						return;
					}
					const button = expanderButtons.get(target);
					if (!isTruncated(target)) {
						if (button) {
							button.remove();
							expanderButtons.delete(target);
							target.classList.remove('content-truncate--expanded');
							delete target.dataset.expandReady;
						}
						return;
					}

					if (!button) {
						const contentId = target.id || `content-truncate-${expanderIdCounter += 1}`;
						target.id = contentId;

						const newButton = ownerDocument.createElement('button');
						const contentType = getContentTypeLabel(target);
						newButton.type = 'button';
						newButton.className = 'content-expand-button';
						newButton.dataset.role = 'content-expand-toggle';
						newButton.textContent = 'Expand';
						newButton.setAttribute('aria-expanded', 'false');
						newButton.setAttribute('aria-controls', contentId);
						newButton.setAttribute('aria-label', `Expand full ${contentType}`);

						newButton.addEventListener('click', () => {
							const expanded = target.classList.toggle('content-truncate--expanded');
							newButton.textContent = expanded ? 'Collapse' : 'Expand';
							newButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
							newButton.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} full ${contentType}`);
						});

						getButtonAnchor(target).insertAdjacentElement('afterend', newButton);
						expanderButtons.set(target, newButton);
						target.dataset.expandReady = 'true';
					}
				});
			});
			resizeObservers.set(ownerDocument, observer);
		}
		return observer;
	};

	const initialize = () => {
		const elements = root.querySelectorAll('.content-truncate');

		elements.forEach((element) => {
			if (!(element instanceof HTMLElement) || element.dataset.expandReady === 'true') {
				return;
			}

			const observer = getResizeObserver(element.ownerDocument || document);
			if (observer && element.dataset.expandObserved !== 'true') {
				observer.observe(element);
				element.dataset.expandObserved = 'true';
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
			expanderButtons.set(element, button);
			element.dataset.expandReady = 'true';
		});
	};

	initialize();
	if (typeof window.requestAnimationFrame === 'function') {
		window.requestAnimationFrame(initialize);
	}
}
