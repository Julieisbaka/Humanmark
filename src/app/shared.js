const DATA_ROOT_CANDIDATES = ['data', './data', '../data'];

const SETTINGS_KEY = 'humanmark-settings';
const DEFAULT_QUESTIONS_PER_PAGE = 5;
const MIN_QUESTIONS_PER_PAGE = 1;
const MAX_QUESTIONS_PER_PAGE = 20;
const DEFAULT_SORT_NUMERIC_CHOICES = true;
const CURRENCY_PREFIXES = new Set(['$', '€', '£', '¥', '₹', '₩', '₽', '₺', '₫', '₱', '₪', 'usd', 'eur', 'gbp', 'jpy', 'aud', 'cad', 'cny', 'inr']);
const SCALE_WORDS = new Map([
	['k', 1_000],
	['thousand', 1_000],
	['m', 1_000_000],
	['million', 1_000_000],
	['b', 1_000_000_000],
	['bn', 1_000_000_000],
	['billion', 1_000_000_000],
	['t', 1_000_000_000_000],
	['tn', 1_000_000_000_000],
	['trillion', 1_000_000_000_000],
]);
const MEASUREMENT_UNITS = new Map([
	['mm', { dimension: 'length', factor: 0.001 }],
	['millimeter', { dimension: 'length', factor: 0.001 }],
	['millimeters', { dimension: 'length', factor: 0.001 }],
	['cm', { dimension: 'length', factor: 0.01 }],
	['centimeter', { dimension: 'length', factor: 0.01 }],
	['centimeters', { dimension: 'length', factor: 0.01 }],
	['m', { dimension: 'length', factor: 1 }],
	['meter', { dimension: 'length', factor: 1 }],
	['meters', { dimension: 'length', factor: 1 }],
	['km', { dimension: 'length', factor: 1_000 }],
	['kilometer', { dimension: 'length', factor: 1_000 }],
	['kilometers', { dimension: 'length', factor: 1_000 }],
	['in', { dimension: 'length', factor: 0.0254 }],
	['inch', { dimension: 'length', factor: 0.0254 }],
	['inches', { dimension: 'length', factor: 0.0254 }],
	['ft', { dimension: 'length', factor: 0.3048 }],
	['foot', { dimension: 'length', factor: 0.3048 }],
	['feet', { dimension: 'length', factor: 0.3048 }],
	['yd', { dimension: 'length', factor: 0.9144 }],
	['yard', { dimension: 'length', factor: 0.9144 }],
	['yards', { dimension: 'length', factor: 0.9144 }],
	['mi', { dimension: 'length', factor: 1609.344 }],
	['mile', { dimension: 'length', factor: 1609.344 }],
	['miles', { dimension: 'length', factor: 1609.344 }],
	['mg', { dimension: 'mass', factor: 0.001 }],
	['milligram', { dimension: 'mass', factor: 0.001 }],
	['milligrams', { dimension: 'mass', factor: 0.001 }],
	['g', { dimension: 'mass', factor: 1 }],
	['gram', { dimension: 'mass', factor: 1 }],
	['grams', { dimension: 'mass', factor: 1 }],
	['kg', { dimension: 'mass', factor: 1_000 }],
	['kilogram', { dimension: 'mass', factor: 1_000 }],
	['kilograms', { dimension: 'mass', factor: 1_000 }],
	['lb', { dimension: 'mass', factor: 453.59237 }],
	['lbs', { dimension: 'mass', factor: 453.59237 }],
	['pound', { dimension: 'mass', factor: 453.59237 }],
	['pounds', { dimension: 'mass', factor: 453.59237 }],
	['oz', { dimension: 'mass', factor: 28.349523125 }],
	['ounce', { dimension: 'mass', factor: 28.349523125 }],
	['ounces', { dimension: 'mass', factor: 28.349523125 }],
	['ml', { dimension: 'volume', factor: 0.001 }],
	['milliliter', { dimension: 'volume', factor: 0.001 }],
	['milliliters', { dimension: 'volume', factor: 0.001 }],
	['l', { dimension: 'volume', factor: 1 }],
	['liter', { dimension: 'volume', factor: 1 }],
	['liters', { dimension: 'volume', factor: 1 }],
	['s', { dimension: 'time', factor: 1 }],
	['sec', { dimension: 'time', factor: 1 }],
	['secs', { dimension: 'time', factor: 1 }],
	['second', { dimension: 'time', factor: 1 }],
	['seconds', { dimension: 'time', factor: 1 }],
	['min', { dimension: 'time', factor: 60 }],
	['mins', { dimension: 'time', factor: 60 }],
	['minute', { dimension: 'time', factor: 60 }],
	['minutes', { dimension: 'time', factor: 60 }],
	['h', { dimension: 'time', factor: 3600 }],
	['hr', { dimension: 'time', factor: 3600 }],
	['hrs', { dimension: 'time', factor: 3600 }],
	['hour', { dimension: 'time', factor: 3600 }],
	['hours', { dimension: 'time', factor: 3600 }],
]);
const BARE_LATEX_COMMANDS = new Set([
	'frac',
	'sqrt',
	'cdot',
	'times',
	'leq',
	'geq',
	'neq',
	'approx',
	'pm',
	'mp',
	'alpha',
	'beta',
	'gamma',
	'delta',
	'epsilon',
	'theta',
	'lambda',
	'mu',
	'sigma',
	'pi',
	'phi',
	'psi',
	'omega',
	'sum',
	'prod',
	'int',
	'lim',
	'log',
	'ln',
	'sin',
	'cos',
	'tan',
	'sec',
	'csc',
	'cot',
	'mathrm',
	'mathbf',
	'text',
	'left',
	'right',
	'overline',
	'underline',
	'hat',
	'bar',
	'vec',
	'infty',
]);

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

export async function loadJSON(relativePath) {
	const response = await fetch(new URL(relativePath, window.location.href));

	if (!response.ok) {
		throw new Error(`Failed to load ${relativePath}: ${response.status} ${response.statusText}`);
	}

	return response.json();
}

export async function resolveDataRoot() {
	for (const candidate of DATA_ROOT_CANDIDATES) {
		try {
			const benchmarksData = await loadJSON(`${candidate}/benchmarks/index.json`);
			return {
				dataRoot: candidate,
				benchmarksData,
			};
		} catch {
			// Try next candidate.
		}
	}

	throw new Error('Failed to resolve benchmark data path.');
}

export function clampQuestionsPerPage(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return DEFAULT_QUESTIONS_PER_PAGE;
	}

	return Math.min(MAX_QUESTIONS_PER_PAGE, Math.max(MIN_QUESTIONS_PER_PAGE, Math.floor(parsed)));
}

export function loadSettings() {
	const fallback = {
		questionsPerPage: DEFAULT_QUESTIONS_PER_PAGE,
		sortNumericChoices: DEFAULT_SORT_NUMERIC_CHOICES,
	};
	const raw = window.localStorage.getItem(SETTINGS_KEY);

	if (!raw) {
		return fallback;
	}

	try {
		const parsed = JSON.parse(raw);
		return {
			questionsPerPage: clampQuestionsPerPage(parsed?.questionsPerPage),
			sortNumericChoices:
				typeof parsed?.sortNumericChoices === 'boolean'
					? parsed.sortNumericChoices
					: DEFAULT_SORT_NUMERIC_CHOICES,
		};
	} catch {
		return fallback;
	}
}

export function saveSettings(settings) {
	window.localStorage.setItem(
		SETTINGS_KEY,
		JSON.stringify({
			questionsPerPage: clampQuestionsPerPage(settings?.questionsPerPage),
			sortNumericChoices: Boolean(settings?.sortNumericChoices),
		}),
	);
}

function parseSortableChoiceValue(choice) {
	if (choice === null || choice === undefined) {
		return null;
	}

	const raw = String(choice).trim();
	if (!raw) {
		return null;
	}

	const normalized = raw.replaceAll(',', '').replace(/\s+/g, ' ');
	const numberPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
	const percentPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%$/i;

	if (percentPattern.test(normalized)) {
		return Number.parseFloat(normalized.slice(0, -1)) / 100;
	}

	if (numberPattern.test(normalized)) {
		return Number.parseFloat(normalized);
	}

	const quantityMatch = normalized.match(/^([€£¥₹₩₽₺₫₱₪$]|USD|EUR|GBP|JPY|AUD|CAD|CNY|INR)?\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-zA-Zµμ°%]{0,10})?(?:\s+([a-zA-Z]{1,16}))?$/i);
	if (quantityMatch) {
		const prefix = (quantityMatch[1] ?? '').toLowerCase();
		const numericValue = Number.parseFloat(quantityMatch[2]);
		const attachedSuffix = (quantityMatch[3] ?? '').toLowerCase();
		const separatedSuffix = (quantityMatch[4] ?? '').toLowerCase();
		const suffix = attachedSuffix || separatedSuffix;

		if (Number.isFinite(numericValue)) {
			if (CURRENCY_PREFIXES.has(prefix) || CURRENCY_PREFIXES.has(suffix)) {
				const scale = SCALE_WORDS.get(suffix);
				if (scale) {
					return numericValue * scale;
				}

				return numericValue;
			}

			const measurement = MEASUREMENT_UNITS.get(suffix);
			if (measurement) {
				return numericValue * measurement.factor;
			}

			const scale = SCALE_WORDS.get(suffix);
			if (scale) {
				return numericValue * scale;
			}

			if (!prefix && !suffix) {
				return numericValue;
			}
		}
	}

	return null;
}

export function sortQuestionChoicesForHumans(question, enabled) {
	if (!enabled) {
		return question;
	}

	const choices = question?.choices ?? [];
	if (choices.length < 2) {
		return question;
	}

	const parsedChoices = choices.map((choice, index) => ({
		index,
		choice,
		value: parseSortableChoiceValue(choice),
	}));

	if (parsedChoices.some((entry) => entry.value === null)) {
		return question;
	}

	const originalAnswerIndex = Number(question.answerIndex);
	if (!Number.isInteger(originalAnswerIndex)) {
		return question;
	}

	const sortedChoices = [...parsedChoices].sort((left, right) => left.value - right.value || left.index - right.index);
	const nextAnswerIndex = sortedChoices.findIndex((entry) => entry.index === originalAnswerIndex);

	if (nextAnswerIndex < 0) {
		return question;
	}

	return {
		...question,
		choices: sortedChoices.map((entry) => entry.choice),
		answerIndex: nextAnswerIndex,
	};
}

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

export function renderInlineMarkdown(value) {
	const normalized = injectBareLatexDelimiters(normalizeMathText(injectInlineLambdaDelimiters(value)));
	const { protectedText, tokens } = shieldMathSegments(normalized);
	const rendered = renderInlineMarkdownCore(protectedText);

	return restoreMathSegments(rendered, tokens);
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

function normalizeChoiceText(value) {
	return String(value)
		.trim()
		.replace(/^[a-z]\s*[\)\.\-:]\s*/i, '')
		.replace(/^\d+\s*[\)\.\-:]\s*/, '')
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

export function stripDuplicatedChoiceLines(prompt, choices) {
	if (!prompt) {
		return '';
	}

	if (!Array.isArray(choices) || !choices.length) {
		return String(prompt);
	}

	const lines = String(prompt).split(/\r?\n/);
	if (lines.length <= 1) {
		return String(prompt);
	}

	const normalizedChoices = new Set(choices.map((choice) => normalizeChoiceText(choice)));

	const filteredLines = lines.filter((line, index) => {
		if (index === 0) {
			return true;
		}

		const normalizedLine = normalizeChoiceText(line);
		return !normalizedChoices.has(normalizedLine);
	});

	return filteredLines.join('\n');
}

export function getBenchmark(benchmarks, benchmarkId) {
	return benchmarks.find((benchmark) => benchmark.id === benchmarkId) ?? null;
}

export async function loadBenchmarkDetails(appData, benchmarkId) {
	const benchmarkMeta = getBenchmark(appData.benchmarkIndex, benchmarkId);

	if (!benchmarkMeta) {
		return null;
	}

	try {
		const benchmarkData = await loadJSON(`${appData.dataRoot}/benchmarks/${benchmarkMeta.file}`);
		return {
			...benchmarkMeta,
			...benchmarkData,
		};
	} catch {
		return benchmarkMeta;
	}
}

export function summarizeToolPolicy(toolPolicy) {
	if (!toolPolicy) {
		return 'Tool policy is not specified for this benchmark.';
	}

	const modelAllowed = Boolean(toolPolicy.modelToolsAllowed);
	const allowedTools = (toolPolicy.allowedTools ?? []).filter(Boolean);
	const modelMessage = modelAllowed
		? allowedTools.length
			? `Benchmark model runs allowed these tools: ${allowedTools.join(', ')}.`
			: 'Benchmark model runs allowed external tools (not listed by name).'
		: 'Benchmark model runs did not allow external tools.';

	const mirrorMessage = 'Try to match this same tool allowance when taking the benchmark for a fair comparison.';

	if (!toolPolicy.notes) {
		return `${modelMessage} ${mirrorMessage}`;
	}

	return `${modelMessage} ${mirrorMessage} ${toolPolicy.notes}`;
}

export { MIN_QUESTIONS_PER_PAGE, MAX_QUESTIONS_PER_PAGE };
