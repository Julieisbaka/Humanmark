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

	if (decoded.startsWith('data:image/')) {
		return decoded;
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

function normalizeDisplayMathDelimiters(value) {
	return String(value).replace(/(^|[^\n])\$\$([^$\n]+?)\$\$([^\n]|$)/g, (_match, before, inner, after) => {
		if (!String(inner).trim()) {
			return `${before}$$${inner}$$${after}`;
		}

		return `${before}\\(${inner}\\)${after}`;
	});
}

function normalizeSingleDollarBlockMath(value) {
	return String(value).replace(/(^|\n)\s*\$\s*\n([\s\S]*?)\n\s*\$\s*(?=\n|$)/g, (_match, prefix, inner) => {
		const content = String(inner).trim();
		if (!content) {
			return `${prefix}`;
		}

		return `${prefix}$$\n${content}\n$$`;
	});
}

function normalizeDisplayMathContent(value) {
	return String(value)
		.replace(/\$\$([\s\S]*?)\$\$/g, (_match, inner) => {
			const cleaned = String(inner).replace(/\s*\\\\\s*$/m, '').trimEnd();
			return `$$${cleaned}$$`;
		})
		.replace(/\\\[([\s\S]*?)\\\]/g, (_match, inner) => {
			const cleaned = String(inner).replace(/\s*\\\\\s*$/m, '').trimEnd();
			return `\\[${cleaned}\\]`;
		});
}

function normalizeMathText(value) {
	const text = String(value);
	let result = '';
	const numericOnlyPattern = /^[-+]?\d[\d,]*(?:\.\d+)?(?:\s*(?:%|[a-zA-Zµμ°]+))?$/;
	const obviousMathPattern = /\\[A-Za-z]+|[_^{}]|[=<>±×÷∑∫]|\b(?:sin|cos|tan|log|ln|max|min)\b/i;
	const shouldUseDisplayMath = (content) => /\\\\|\\begin\{|\\end\{|\n/.test(content);
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
			result += inner;
			index = closingIndex;
			continue;
		}

		const sanitizedInner = escapeLatexSpecials(inner);
		result += shouldUseDisplayMath(sanitizedInner)
			? `\\[${sanitizedInner}\\]`
			: `\\(${sanitizedInner}\\)`;
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
	return tokens.reduce((output, { token, match }) => output.split(token).join(match), value);
}

function injectBareLatexDelimiters(value) {
	const { protectedText, tokens } = shieldMathSegments(String(value));
	const nestedBraceGroup = String.raw`\{(?:[^{}]|\{[^{}]*\})*\}`;
	const argumentRequiredCommands = new Set([
		'frac',
		'dfrac',
		'tfrac',
		'cfrac',
		'sqrt',
		'mathrm',
		'mathbf',
		'mathbb',
		'text',
		'overline',
		'underline',
		'hat',
		'bar',
		'vec',
	]);

	const commandPattern = new RegExp(
		String.raw`\\([A-Za-z]+)(?:\s*${nestedBraceGroup}|\s*\[[^\]]*\]|\s*[_^]\s*${nestedBraceGroup}|\s*[_^]\s*[A-Za-z0-9]|\s*\d+(?:\.\d+)*)*`,
		'g',
	);
	const normalized = protectedText.replace(commandPattern, (match, command, offset, fullText) => {
		const normalizedCommand = String(command).toLowerCase();
		if (!BARE_LATEX_COMMANDS.has(normalizedCommand)) {
			return match;
		}

		if (argumentRequiredCommands.has(normalizedCommand)) {
			const trailing = match.slice(command.length + 1);
			if (!/[{\[]/.test(trailing)) {
				return match;
			}
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

function injectBareMathSequences(value) {
	const { protectedText, tokens } = shieldMathSegments(String(value));

	const sequencePattern = /(^|[\s(])([A-Za-z](?:_[A-Za-z0-9{}]+)?(?:\^[A-Za-z0-9{}]+)?(?:\s*[+\-*/=,]\s*|\s+)(?:[A-Za-z](?:_[A-Za-z0-9{}]+)?(?:\^[A-Za-z0-9{}]+)?|\\[A-Za-z]+(?:\s*\{[^{}]*\}|\s*[_^]\s*\{[^{}]*\}|\s*[_^]\s*[A-Za-z0-9])?|\d+(?:\/\d+)?)(?:\s*[+\-*/=,]\s*|\s+)?)+(?!\\\()/g;

	const normalized = protectedText.replace(sequencePattern, (_match, prefix, expression) => {
		if (!/\\[A-Za-z]+/.test(expression)) {
			return `${prefix}${expression}`;
		}

		return `${prefix}\\(${expression.trim()}\\)`;
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

function normalizeLatexEnumerations(value) {
	const normalizeEnvironment = (text, environment) => text.replace(
		new RegExp(String.raw`\\begin\{${environment}\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{${environment}\}`, 'gi'),
		(_match, inner) => {
			const items = String(inner)
				.split(/\\item\s*/g)
				.map((item) => item.trim())
				.filter(Boolean);

			if (!items.length) {
				return '';
			}

			const renderedItems = items.map((item, index) => `${index + 1}. ${item}`).join('\n');
			return `\n\n${renderedItems}\n\n`;
		},
	);

	const withEnumerate = normalizeEnvironment(String(value), 'enumerate');
	return normalizeEnvironment(withEnumerate, 'itemize');
}

function normalizeMathInput(value) {
	const prepared = normalizeDisplayMathDelimiters(
		normalizeSingleDollarBlockMath(
			injectInlineLambdaDelimiters(value),
		),
	);

	const { protectedText, tokens } = shieldMathSegments(prepared);

	const normalizedText = injectBareLatexDelimiters(
		normalizeMathText(protectedText),
	);

	return normalizeDisplayMathContent(restoreMathSegments(normalizedText, tokens));
}

export function renderInlineMarkdown(value) {
	const normalized = normalizeMathInput(value);
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

	const normalized = normalizeLatexEnumerations(String(value)).replace(/\r\n/g, '\n').trim();
	if (!normalized) {
		return '';
	}

	const blocks = normalized.split(/\n{2,}/);

	return blocks
		.map((block) => {
			const normalizedBlock = normalizeMathInput(block);
			const { protectedText, tokens } = shieldMathSegments(normalizedBlock);
			const lines = protectedText.split('\n').map((line) => line.trimEnd());
			const isUnorderedList = lines.every((line) => /^[-*]\s+/.test(line));
			const isOrderedList = lines.every((line) => /^\d+\.\s+/.test(line));

			if (isUnorderedList) {
				const markup = `<ul>${lines
					.map((line) => `<li>${renderInlineMarkdownCore(line.replace(/^[-*]\s+/, ''))}</li>`)
					.join('')}</ul>`;

				return restoreMathSegments(markup, tokens);
			}

			if (isOrderedList) {
				const markup = `<ol>${lines
					.map((line) => `<li>${renderInlineMarkdownCore(line.replace(/^\d+\.\s+/, ''))}</li>`)
					.join('')}</ol>`;

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
			{ left: '$', right: '$', display: false },
		],
		throwOnError: false,
		strict: 'ignore',
	});
}
