export type SplitMode = "individual" | "everyN" | "ranges";

/** 1-based inclusive page range with a label for the output file name. */
export interface PageGroup {
	label: string;
	start: number;
	end: number;
}

const RANGE_RE = /^\d+(?:-\d+)?$/;

function labelFor(start: number, end: number) {
	return start === end ? `${start}` : `${start}-${end}`;
}

/** Parse "1-3, 4, 5-8" into groups, throwing a user-facing error for bad input. */
export function parsePageRanges(text: string, pageCount: number): PageGroup[] {
	const groups: PageGroup[] = [];
	for (const rawPart of text.split(",")) {
		const part = rawPart.trim();
		if (!part)
			continue;
		if (!RANGE_RE.test(part))
			throw new Error(`Invalid range: "${part}"`);
		const [startText, endText] = part.split("-");
		const start = Number.parseInt(startText, 10);
		const end = endText === undefined ? start : Number.parseInt(endText, 10);
		if (start < 1 || end > pageCount || start > end)
			throw new Error(`Range "${part}" is out of bounds (1-${pageCount})`);
		groups.push({ label: labelFor(start, end), start, end });
	}
	if (groups.length === 0)
		throw new Error("Enter at least one page range");
	return groups;
}

export function splitGroups(mode: SplitMode, pageCount: number, everyN: number, rangesText: string): PageGroup[] {
	if (mode === "ranges")
		return parsePageRanges(rangesText, pageCount);

	const size = mode === "individual" ? 1 : Math.max(1, Math.floor(Number(everyN) || 1));
	const groups: PageGroup[] = [];
	for (let start = 1; start <= pageCount; start += size) {
		const end = Math.min(pageCount, start + size - 1);
		groups.push({
			label: mode === "individual" ? String(start).padStart(2, "0") : labelFor(start, end),
			start,
			end,
		});
	}
	return groups;
}
