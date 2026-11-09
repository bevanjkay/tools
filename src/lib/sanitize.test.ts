import { describe, expect, it } from "vitest";
import { sanitizeNonNegative, sanitizePositiveInt, sanitizeQuality } from "./sanitize";

describe("sanitize", () => {
	it("clamps integers and falls back on junk", () => {
		expect(sanitizePositiveInt(3.7, 2, 1, 10)).toBe(3);
		expect(sanitizePositiveInt(0, 2, 1, 10)).toBe(1);
		expect(sanitizePositiveInt(99, 2, 1, 10)).toBe(10);
		expect(sanitizePositiveInt(Number.NaN, 2, 1, 10)).toBe(2);
	});

	it("keeps fractional non-negative values", () => {
		expect(sanitizeNonNegative(2.5, 5, 25)).toBe(2.5);
		expect(sanitizeNonNegative(-1, 5, 25)).toBe(0);
		expect(sanitizeNonNegative(40, 5, 25)).toBe(25);
		expect(sanitizeNonNegative(Number.POSITIVE_INFINITY, 5, 25)).toBe(5);
	});

	it("bounds quality to 1-100", () => {
		expect(sanitizeQuality(0, 82)).toBe(1);
		expect(sanitizeQuality(150, 82)).toBe(100);
		expect(sanitizeQuality(Number.NaN, 82)).toBe(82);
	});
});
