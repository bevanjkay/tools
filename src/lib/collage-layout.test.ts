import { describe, expect, it } from "vitest";
import { gridLayout, masonryLayout, mulberry32, scatteredLayout } from "./collage-layout";

const frame = { x: 10, y: 10, width: 1000, height: 600 };

describe("gridLayout", () => {
	it("tiles the frame exactly, marking inner edges", () => {
		const cells = gridLayout(6, frame, 3, 20);
		expect(cells).toHaveLength(6);
		expect(cells[0]).toMatchObject({ index: 0, x: 10, y: 10, width: 320, height: 290, rotation: 0 });
		expect(cells[0].edges).toEqual({ left: false, right: true, top: false, bottom: true });
		expect(cells[5]).toMatchObject({ x: 690, y: 320, width: 320, height: 290 });
		expect(cells[5].edges).toEqual({ left: true, right: false, top: true, bottom: false });
		expect(cells[2].x + cells[2].width).toBe(frame.x + frame.width);
		expect(cells[5].y + cells[5].height).toBe(frame.y + frame.height);
	});

	it("drops the gap when it would swallow the frame", () => {
		const cells = gridLayout(4, { x: 0, y: 0, width: 30, height: 30 }, 2, 50);
		expect(cells[1].x).toBe(15);
	});
});

describe("masonryLayout", () => {
	it("feeds the shortest column and stretches columns to the frame height", () => {
		const sizes = [
			{ width: 100, height: 100 },
			{ width: 100, height: 300 },
			{ width: 100, height: 100 },
			{ width: 100, height: 100 },
		];
		const tall = { ...frame, height: 2000 };
		const cells = masonryLayout(sizes, tall, 2, 0);
		expect(cells.map(cell => cell.index)).toEqual([0, 1, 2, 3]);
		// Images 0, 2 and 3 land in the first column because the tall image fills the second.
		expect(cells.map(cell => cell.x)).toEqual([10, 510, 10, 10]);
		// The short column is spread out so its last tile ends at the frame bottom.
		expect(cells[2].y).toBe(760);
		expect(cells[3].y + cells[3].height).toBe(tall.y + tall.height);
		expect(cells[1].edges).toEqual({ left: true, right: false, top: false, bottom: true });
	});
});

describe("scatteredLayout", () => {
	it("is deterministic per seed and covers every image once", () => {
		const a = scatteredLayout(5, frame, 10, 42, 35);
		const b = scatteredLayout(5, frame, 10, 42, 35);
		const c = scatteredLayout(5, frame, 10, 43, 35);
		expect(a).toEqual(b);
		expect(a).not.toEqual(c);
		expect(a.map(cell => cell.index).toSorted()).toEqual([0, 1, 2, 3, 4]);
		for (const cell of a) {
			expect(cell.width).toBeGreaterThan(0);
			expect(Math.abs(cell.rotation)).toBeLessThanOrEqual(Math.PI / 32);
		}
	});
});

describe("mulberry32", () => {
	it("repeats the same sequence for a seed", () => {
		const first = mulberry32(7);
		const second = mulberry32(7);
		expect([first(), first(), first()]).toEqual([second(), second(), second()]);
	});
});
