import { DATA_ROOT_CANDIDATES } from './constants.js';
import { logAppError, logAppEvent, logAppWarning } from './telemetry.js';

const benchmarkDetailsCache = new Map();
const benchmarkDetailsInFlight = new Map();

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
			logAppEvent('dataRoot.resolve.success', {
				candidate,
				benchmarkCount: Array.isArray(benchmarksData?.benchmarks) ? benchmarksData.benchmarks.length : null,
			});
			return {
				dataRoot: candidate,
				benchmarksData,
			};
		} catch (error) {
			logAppWarning('dataRoot.resolve.candidateFailed', {
				candidate,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	logAppError('dataRoot.resolve.failed', new Error('Failed to resolve benchmark data path.'), {
		candidatesTried: DATA_ROOT_CANDIDATES,
	});
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

	const cacheKey = `${appData.dataRoot}/benchmarks/${benchmarkMeta.file}`;
	if (benchmarkDetailsCache.has(cacheKey)) {
		logAppEvent('benchmarkDetails.load.cacheHit', {
			benchmarkId,
			file: benchmarkMeta.file,
		});
		return benchmarkDetailsCache.get(cacheKey);
	}

	if (benchmarkDetailsInFlight.has(cacheKey)) {
		return benchmarkDetailsInFlight.get(cacheKey);
	}

	const loadTask = (async () => {
		try {
			const benchmarkData = await loadJSON(cacheKey);
			logAppEvent('benchmarkDetails.load.success', {
				benchmarkId,
				file: benchmarkMeta.file,
			});
			const merged = {
				...benchmarkMeta,
				...benchmarkData,
			};
			benchmarkDetailsCache.set(cacheKey, merged);
			return merged;
		} catch (error) {
			logAppWarning('benchmarkDetails.load.fallbackToMeta', {
				benchmarkId,
				file: benchmarkMeta.file,
				error: error instanceof Error ? error.message : String(error),
			});
			return benchmarkMeta;
		} finally {
			benchmarkDetailsInFlight.delete(cacheKey);
		}
	})();

	benchmarkDetailsInFlight.set(cacheKey, loadTask);
	return loadTask;
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
	const notes = String(toolPolicy.notes ?? '').trim();
	const normalizedMirror = mirrorMessage.replace(/[^a-z0-9]/gi, '').toLowerCase();
	const normalizedNotes = notes.replace(/[^a-z0-9]/gi, '').toLowerCase();
	const hasMirrorInNotes = normalizedNotes.includes(normalizedMirror);

	if (!notes) {
		return `${modelMessage} ${mirrorMessage}`;
	}

	const bridgeMessage = hasMirrorInNotes ? '' : ` ${mirrorMessage}`;
	return `${modelMessage}${bridgeMessage} ${notes}`.trim();
}
