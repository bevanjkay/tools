const UNITS = ["B", "KB", "MB", "GB"];

export function formatBytes(bytes: number) {
	if (!Number.isFinite(bytes) || bytes <= 0)
		return "0 B";
	let value = bytes;
	let index = 0;
	while (value >= 1024 && index < UNITS.length - 1) {
		value /= 1024;
		index += 1;
	}
	return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${UNITS[index]}`;
}
