import { getBenchmarkModels, loadState } from '../score.js';
import { loadJSON, resolveDataRoot } from './shared.js';
import { logAppError, logAppEvent, logAppWarning } from './shared/telemetry.js';

export async function loadAppData() {
	let dataRoot;
	let benchmarksData;

	try {
		({ dataRoot, benchmarksData } = await resolveDataRoot());
	} catch (error) {
		logAppError('appData.load.failedAtDataRoot', error);
		throw error;
	}

	const currentScores = await loadJSON(`${dataRoot}/scores/current.json`).catch((error) => {
		logAppWarning('appData.load.currentScoresFallback', {
			dataRoot,
			error: error instanceof Error ? error.message : String(error),
		});
		return { benchmarks: {} };
	});

	logAppEvent('appData.load.success', {
		dataRoot,
		benchmarkCount: Array.isArray(benchmarksData?.benchmarks) ? benchmarksData.benchmarks.length : null,
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
