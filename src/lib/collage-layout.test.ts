import { describe, expect, it } from "vitest";
import { evenGroups, gridLayout, masonryLayout, mulberry32 } from "./collage-layout";

const frame = { x: 10, y: 10, width: 1000, height: 600 };

describe("evenGroups", () => {
	it("shares items evenly rather than leaving a straggler", () => {
		expect(evenGroups(7, 3)).toEqual([3, 2, 2]);
		expect(evenGroups(6, 3)).toEqual([3, 3]);
		expect(evenGroups(4, 1)).toEqual([1, 1, 1, 1]);
		expect(evenGroups(2, 5)).toEqual([2]);
		expect(evenGroups(0, 3)).toEqual([]);
	});
});

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

	it("places every photo when the count does not fill the columns", () => {
		const cells = gridLayout(7, frame, 3, 20);
		expect(cells.map(cell => cell.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		// Rows of 2, 2 and 3: the leading rows take the wider cells.
		expect(cells.map(cell => Math.round(cell.y))).toEqual([10, 10, 217, 217, 423, 423, 423]);
		expect(cells[0].width).toBe(490);
		expect(cells[6].width).toBeCloseTo(320);
		for (const row of [[0, 1], [2, 3], [4, 6]])
			expect(cells[row[1]].x + cells[row[1]].width).toBe(frame.x + frame.width);
		expect(cells[6].y + cells[6].height).toBe(frame.y + frame.height);
	});

	it("keeps a single short row rather than dropping photos", () => {
		const cells = gridLayout(2, frame, 3, 20);
		expect(cells).toHaveLength(2);
		expect(cells.map(cell => cell.height)).toEqual([600, 600]);
		expect(cells[0].edges).toEqual({ left: false, right: true, top: false, bottom: false });
	});
});

describe("masonryLayout", () => {
	const landscape = { width: 300, height: 200 };
	const portrait = { width: 200, height: 300 };
	const square = { width: 200, height: 200 };

	it("feeds the shortest column, keeping photos in order", () => {
		const tall = { width: 100, height: 300 };
		const cells = masonryLayout([square, tall, square, square], { ...frame, height: 2000 }, 2, 0);
		expect(cells.map(cell => cell.index)).toEqual([0, 1, 2, 3]);
		// Photos 0, 2 and 3 land in the first column because the tall photo fills the second.
		expect(cells.map(cell => cell.x)).toEqual([10, 510, 10, 10]);
		expect(cells[1].edges).toEqual({ left: true, right: false, top: false, bottom: false });
		expect(cells[2].edges).toEqual({ left: false, right: true, top: true, bottom: true });
	});

	it("fills every column to the frame with even gaps, whatever the photos", () => {
		const sizes = [landscape, portrait, square, landscape, landscape, portrait, square, landscape, portrait, landscape, square];
		for (const columns of [1, 2, 3, 4]) {
			const cells = masonryLayout(sizes, frame, columns, 20);
			expect(cells).toHaveLength(sizes.length);
			for (const left of new Set(cells.map(cell => cell.x))) {
				const column = cells.filter(cell => cell.x === left).toSorted((a, b) => a.y - b.y);
				expect(column[0].y).toBe(frame.y);
				expect(column.at(-1)!.y + column.at(-1)!.height).toBeCloseTo(frame.y + frame.height);
				column.slice(1).forEach((cell, position) => {
					expect(cell.y - (column[position].y + column[position].height)).toBeCloseTo(20);
				});
			}
			const rightmost = Math.max(...cells.map(cell => cell.x + cell.width));
			expect(rightmost).toBe(frame.x + frame.width);
		}
	});

	it("keeps photos in a column in proportion to their natural heights", () => {
		const [short, tall] = masonryLayout([landscape, portrait], frame, 1, 0);
		expect(tall.height / short.height).toBeCloseTo((300 / 200) / (200 / 300));
	});

	it("never uses more columns than there are photos", () => {
		const cells = masonryLayout([landscape, portrait], frame, 5, 20);
		expect(cells.map(cell => cell.width)).toEqual([490, 490]);
		expect(cells.map(cell => cell.height)).toEqual([600, 600]);
	});
});

describe("mulberry32", () => {
	it("repeats the same sequence for a seed", () => {
		const first = mulberry32(7);
		const second = mulberry32(7);
		expect([first(), first(), first()]).toEqual([second(), second(), second()]);
	});
});
