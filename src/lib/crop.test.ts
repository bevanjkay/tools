import { describe, expect, it } from "vitest";
import { alignCrop, defaultCrop, moveCrop, nearestAlign, resizeCrop } from "./crop";

describe("defaultCrop", () => {
	it("fits the ratio inside the image and aligns it", () => {
		expect(defaultCrop(2000, 1000, 1, 0.5, 0.5)).toEqual({ x: 500, y: 0, w: 1000, h: 1000 });
		expect(defaultCrop(2000, 1000, 1, 0, 0)).toEqual({ x: 0, y: 0, w: 1000, h: 1000 });
		expect(defaultCrop(1000, 2000, 16 / 9, 1, 1)).toEqual({ x: 0, y: 1437, w: 1000, h: 563 });
		expect(defaultCrop(300, 200, null, 0.5, 0.5)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
	});
});

describe("nearestAlign", () => {
	it("snaps to thirds", () => {
		expect(nearestAlign(0, 1000, 500)).toBe(0);
		expect(nearestAlign(250, 1000, 500)).toBe(0.5);
		expect(nearestAlign(450, 1000, 500)).toBe(1);
		expect(nearestAlign(0, 500, 500)).toBe(0.5);
	});
});

describe("alignCrop and moveCrop", () => {
	const rect = { x: 10, y: 10, w: 400, h: 300 };

	it("repositions without changing size", () => {
		expect(alignCrop(rect, 1000, 500, 1, 0.5)).toEqual({ x: 600, y: 100, w: 400, h: 300 });
	});

	it("clamps moves inside the image", () => {
		expect(moveCrop(rect, 50, -50, 1000, 500)).toEqual({ x: 60, y: 0, w: 400, h: 300 });
		expect(moveCrop(rect, 5000, 5000, 1000, 500)).toEqual({ x: 600, y: 200, w: 400, h: 300 });
	});
});

describe("resizeCrop", () => {
	const start = { x: 100, y: 100, w: 200, h: 200 };

	it("keeps the opposite corner fixed", () => {
		expect(resizeCrop(start, "se", 50, 20, 1000, 1000, null)).toEqual({ x: 100, y: 100, w: 250, h: 220 });
		expect(resizeCrop(start, "nw", -50, -20, 1000, 1000, null)).toEqual({ x: 50, y: 80, w: 250, h: 220 });
		expect(resizeCrop(start, "ne", 50, -20, 1000, 1000, null)).toEqual({ x: 100, y: 80, w: 250, h: 220 });
		expect(resizeCrop(start, "sw", -50, 20, 1000, 1000, null)).toEqual({ x: 50, y: 100, w: 250, h: 220 });
	});

	it("locks the aspect ratio and respects the image edge", () => {
		expect(resizeCrop(start, "se", 100, 0, 1000, 1000, 2)).toEqual({ x: 100, y: 100, w: 300, h: 150 });
		expect(resizeCrop(start, "se", 2000, 0, 1000, 400, 2)).toEqual({ x: 100, y: 100, w: 600, h: 300 });
	});

	it("never shrinks below the minimum", () => {
		expect(resizeCrop(start, "se", -190, -195, 1000, 1000, null)).toEqual({ x: 100, y: 100, w: 16, h: 16 });
	});
});
