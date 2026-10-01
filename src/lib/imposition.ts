import type { PDFPage } from "pdf-lib";
import { degrees, PDFDocument, rgb } from "pdf-lib";

export type PageOrder = "row" | "column";
export type OutputSize = "same" | "a4" | "letter" | "a3" | "legal" | "tabloid";

export interface ImpositionOptions {
	rows: number;
	columns: number;
	pageOrder: PageOrder;
	outputSize: OutputSize;
	/** Outer margin in mm. */
	margin: number;
	/** Gap between cells in mm. */
	gap: number;
	repeatPages: boolean;
	resizeToFit: boolean;
	autoRotate: boolean;
	showCropMarks: boolean;
	showBorders: boolean;
}

export const PAGE_SIZES: Record<Exclude<OutputSize, "same">, { width: number; height: number }> = {
	a4: { width: 595.28, height: 841.89 },
	a3: { width: 841.89, height: 1190.55 },
	letter: { width: 612, height: 792 },
	legal: { width: 612, height: 1008 },
	tabloid: { width: 792, height: 1224 },
};

const MM_TO_POINTS = 2.83465;
const CROP_MARK_LENGTH = 10;
const CROP_MARK_OFFSET = 3;

export function outputPageCount(sourcePages: number, pagesPerSheet: number, repeatPages: boolean) {
	return repeatPages ? sourcePages : Math.ceil(sourcePages / pagesPerSheet);
}

export function sourcePageIndex(outputPageIndex: number, cellIndex: number, pagesPerSheet: number, repeatPages: boolean) {
	return repeatPages ? outputPageIndex : outputPageIndex * pagesPerSheet + cellIndex;
}

export function cellPosition(cellIndex: number, rows: number, columns: number, pageOrder: PageOrder) {
	return pageOrder === "row"
		? { row: Math.floor(cellIndex / columns), col: cellIndex % columns }
		: { row: cellIndex % rows, col: Math.floor(cellIndex / rows) };
}

function drawCropMarks(page: PDFPage, x: number, y: number, width: number, height: number) {
	const color = rgb(0, 0, 0);
	const thickness = 0.25;
	const line = (x1: number, y1: number, x2: number, y2: number) =>
		page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });

	const near = CROP_MARK_OFFSET;
	const far = CROP_MARK_OFFSET + CROP_MARK_LENGTH;
	const top = y + height;
	const right = x + width;

	line(x - far, top, x - near, top);
	line(x, top + near, x, top + far);
	line(right + near, top, right + far, top);
	line(right, top + near, right, top + far);
	line(x - far, y, x - near, y);
	line(x, y - near, x, y - far);
	line(right + near, y, right + far, y);
	line(right, y - near, right, y - far);
}

export async function imposePdf(bytes: ArrayBuffer | Uint8Array, options: ImpositionOptions): Promise<Uint8Array> {
	const { rows, columns, pageOrder, repeatPages, resizeToFit, autoRotate } = options;
	const pagesPerSheet = rows * columns;

	const sourcePdf = await PDFDocument.load(bytes);
	const sourcePages = sourcePdf.getPages();
	const totalSourcePages = sourcePages.length;

	const outputPdf = await PDFDocument.create();

	const embeddedPages = await Promise.all(sourcePages.map(async (page) => {
		const mediaBox = page.getMediaBox();
		return outputPdf.embedPage(page, {
			left: mediaBox.x,
			right: mediaBox.x + mediaBox.width,
			bottom: mediaBox.y,
			top: mediaBox.y + mediaBox.height,
		});
	}));

	let outputWidth: number, outputHeight: number;
	if (options.outputSize === "same" && sourcePages.length > 0) {
		const { width, height } = sourcePages[0].getMediaBox();
		outputWidth = width * columns;
		outputHeight = height * rows;
	}
	else {
		const size = options.outputSize === "same" ? PAGE_SIZES.a4 : PAGE_SIZES[options.outputSize];
		outputWidth = size.width;
		outputHeight = size.height;
	}

	const marginPts = options.margin * MM_TO_POINTS;
	const gapPts = options.gap * MM_TO_POINTS;
	const availableWidth = outputWidth - marginPts * 2;
	const availableHeight = outputHeight - marginPts * 2;

	const cellWidth = (availableWidth - gapPts * (columns - 1)) / columns;
	const cellHeight = (availableHeight - gapPts * (rows - 1)) / rows;
	const cellIsLandscape = cellWidth > cellHeight;

	function placement(outputPageIndex: number, cellIndex: number) {
		const pageIndex = sourcePageIndex(outputPageIndex, cellIndex, pagesPerSheet, repeatPages);
		if (pageIndex >= totalSourcePages)
			return null;

		const { width: srcWidth, height: srcHeight } = sourcePages[pageIndex].getMediaBox();
		const pageIsLandscape = srcWidth > srcHeight;
		const shouldRotate = autoRotate && (cellIsLandscape !== pageIsLandscape);

		return {
			pageIndex,
			...cellPosition(cellIndex, rows, columns, pageOrder),
			srcWidth,
			srcHeight,
			shouldRotate,
			effectiveWidth: shouldRotate ? srcHeight : srcWidth,
			effectiveHeight: shouldRotate ? srcWidth : srcHeight,
		};
	}

	for (let outputPageIndex = 0; outputPageIndex < outputPageCount(totalSourcePages, pagesPerSheet, repeatPages); outputPageIndex++) {
		const cells = Array.from({ length: pagesPerSheet }, (_, cellIndex) => placement(outputPageIndex, cellIndex))
			.filter(cell => cell !== null);

		const columnWidths = Array.from({ length: columns }).fill(resizeToFit ? cellWidth : 0) as number[];
		const rowHeights = Array.from({ length: rows }).fill(resizeToFit ? cellHeight : 0) as number[];

		if (!resizeToFit) {
			for (const cell of cells) {
				columnWidths[cell.col] = Math.max(columnWidths[cell.col], cell.effectiveWidth);
				rowHeights[cell.row] = Math.max(rowHeights[cell.row], cell.effectiveHeight);
			}
		}

		const gridWidth = columnWidths.reduce((sum, width) => sum + width, 0) + gapPts * (columns - 1);
		const gridHeight = rowHeights.reduce((sum, height) => sum + height, 0) + gapPts * (rows - 1);

		const gridOffsetX = marginPts + Math.max(0, (availableWidth - gridWidth) / 2);
		const gridOffsetY = marginPts + Math.max(0, (availableHeight - gridHeight) / 2);

		const outputPage = outputPdf.addPage([outputWidth, outputHeight]);

		for (const cell of cells) {
			const scale = resizeToFit
				? Math.min(cellWidth / cell.effectiveWidth, cellHeight / cell.effectiveHeight)
				: 1;

			const scaledWidth = cell.effectiveWidth * scale;
			const scaledHeight = cell.effectiveHeight * scale;

			const slotWidth = columnWidths[cell.col];
			const slotHeight = rowHeights[cell.row];

			const slotOffsetX = columnWidths.slice(0, cell.col).reduce((sum, width) => sum + width, 0);
			const slotOffsetY = rowHeights.slice(0, cell.row).reduce((sum, height) => sum + height, 0);

			const cellX = gridOffsetX + slotOffsetX + gapPts * cell.col;
			const cellY = outputHeight - gridOffsetY - slotOffsetY - slotHeight - gapPts * cell.row;

			const x = cellX + (slotWidth - scaledWidth) / 2;
			const y = cellY + (slotHeight - scaledHeight) / 2;

			const embeddedPage = embeddedPages[cell.pageIndex];
			if (cell.shouldRotate) {
				outputPage.drawPage(embeddedPage, {
					x: x + scaledWidth,
					y,
					width: cell.srcWidth * scale,
					height: cell.srcHeight * scale,
					rotate: degrees(90),
				});
			}
			else {
				outputPage.drawPage(embeddedPage, { x, y, width: scaledWidth, height: scaledHeight });
			}

			if (options.showBorders) {
				outputPage.drawRectangle({
					x,
					y,
					width: scaledWidth,
					height: scaledHeight,
					borderWidth: 0.5,
					borderColor: rgb(0, 0, 0),
				});
			}

			if (options.showCropMarks)
				drawCropMarks(outputPage, x, y, scaledWidth, scaledHeight);
		}
	}

	return outputPdf.save();
}
