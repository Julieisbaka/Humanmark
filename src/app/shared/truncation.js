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

export function initTruncationExpanders(root = document) {
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
		button.type = 'button';
		button.className = 'content-expand-button';
		button.dataset.role = 'content-expand-toggle';
		button.textContent = 'Expand';
		button.setAttribute('aria-expanded', 'false');
		button.setAttribute('aria-controls', contentId);

		button.addEventListener('click', () => {
			const expanded = element.classList.toggle('content-truncate--expanded');
			button.textContent = expanded ? 'Collapse' : 'Expand';
			button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
		});

		getButtonAnchor(element).insertAdjacentElement('afterend', button);
		element.dataset.expandReady = 'true';
	});
}
