import { describe, expect, it } from "vitest";
import { alignCrop, defaultCrop, moveCrop, nearestAlign, nudgeCrop, resizeCrop } from "./crop";

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

	it("keeps a locked ratio at the minimum size", () => {
		expect(resizeCrop(start, "se", -190, 0, 1000, 1000, 2)).toEqual({ x: 100, y: 100, w: 32, h: 16 });
		expect(resizeCrop(start, "se", -190, 0, 1000, 1000, 0.5)).toEqual({ x: 100, y: 100, w: 16, h: 32 });
	});
});

describe("nudgeCrop", () => {
	const rect = { x: 100, y: 100, w: 400, h: 200 };

	it("moves one step per arrow key and stops at the image edge", () => {
		expect(nudgeCrop(rect, "ArrowRight", false, 2000, 1000, null)).toEqual({ ...rect, x: 120 });
		expect(nudgeCrop(rect, "ArrowUp", false, 2000, 1000, null)).toEqual({ ...rect, y: 80 });
		expect(nudgeCrop({ ...rect, x: 5 }, "ArrowLeft", false, 2000, 1000, null)).toEqual({ ...rect, x: 0 });
	});

	it("resizes from the bottom-right corner", () => {
		expect(nudgeCrop(rect, "ArrowRight", true, 2000, 1000, null)).toEqual({ ...rect, w: 420 });
		expect(nudgeCrop(rect, "ArrowUp", true, 2000, 1000, null)).toEqual({ ...rect, h: 180 });
	});

	it("grows or shrinks a locked ratio with any arrow", () => {
		expect(nudgeCrop(rect, "ArrowDown", true, 2000, 1000, 2)).toEqual({ ...rect, w: 420, h: 210 });
		expect(nudgeCrop(rect, "ArrowLeft", true, 2000, 1000, 2)).toEqual({ ...rect, w: 380, h: 190 });
	});

	it("stops shrinking at the minimum size", () => {
		const small = { x: 0, y: 0, w: 20, h: 20 };
		expect(nudgeCrop(small, "ArrowLeft", true, 2000, 1000, null)).toEqual({ ...small, w: 16 });
		expect(nudgeCrop({ ...small, w: 16 }, "ArrowLeft", true, 2000, 1000, null)).toEqual({ ...small, w: 16 });
	});

	it("keeps a locked ratio when shrinking to the minimum size", () => {
		const small = { x: 0, y: 0, w: 40, h: 20 };
		expect(nudgeCrop(small, "ArrowLeft", true, 2000, 1000, 2)).toEqual({ ...small, w: 32, h: 16 });
		expect(nudgeCrop({ ...small, w: 32, h: 16 }, "ArrowLeft", true, 2000, 1000, 2)).toEqual({ ...small, w: 32, h: 16 });
	});

	it("ignores other keys", () => {
		expect(nudgeCrop(rect, "Enter", false, 2000, 1000, null)).toBeNull();
	});
});
