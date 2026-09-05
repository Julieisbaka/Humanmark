/**
 * Touch-friendly tooltip support for .content-truncate[title] elements.
 *
 * On devices that support hover the native browser title tooltip works fine.
 * On touch-only devices (iOS, Android) there is no hover event, so this module
 * creates a custom tooltip element that appears on tap and is dismissed when
 * the user taps anywhere else.
 *
 * On hybrid pointer/touch devices the native browser `title` tooltip is
 * temporarily removed while the custom tooltip is visible to avoid duplicates.
 */

let tooltipEl = null;
let activeTarget = null;
let savedTitle = null;

function getOrCreateTooltip() {
	if (!tooltipEl) {
		tooltipEl = document.createElement('div');
		tooltipEl.className = 'touch-tooltip';
		tooltipEl.setAttribute('role', 'tooltip');
		document.body.appendChild(tooltipEl);
	}
	return tooltipEl;
}

function showTooltip(target, text) {
	// Hide any previously active tooltip first to restore saved title.
	if (activeTarget) {
		hideTooltip();
	}

	const el = getOrCreateTooltip();
	el.textContent = text;

	// Temporarily remove the native title to avoid duplicate tooltips on
	// hybrid pointer/touch devices.
	savedTitle = target.getAttribute('title');
	target.removeAttribute('title');

	const rect = target.getBoundingClientRect();
	const scrollY = window.scrollY;
	const scrollX = window.scrollX;

	// Position below the element by default; flip above if it would overflow.
	el.style.visibility = 'hidden';
	el.style.display = 'block';

	const elHeight = el.offsetHeight;
	const elWidth = el.offsetWidth;

	let top = rect.bottom + scrollY + 8;
	if (top + elHeight > scrollY + window.innerHeight) {
		top = rect.top + scrollY - elHeight - 8;
	}

	// Clamp horizontally, accounting for horizontal scroll.
	let left = rect.left + scrollX + rect.width / 2 - elWidth / 2;
	left = Math.max(scrollX + 8, Math.min(left, scrollX + window.innerWidth - elWidth - 8));

	el.style.top = `${top}px`;
	el.style.left = `${left}px`;
	el.style.visibility = 'visible';

	activeTarget = target;
}

function hideTooltip() {
	if (tooltipEl) {
		tooltipEl.style.display = 'none';
	}
	if (activeTarget && savedTitle !== null) {
		activeTarget.setAttribute('title', savedTitle);
	}
	activeTarget = null;
	savedTitle = null;
}

export function initTouchTooltips() {
	document.addEventListener('touchstart', (event) => {
		const target = event.target.closest('.content-truncate[title]');

		if (target) {
			if (activeTarget === target) {
				hideTooltip();
				return;
			}
			showTooltip(target, target.title);
		} else {
			hideTooltip();
		}
	}, { passive: true });

	// Also hide when the page is scrolled.
	document.addEventListener('scroll', hideTooltip, { passive: true });
}
