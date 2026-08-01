import { getBenchmarkModels, loadState } from '../score.js';
import { loadJSON, resolveDataRoot } from './shared.js';

export async function loadAppData() {
	const { dataRoot, benchmarksData } = await resolveDataRoot();
	const currentScores = await loadJSON(`${dataRoot}/scores/current.json`).catch(() => ({ benchmarks: {} }));

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
