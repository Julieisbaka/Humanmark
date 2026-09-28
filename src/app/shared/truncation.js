function isTruncated(element) {
	return (element.scrollHeight - element.clientHeight) > 1 || (element.scrollWidth - element.clientWidth) > 1;
}

let expanderIdCounter = 0;
const expanderButtons = new WeakMap();
const resizeObservers = new WeakMap();

function updateButtonState(button, expanded, contentType) {
	button.textContent = expanded ? 'Collapse' : 'Expand';
	button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
	button.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} full ${contentType}`);
}

function removeExpander(element) {
	expanderButtons.get(element)?.remove();
	expanderButtons.delete(element);
	element.classList.remove('content-truncate--expanded');
	delete element.dataset.expandReady;
}

function createExpander(element, ownerDocument) {
	const existingButton = expanderButtons.get(element);
	if (existingButton) {
		return existingButton;
	}

	const contentId = element.id || `content-truncate-${expanderIdCounter += 1}`;
	element.id = contentId;

	const button = ownerDocument.createElement('button');
	const contentType = getContentTypeLabel(element);
	button.type = 'button';
	button.className = 'content-expand-button';
	button.dataset.role = 'content-expand-toggle';
	button.setAttribute('aria-controls', contentId);
	updateButtonState(button, false, contentType);

	button.addEventListener('click', () => {
		const expanded = element.classList.toggle('content-truncate--expanded');
		updateButtonState(button, expanded, contentType);
		if (!expanded && !isTruncated(element)) {
			removeExpander(element);
		}
	});

	getButtonAnchor(element).insertAdjacentElement('afterend', button);
	expanderButtons.set(element, button);
	element.dataset.expandReady = 'true';
	return button;
}

function reconcileExpander(element, ownerDocument) {
	if (element.classList.contains('content-truncate--expanded')) {
		return;
	}

	if (!isTruncated(element)) {
		if (expanderButtons.has(element)) {
			removeExpander(element);
		}
		return;
	}

	createExpander(element, ownerDocument);
}

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
					reconcileExpander(target, ownerDocument);
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

			const ownerDocument = element.ownerDocument || document;
			createExpander(element, ownerDocument);
		});
	};

	initialize();
	if (typeof window.requestAnimationFrame === 'function') {
		window.requestAnimationFrame(initialize);
	}
}
