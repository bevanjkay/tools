import type { ImpositionOptions } from "./imposition";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { cellPosition, imposePdf, outputPageCount, PAGE_SIZES, sourcePageIndex } from "./imposition";

const defaults: ImpositionOptions = {
	rows: 2,
	columns: 2,
	pageOrder: "row",
	outputSize: "same",
	margin: 0,
	gap: 0,
	repeatPages: false,
	resizeToFit: false,
	autoRotate: false,
	showCropMarks: false,
	showBorders: false,
};

async function makePdf(pageCount: number, size: [number, number] = [100, 200]) {
	const doc = await PDFDocument.create();
	for (let i = 0; i < pageCount; i++)
		doc.addPage(size).drawText(String(i + 1));
	return doc.save();
}

async function pageSizes(bytes: Uint8Array) {
	const doc = await PDFDocument.load(bytes);
	return doc.getPages().map(page => page.getSize());
}

describe("layout helpers", () => {
	it("counts output sheets", () => {
		expect(outputPageCount(5, 4, false)).toBe(2);
		expect(outputPageCount(8, 4, false)).toBe(2);
		expect(outputPageCount(5, 4, true)).toBe(5);
		expect(outputPageCount(0, 4, false)).toBe(0);
	});

	it("maps cells to source pages", () => {
		expect(sourcePageIndex(1, 2, 4, false)).toBe(6);
		expect(sourcePageIndex(1, 2, 4, true)).toBe(1);
	});

	it("orders cells in Z and N patterns", () => {
		expect(Array.from({ length: 6 }, (_, i) => cellPosition(i, 2, 3, "row"))).toEqual([
			{ row: 0, col: 0 },
			{ row: 0, col: 1 },
			{ row: 0, col: 2 },
			{ row: 1, col: 0 },
			{ row: 1, col: 1 },
			{ row: 1, col: 2 },
		]);
		expect(Array.from({ length: 6 }, (_, i) => cellPosition(i, 2, 3, "column"))).toEqual([
			{ row: 0, col: 0 },
			{ row: 1, col: 0 },
			{ row: 0, col: 1 },
			{ row: 1, col: 1 },
			{ row: 0, col: 2 },
			{ row: 1, col: 2 },
		]);
	});
});

describe("imposePdf", () => {
	it("scales the sheet from the source page size", async () => {
		const output = await imposePdf(await makePdf(5), defaults);
		expect(await pageSizes(output)).toEqual([
			{ width: 200, height: 400 },
			{ width: 200, height: 400 },
		]);
	});

	it("uses a fixed output size and repeats pages", async () => {
		const output = await imposePdf(await makePdf(3), { ...defaults, outputSize: "a4", repeatPages: true, resizeToFit: true });
		const sizes = await pageSizes(output);
		expect(sizes).toHaveLength(3);
		expect(sizes[0].width).toBeCloseTo(PAGE_SIZES.a4.width);
		expect(sizes[0].height).toBeCloseTo(PAGE_SIZES.a4.height);
	});

	it("handles every option together", async () => {
		const output = await imposePdf(await makePdf(7, [300, 200]), {
			...defaults,
			rows: 3,
			columns: 2,
			pageOrder: "column",
			outputSize: "a3",
			margin: 5,
			gap: 2,
			resizeToFit: true,
			autoRotate: true,
			showCropMarks: true,
			showBorders: true,
		});
		expect(await pageSizes(output)).toHaveLength(2);
	});
});
