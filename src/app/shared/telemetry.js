function normalizeError(error) {
	if (!error) {
		return {
			message: 'Unknown error',
		};
	}

	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}

	return {
		message: String(error),
	};
}

function resolveCurrentPage() {
	if (typeof document === 'undefined') {
		return null;
	}

	return document.body?.dataset?.page ?? null;
}

function inferScope(event, payload) {
	if (payload.scope) {
		return payload.scope;
	}

	const [scope] = String(event).split('.');
	return scope || 'app';
}

function inferOutcome(level, payload) {
	if (payload.outcome) {
		return payload.outcome;
	}

	if (level === 'error') {
		return 'error';
	}

	if (level === 'warn') {
		return 'warning';
	}

	return 'success';
}

function emit(level, event, payload = {}) {
	const logger = level === 'error'
		? console.error
		: level === 'warn'
			? console.warn
			: console.info;

	const normalized = {
		app: 'humanmark',
		event,
		level,
		scope: inferScope(event, payload),
		outcome: inferOutcome(level, payload),
		page: payload.page ?? resolveCurrentPage(),
		timestamp: new Date().toISOString(),
		...payload,
	};

	logger('[humanmark]', {
		...normalized,
	});
}

export function logAppEvent(event, payload = {}) {
	emit('info', event, payload);
}

export function logAppWarning(event, payload = {}) {
	emit('warn', event, payload);
}

export function logAppError(event, error, payload = {}) {
	emit('error', event, {
		...payload,
		error: normalizeError(error),
	});
}
