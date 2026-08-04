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

function emit(level, event, payload = {}) {
	const logger = level === 'error'
		? console.error
		: level === 'warn'
			? console.warn
			: console.info;

	logger('[humanmark]', {
		event,
		level,
		timestamp: new Date().toISOString(),
		...payload,
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
