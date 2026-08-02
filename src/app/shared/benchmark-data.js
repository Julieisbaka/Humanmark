import { DATA_ROOT_CANDIDATES } from './constants.js';

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
