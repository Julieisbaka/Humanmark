import { BARE_LATEX_COMMANDS } from './constants.js';

export function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function escapeAttribute(value) {
	return escapeHtml(value).replaceAll('`', '&#96;');
}

function sanitizeHref(rawHref) {
	const decoded = String(rawHref).replaceAll('&amp;', '&').trim();

	if (!decoded) {
		return '#';
	}

	try {
		const resolved = new URL(decoded, window.location.origin);
		if (['http:', 'https:', 'mailto:'].includes(resolved.protocol)) {
			return decoded;
		}
	} catch {
		return '#';
	}

	return '#';
}

function injectInlineLambdaDelimiters(value) {
	return String(value).replace(
		/(^|[\s(])((?:\\lambda)(?:_[A-Za-z0-9{}]+)?(?:\^[A-Za-z0-9{}]+)?)(?=($|[\s),.;:!?]))/g,
		(_match, prefix, expression) => `${prefix}$${expression}$`,
	);
}

function normalizeMathText(value) {
	const text = String(value);
	let result = '';
	const numericOnlyPattern = /^[-+]?\d[\d,]*(?:\.\d+)?(?:\s*(?:%|[a-zA-Zµμ°]+))?$/;
	const obviousMathPattern = /\\[A-Za-z]+|[_^{}]|[=<>±×÷∑∫]|\b(?:sin|cos|tan|log|ln|max|min)\b/i;
	const escapeLatexSpecials = (content) => content
		.replace(/(^|[^\\])#/g, '$1\\#')
		.replace(/(^|[^\\])%/g, '$1\\%');

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];

		if (character !== '$') {
			result += character;
			continue;
		}

		if (text[index + 1] === '$') {
			result += '$$';
			index += 1;
			continue;
		}

		let closingIndex = index + 1;
		while (closingIndex < text.length) {
			if (text[closingIndex] === '$' && text[closingIndex - 1] !== '\\') {
				break;
			}
			closingIndex += 1;
		}

		if (closingIndex >= text.length) {
			result += '$';
			continue;
		}

		const inner = text.slice(index + 1, closingIndex);
		const trimmedInner = inner.trim();
		const startsNumeric = /^[-+]?\d/.test(trimmedInner);
		const looksNumeric = numericOnlyPattern.test(trimmedInner);
		const looksMath = obviousMathPattern.test(trimmedInner);

		if (!trimmedInner || looksNumeric || (startsNumeric && !looksMath)) {
			result += '$';
			continue;
		}

		const sanitizedInner = escapeLatexSpecials(inner);
		result += `\\(${sanitizedInner}\\)`;
		index = closingIndex;
	}

	return result;
}

function shieldMathSegments(value) {
	const tokens = [];
	const protectedText = String(value).replace(/(\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g, (match) => {
		const token = `__HUMANMARK_MATH_${tokens.length}__`;
		tokens.push({ token, match });
		return token;
	});

	return { protectedText, tokens };
}

function restoreMathSegments(value, tokens) {
	return tokens.reduce((output, { token, match }) => output.replaceAll(token, match), value);
}

function injectBareLatexDelimiters(value) {
	const { protectedText, tokens } = shieldMathSegments(String(value));

	const commandPattern = /\\([A-Za-z]+)(?:\s*\{[^{}]*\}|\s*\[[^\]]*\]|\s*[_^]\s*\{[^{}]*\}|\s*[_^]\s*[A-Za-z0-9]|\s*[A-Za-z0-9])*/g;
	const normalized = protectedText.replace(commandPattern, (match, command, offset, fullText) => {
		if (!BARE_LATEX_COMMANDS.has(String(command).toLowerCase())) {
			return match;
		}

		const before = offset > 0 ? fullText[offset - 1] : '';
		const after = fullText[offset + match.length] ?? '';
		const beforeLooksMath = !before || /[\s(\[{=:+\-*/,]/.test(before);
		const afterLooksMath = !after || /[\s)\]};:,.+\-*/=<>=]/.test(after);

		if (!beforeLooksMath && !afterLooksMath) {
			return match;
		}

		return `\\(${match}\\)`;
	});

	return restoreMathSegments(normalized, tokens);
}

function renderInlineMarkdownCore(value) {
	const escaped = escapeHtml(value);
	return escaped
		.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt, src) => {
			const safeSrc = escapeAttribute(sanitizeHref(src));
			return `<img class="markdown-inline-image" src="${safeSrc}" alt="${alt}" loading="lazy" decoding="async" />`;
		})
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>')
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
			const safeHref = escapeAttribute(sanitizeHref(href));
			return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
		});
}

export function renderInlineMarkdown(value) {
	const normalized = injectBareLatexDelimiters(normalizeMathText(injectInlineLambdaDelimiters(value)));
	const { protectedText, tokens } = shieldMathSegments(normalized);
	const rendered = renderInlineMarkdownCore(protectedText);

	return restoreMathSegments(rendered, tokens);
}

export function renderImageGallery(sources, galleryClass = 'question-media') {
	if (!Array.isArray(sources) || !sources.length) {
		return '';
	}

	const safeSources = [...new Set(sources
		.map((source) => escapeAttribute(sanitizeHref(source)))
		.filter((source) => source && source !== '#'))];

	if (!safeSources.length) {
		return '';
	}

	const items = safeSources
		.map((source, index) => `
			<figure class="question-media-item">
				<a href="${source}" target="_blank" rel="noopener noreferrer">
					<img src="${source}" alt="Question diagram ${index + 1}" loading="lazy" decoding="async" />
				</a>
			</figure>
		`)
		.join('');

	return `<div class="${galleryClass}">${items}</div>`;
}

export function renderMarkdown(value) {
	if (value === null || value === undefined) {
		return '';
	}

	const normalized = String(value).replace(/\r\n/g, '\n').trim();
	if (!normalized) {
		return '';
	}

	const blocks = normalized.split(/\n{2,}/);

	return blocks
		.map((block) => {
			const normalizedBlock = injectBareLatexDelimiters(normalizeMathText(injectInlineLambdaDelimiters(block)));
			const { protectedText, tokens } = shieldMathSegments(normalizedBlock);
			const lines = protectedText.split('\n').map((line) => line.trimEnd());
			const isUnorderedList = lines.every((line) => /^[-*]\s+/.test(line));

			if (isUnorderedList) {
				const markup = `<ul>${lines
					.map((line) => `<li>${renderInlineMarkdownCore(line.replace(/^[-*]\s+/, ''))}</li>`)
					.join('')}</ul>`;

				return restoreMathSegments(markup, tokens);
			}

			const markup = `<p>${lines.map((line) => renderInlineMarkdownCore(line)).join('<br>')}</p>`;
			return restoreMathSegments(markup, tokens);
		})
		.join('');
}

export function renderMathIn(element) {
	if (!element || typeof window.renderMathInElement !== 'function') {
		return;
	}

	window.renderMathInElement(element, {
		delimiters: [
			{ left: '$$', right: '$$', display: true },
			{ left: '\\[', right: '\\]', display: true },
			{ left: '\\(', right: '\\)', display: false },
		],
		throwOnError: false,
		strict: 'ignore',
	});
}
