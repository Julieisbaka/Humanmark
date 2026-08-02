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
