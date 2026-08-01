const DATA_ROOT_CANDIDATES = ['data', './data', '../data'];

const SETTINGS_KEY = 'humanmark-settings';
const DEFAULT_QUESTIONS_PER_PAGE = 5;
const MIN_QUESTIONS_PER_PAGE = 1;
const MAX_QUESTIONS_PER_PAGE = 20;
const DEFAULT_SORT_NUMERIC_CHOICES = true;

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

	const normalized = raw.replaceAll(',', '');
	const numberPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
	const percentPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%$/i;

	if (percentPattern.test(normalized)) {
		return Number.parseFloat(normalized.slice(0, -1)) / 100;
	}

	if (numberPattern.test(normalized)) {
		return Number.parseFloat(normalized);
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
	const escaped = escapeHtml(injectInlineLambdaDelimiters(value));

	return escaped
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>')
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
			const safeHref = escapeAttribute(sanitizeHref(href));
			return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
		});
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
			const lines = block.split('\n').map((line) => line.trimEnd());
			const isUnorderedList = lines.every((line) => /^[-*]\s+/.test(line));

			if (isUnorderedList) {
				return `<ul>${lines
					.map((line) => `<li>${renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`)
					.join('')}</ul>`;
			}

			return `<p>${lines.map((line) => renderInlineMarkdown(line)).join('<br>')}</p>`;
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
			{ left: '$', right: '$', display: false },
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
