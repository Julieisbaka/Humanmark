import { getBenchmarkModels, loadState } from '../score.js';
import { loadJSON, resolveDataRoot } from './shared.js';
import { logAppError, logAppEvent, logAppWarning } from './shared/telemetry.js';

export async function loadAppData() {
	const loadStartedAt = Date.now();
	let dataRoot;
	let benchmarksData;

	try {
		({ dataRoot, benchmarksData } = await resolveDataRoot());
	} catch (error) {
		logAppError('appData.load.failedAtDataRoot', error, {
			scope: 'appData',
			outcome: 'error',
			durationMs: Date.now() - loadStartedAt,
		});
		throw error;
	}

	const scoresLoadStartedAt = Date.now();
	const currentScores = await loadJSON(`${dataRoot}/scores/current.json`).catch((error) => {
		logAppWarning('appData.load.currentScoresFallback', {
			scope: 'appData',
			outcome: 'fallback',
			dataRoot,
			error: error instanceof Error ? error.message : String(error),
			durationMs: Date.now() - scoresLoadStartedAt,
		});
		return { benchmarks: {} };
	});

	logAppEvent('appData.load.success', {
		scope: 'appData',
		outcome: 'success',
		dataRoot,
		benchmarkCount: Array.isArray(benchmarksData?.benchmarks) ? benchmarksData.benchmarks.length : null,
		durationMs: Date.now() - loadStartedAt,
	});

	return {
		dataRoot,
		benchmarksData,
		currentScores,
		benchmarkIndex: benchmarksData.benchmarks ?? [],
	};
}

export function getState() {
	return loadState();
}

export function getModels(benchmarkId, snapshot) {
	return getBenchmarkModels(snapshot, benchmarkId);
}

export function getTopModel(models) {
	return [...models].sort((left, right) => right.score - left.score)[0] ?? null;
}
