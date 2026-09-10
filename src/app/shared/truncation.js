function isTruncated(element) {
	return (element.scrollHeight - element.clientHeight) > 1 || (element.scrollWidth - element.clientWidth) > 1;
}

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
			element.dataset.expandReady = 'true';
			return;
		}

		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'content-expand-button';
		button.dataset.role = 'content-expand-toggle';
		button.textContent = 'Expand';
		button.setAttribute('aria-expanded', 'false');

		button.addEventListener('click', () => {
			const expanded = element.classList.toggle('content-truncate--expanded');
			button.textContent = expanded ? 'Collapse' : 'Expand';
			button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
		});

		getButtonAnchor(element).insertAdjacentElement('afterend', button);
		element.dataset.expandReady = 'true';
	});
}
