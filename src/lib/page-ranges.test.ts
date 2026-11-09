import { describe, expect, it } from "vitest";
import { parsePageRanges, splitGroups } from "./page-ranges";

describe("parsePageRanges", () => {
	it("accepts single pages and spans with loose spacing", () => {
		expect(parsePageRanges(" 1-3,4 ,, 5-5", 8)).toEqual([
			{ label: "1-3", start: 1, end: 3 },
			{ label: "4", start: 4, end: 4 },
			{ label: "5", start: 5, end: 5 },
		]);
	});

	it("rejects malformed, reversed and out-of-bounds ranges", () => {
		expect(() => parsePageRanges("a-b", 8)).toThrow("Invalid range: \"a-b\"");
		expect(() => parsePageRanges("3-1", 8)).toThrow("out of bounds (1-8)");
		expect(() => parsePageRanges("0", 8)).toThrow("out of bounds");
		expect(() => parsePageRanges("7-9", 8)).toThrow("out of bounds");
		expect(() => parsePageRanges(" , ", 8)).toThrow("Enter at least one page range");
	});
});

describe("splitGroups", () => {
	it("splits every page with zero-padded labels", () => {
		expect(splitGroups("individual", 3, 1, "")).toEqual([
			{ label: "01", start: 1, end: 1 },
			{ label: "02", start: 2, end: 2 },
			{ label: "03", start: 3, end: 3 },
		]);
	});

	it("chunks every N pages and clamps the last chunk", () => {
		expect(splitGroups("everyN", 7, 3, "")).toEqual([
			{ label: "1-3", start: 1, end: 3 },
			{ label: "4-6", start: 4, end: 6 },
			{ label: "7", start: 7, end: 7 },
		]);
		expect(splitGroups("everyN", 2, 0, "")).toHaveLength(2);
		expect(splitGroups("everyN", 2, Number.NaN, "")).toHaveLength(2);
	});

	it("delegates custom ranges", () => {
		expect(splitGroups("ranges", 4, 1, "2-4")).toEqual([{ label: "2-4", start: 2, end: 4 }]);
	});
});
