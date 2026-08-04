export function createLatestTaskGuard() {
	let latestToken = 0;

	return {
		nextToken() {
			latestToken += 1;
			return latestToken;
		},
		isLatest(token) {
			return token === latestToken;
		},
		invalidate() {
			latestToken += 1;
		},
	};
}
