/** Clamp a user-entered number to an integer in [min, max], or fall back when it is not a number. */
export function sanitizePositiveInt(value: number, fallback: number, min: number, max: number) {
	if (!Number.isFinite(value))
		return fallback;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

export function sanitizeNonNegative(value: number, fallback: number, max: number) {
	if (!Number.isFinite(value))
		return fallback;
	return Math.min(max, Math.max(0, value));
}

export function sanitizeQuality(value: number, fallback: number) {
	return sanitizePositiveInt(value, fallback, 1, 100);
}
