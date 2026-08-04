function normalizeChoiceText(value) {
	const withoutLabel = String(value)
		.trim()
		.replace(/^[a-z]\s*[\)\.\-:]\s*/i, '')
		.replace(/^\d+\s*[\)\.\-:]\s*/, '')
		.replace(/\s+/g, ' ')
		.toLowerCase();

	return withoutLabel
		.replace(/&amp;/g, '&')
		.replace(/[^a-z0-9]+/g, '');
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

		if (/^\s*answer\s+choices?\s*:?\s*$/i.test(line)) {
			return false;
		}

		const normalizedLine = normalizeChoiceText(line);
		if (!normalizedLine) {
			return true;
		}

		return !normalizedChoices.has(normalizedLine);
	});

	return filteredLines.join('\n');
}

export function numberStandaloneBulletLists(prompt) {
	if (!prompt) {
		return '';
	}

	return String(prompt)
		.split(/\n{2,}/)
		.map((block) => {
			const lines = block.split(/\r?\n/);
			const nonEmptyLines = lines.filter((line) => line.trim());

			if (!nonEmptyLines.length || !nonEmptyLines.every((line) => /^\s*[-*]\s+/.test(line))) {
				return block;
			}

			let index = 1;
			return lines
				.map((line) => {
					if (!/^\s*[-*]\s+/.test(line)) {
						return line;
					}

					const numberedLine = line.replace(/^\s*[-*]\s+/, `${index}. `);
					index += 1;
					return numberedLine;
				})
				.join('\n');
		})
		.join('\n\n');
}
