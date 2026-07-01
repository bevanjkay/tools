<script lang="ts">
	import { resolve as resolvePath } from "$app/paths";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Select } from "$lib/components/ui/select";
	import { FileText, LayoutGrid, LoaderCircle, Upload, X } from "@lucide/svelte";
	import { degrees, PDFDocument, rgb } from "pdf-lib";

	let pdfFile: ArrayBuffer | null = $state(null);
	let fileName = $state("");
	let rows = $state(2);
	let columns = $state(2);
	let pageOrder = $state<"row" | "column">("row");
	let outputSize = $state<"same" | "a4" | "letter" | "a3" | "legal" | "tabloid">("same");
	let margin = $state(5);
	let gap = $state(2);
	let repeatPages = $state(false);
	let resizeToFit = $state(false);
	let autoRotate = $state(false);
	let showCropMarks = $state(false);
	let showBorders = $state(false);
	let processing = $state(false);
	let error = $state("");
	let originalPageCount = $state(0);

	const PAGE_SIZES: Record<string, { width: number; height: number }> = {
		a4: { width: 595.28, height: 841.89 },
		a3: { width: 841.89, height: 1190.55 },
		letter: { width: 612, height: 792 },
		legal: { width: 612, height: 1008 },
		tabloid: { width: 792, height: 1224 },
	};

	const MM_TO_POINTS = 2.83465;
	const CROP_MARK_LENGTH = 10;
	const CROP_MARK_OFFSET = 3;
	const PDF_EXTENSION_RE = /\.pdf$/i;

	function sanitizePositiveInt(value: number, fallback: number, min: number, max: number) {
		if (!Number.isFinite(value))
			return fallback;
		return Math.min(max, Math.max(min, Math.floor(value)));
	}

	function sanitizeNonNegative(value: number, fallback: number, max: number) {
		if (!Number.isFinite(value))
			return fallback;
		return Math.min(max, Math.max(0, value));
	}

	async function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file && file.type === "application/pdf") {
			pdfFile = await file.arrayBuffer();
			fileName = file.name;
			error = "";

			try {
				const pdfDoc = await PDFDocument.load(pdfFile);
				originalPageCount = pdfDoc.getPageCount();
			}
			catch (e) {
				error = `Failed to load PDF: ${(e as Error).message}`;
				pdfFile = null;
				fileName = "";
			}
		}
		else {
			error = "Please select a valid PDF file";
		}
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file && file.type === "application/pdf") {
			pdfFile = await file.arrayBuffer();
			fileName = file.name;
			error = "";

			try {
				const pdfDoc = await PDFDocument.load(pdfFile);
				originalPageCount = pdfDoc.getPageCount();
			}
			catch (e) {
				error = `Failed to load PDF: ${(e as Error).message}`;
				pdfFile = null;
				fileName = "";
			}
		}
		else {
			error = "Please drop a valid PDF file";
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}

	async function generateNupPdf() {
		if (!pdfFile) {
			error = "Please select a PDF file first";
			return;
		}

		columns = sanitizePositiveInt(columns, 2, 1, 10);
		rows = sanitizePositiveInt(rows, 2, 1, 10);
		margin = sanitizeNonNegative(margin, 5, 25);
		gap = sanitizeNonNegative(gap, 2, 25);

		const pagesPerSheet = rows * columns;
		if (!Number.isFinite(pagesPerSheet) || pagesPerSheet < 1) {
			error = "Rows and columns must be valid numbers greater than 0";
			return;
		}

		processing = true;
		error = "";

		try {
			const sourcePdf = await PDFDocument.load(pdfFile);
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
			if (outputSize === "same" && sourcePages.length > 0) {
				const firstPage = sourcePages[0];
				const { width, height } = firstPage.getMediaBox();
				outputWidth = width * columns;
				outputHeight = height * rows;
			}
			else if (PAGE_SIZES[outputSize]) {
				outputWidth = PAGE_SIZES[outputSize].width;
				outputHeight = PAGE_SIZES[outputSize].height;
			}
			else {
				outputWidth = PAGE_SIZES.a4.width;
				outputHeight = PAGE_SIZES.a4.height;
			}

			const marginPts = margin * MM_TO_POINTS;
			const gapPts = gap * MM_TO_POINTS;
			const availableWidth = outputWidth - marginPts * 2;
			const availableHeight = outputHeight - marginPts * 2;

			const outputPageCount = repeatPages
				? totalSourcePages
				: Math.ceil(totalSourcePages / pagesPerSheet);

			const cellWidth = (outputWidth - marginPts * 2 - gapPts * (columns - 1)) / columns;
			const cellHeight = (outputHeight - marginPts * 2 - gapPts * (rows - 1)) / rows;

			for (let outputPageIndex = 0; outputPageIndex < outputPageCount; outputPageIndex++) {
				const columnWidths = Array.from({ length: columns }).fill(resizeToFit ? cellWidth : 0) as number[];
				const rowHeights = Array.from({ length: rows }).fill(resizeToFit ? cellHeight : 0) as number[];

				if (!resizeToFit) {
					for (let cellIndex = 0; cellIndex < pagesPerSheet; cellIndex++) {
						let sourcePageIndex: number;
						if (repeatPages) {
							sourcePageIndex = outputPageIndex;
						}
						else {
							sourcePageIndex = outputPageIndex * pagesPerSheet + cellIndex;
						}

						if (sourcePageIndex >= totalSourcePages) {
							break;
						}

						let cellRow: number, cellCol: number;
						if (pageOrder === "row") {
							cellRow = Math.floor(cellIndex / columns);
							cellCol = cellIndex % columns;
						}
						else {
							cellCol = Math.floor(cellIndex / rows);
							cellRow = cellIndex % rows;
						}

						const sourcePage = sourcePages[sourcePageIndex];
						const { width: srcWidth, height: srcHeight } = sourcePage.getMediaBox();

						const cellIsLandscape = cellWidth > cellHeight;
						const pageIsLandscape = srcWidth > srcHeight;
						const shouldRotate = autoRotate && (cellIsLandscape !== pageIsLandscape);

						const effectiveWidth = shouldRotate ? srcHeight : srcWidth;
						const effectiveHeight = shouldRotate ? srcWidth : srcHeight;

						columnWidths[cellCol] = Math.max(columnWidths[cellCol], effectiveWidth);
						rowHeights[cellRow] = Math.max(rowHeights[cellRow], effectiveHeight);
					}
				}

				const gridWidth = columnWidths.reduce((sum, width) => sum + width, 0) + gapPts * (columns - 1);
				const gridHeight = rowHeights.reduce((sum, height) => sum + height, 0) + gapPts * (rows - 1);

				const gridOffsetX = marginPts + Math.max(0, (availableWidth - gridWidth) / 2);
				const gridOffsetY = marginPts + Math.max(0, (availableHeight - gridHeight) / 2);

				const outputPage = outputPdf.addPage([outputWidth, outputHeight]);

				for (let cellIndex = 0; cellIndex < pagesPerSheet; cellIndex++) {
					let sourcePageIndex: number;
					if (repeatPages) {
						sourcePageIndex = outputPageIndex;
					}
					else {
						sourcePageIndex = outputPageIndex * pagesPerSheet + cellIndex;
					}

					if (sourcePageIndex >= totalSourcePages) {
						break;
					}

					let cellRow: number, cellCol: number;
					if (pageOrder === "row") {
						cellRow = Math.floor(cellIndex / columns);
						cellCol = cellIndex % columns;
					}
					else {
						cellCol = Math.floor(cellIndex / rows);
						cellRow = cellIndex % rows;
					}

					const sourcePage = sourcePages[sourcePageIndex];
					const { width: srcWidth, height: srcHeight } = sourcePage.getMediaBox();

					const embeddedPage = embeddedPages[sourcePageIndex];

					const cellIsLandscape = cellWidth > cellHeight;
					const pageIsLandscape = srcWidth > srcHeight;
					const shouldRotate = autoRotate && (cellIsLandscape !== pageIsLandscape);

					const effectiveWidth = shouldRotate ? srcHeight : srcWidth;
					const effectiveHeight = shouldRotate ? srcWidth : srcHeight;

					let scale: number;
					if (resizeToFit) {
						const scaleX = cellWidth / effectiveWidth;
						const scaleY = cellHeight / effectiveHeight;
						scale = Math.min(scaleX, scaleY);
					}
					else {
						scale = 1;
					}

					const scaledWidth = effectiveWidth * scale;
					const scaledHeight = effectiveHeight * scale;

					const slotWidth = columnWidths[cellCol];
					const slotHeight = rowHeights[cellRow];

					const slotOffsetX = columnWidths.slice(0, cellCol).reduce((sum, width) => sum + width, 0);
					const slotOffsetY = rowHeights.slice(0, cellRow).reduce((sum, height) => sum + height, 0);

					const cellX = gridOffsetX + slotOffsetX + gapPts * cellCol;
					const cellY = outputHeight - gridOffsetY - slotOffsetY - slotHeight - gapPts * cellRow;

					const offsetX = (slotWidth - scaledWidth) / 2;
					const offsetY = (slotHeight - scaledHeight) / 2;

					const x = cellX + offsetX;
					const y = cellY + offsetY;

					if (shouldRotate) {
						outputPage.drawPage(embeddedPage, {
							x: x + scaledWidth,
							y,
							width: srcWidth * scale,
							height: srcHeight * scale,
							rotate: degrees(90),
						});
					}
					else {
						outputPage.drawPage(embeddedPage, {
							x,
							y,
							width: scaledWidth,
							height: scaledHeight,
						});
					}

					if (showBorders) {
						outputPage.drawRectangle({
							x,
							y,
							width: scaledWidth,
							height: scaledHeight,
							borderWidth: 0.5,
							borderColor: rgb(0, 0, 0),
						});
					}

					if (showCropMarks) {
						const cropColor = rgb(0, 0, 0);
						const lineWidth = 0.25;

						outputPage.drawLine({
							start: { x: x - CROP_MARK_OFFSET - CROP_MARK_LENGTH, y: y + scaledHeight },
							end: { x: x - CROP_MARK_OFFSET, y: y + scaledHeight },
							thickness: lineWidth,
							color: cropColor,
						});
						outputPage.drawLine({
							start: { x, y: y + scaledHeight + CROP_MARK_OFFSET },
							end: { x, y: y + scaledHeight + CROP_MARK_OFFSET + CROP_MARK_LENGTH },
							thickness: lineWidth,
							color: cropColor,
						});

						outputPage.drawLine({
							start: { x: x + scaledWidth + CROP_MARK_OFFSET, y: y + scaledHeight },
							end: { x: x + scaledWidth + CROP_MARK_OFFSET + CROP_MARK_LENGTH, y: y + scaledHeight },
							thickness: lineWidth,
							color: cropColor,
						});
						outputPage.drawLine({
							start: { x: x + scaledWidth, y: y + scaledHeight + CROP_MARK_OFFSET },
							end: { x: x + scaledWidth, y: y + scaledHeight + CROP_MARK_OFFSET + CROP_MARK_LENGTH },
							thickness: lineWidth,
							color: cropColor,
						});

						outputPage.drawLine({
							start: { x: x - CROP_MARK_OFFSET - CROP_MARK_LENGTH, y },
							end: { x: x - CROP_MARK_OFFSET, y },
							thickness: lineWidth,
							color: cropColor,
						});
						outputPage.drawLine({
							start: { x, y: y - CROP_MARK_OFFSET },
							end: { x, y: y - CROP_MARK_OFFSET - CROP_MARK_LENGTH },
							thickness: lineWidth,
							color: cropColor,
						});

						outputPage.drawLine({
							start: { x: x + scaledWidth + CROP_MARK_OFFSET, y },
							end: { x: x + scaledWidth + CROP_MARK_OFFSET + CROP_MARK_LENGTH, y },
							thickness: lineWidth,
							color: cropColor,
						});
						outputPage.drawLine({
							start: { x: x + scaledWidth, y: y - CROP_MARK_OFFSET },
							end: { x: x + scaledWidth, y: y - CROP_MARK_OFFSET - CROP_MARK_LENGTH },
							thickness: lineWidth,
							color: cropColor,
						});
					}
				}
			}

			const pdfBytes = await outputPdf.save();
			downloadPdf(pdfBytes);
		}
		catch (e) {
			error = `Error processing PDF: ${(e as Error).message}`;
			console.error(e);
		}
		finally {
			processing = false;
		}
	}

	function downloadPdf(pdfBytes: Uint8Array) {
		const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");

		const baseName = fileName.replace(PDF_EXTENSION_RE, "");
		link.href = url;
		link.download = `${baseName}_${columns}x${rows}_nup.pdf`;

		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	function clearFile() {
		pdfFile = null;
		fileName = "";
		originalPageCount = 0;
		error = "";
	}

	const nupPreview = $derived(`${columns} × ${rows} = ${columns * rows} pages per sheet`);
	const estimatedOutputPages = $derived(originalPageCount > 0
		? (repeatPages
			? originalPageCount
			: Math.ceil(originalPageCount / (rows * columns)))
		: 0);
</script>

<svelte:head>
	<title>PDF Imposition Tool</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<LayoutGrid class="text-primary size-7" />
		PDF N-Up Layout Generator
	</h1>
	<p class="text-muted-foreground mb-8">Combine multiple PDF pages onto single sheets while preserving vector quality</p>

	{#if pdfFile}
		<div class="border-input bg-muted/40 mb-4 flex items-center gap-3 rounded-xl border p-4">
			<FileText class="text-primary size-8 shrink-0" />
			<div class="flex min-w-0 flex-col">
				<span class="truncate font-semibold">{fileName}</span>
				<span class="text-sm text-emerald-600 dark:text-emerald-400">{originalPageCount} page{originalPageCount !== 1 ? "s" : ""}</span>
			</div>
			<Button variant="ghost" size="icon" class="ml-auto" onclick={clearFile}><X class="size-4" /></Button>
		</div>
	{:else}
		<label
			class="border-input hover:border-ring hover:bg-accent bg-muted/40 mb-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors"
			ondrop={handleDrop}
			ondragover={handleDragOver}
		>
			<Upload class="text-muted-foreground size-9" />
			<p class="font-medium">Drag & drop a PDF here</p>
			<p class="text-muted-foreground text-sm">or click to browse</p>
			<input type="file" accept=".pdf" onchange={handleFileSelect} hidden />
		</label>
	{/if}

	<Card.Root class="mb-6">
		<Card.Header>
			<Card.Title>Layout Settings</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-5">
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<div class="grid gap-1.5">
					<Label for="columns">Columns</Label>
					<Input id="columns" type="number" bind:value={columns} min={1} max={10} />
				</div>
				<div class="grid gap-1.5">
					<Label for="rows">Rows</Label>
					<Input id="rows" type="number" bind:value={rows} min={1} max={10} />
				</div>
				<div class="grid gap-1.5">
					<Label for="pageOrder">Page Order</Label>
					<Select id="pageOrder" bind:value={pageOrder}>
						<option value="row">Left to Right, Top to Bottom (Z)</option>
						<option value="column">Top to Bottom, Left to Right (N)</option>
					</Select>
				</div>
				<div class="grid gap-1.5">
					<Label for="outputSize">Output Page Size</Label>
					<Select id="outputSize" bind:value={outputSize}>
						<option value="same">Auto (Scale from source)</option>
						<option value="a4">A4 (210 × 297 mm)</option>
						<option value="a3">A3 (297 × 420 mm)</option>
						<option value="letter">Letter (8.5 × 11 in)</option>
						<option value="legal">Legal (8.5 × 14 in)</option>
						<option value="tabloid">Tabloid (11 × 17 in)</option>
					</Select>
				</div>
				<div class="grid gap-1.5">
					<Label for="margin">Outer Margin (mm)</Label>
					<Input id="margin" type="number" bind:value={margin} min={0} max={25} step={0.5} />
				</div>
				<div class="grid gap-1.5">
					<Label for="gap">Inner Gap (mm)</Label>
					<Input id="gap" type="number" bind:value={gap} min={0} max={25} step={0.5} />
				</div>
			</div>

			<div class="grid gap-3 sm:grid-cols-2">
				<Label class="font-normal"><Checkbox bind:checked={repeatPages} /> Repeat each page to fill sheet</Label>
				<Label class="font-normal"><Checkbox bind:checked={resizeToFit} /> Resize pages to fill space</Label>
				<Label class="font-normal"><Checkbox bind:checked={autoRotate} /> Auto-rotate pages to fit cells</Label>
				<Label class="font-normal"><Checkbox bind:checked={showCropMarks} /> Add crop marks</Label>
				<Label class="font-normal"><Checkbox bind:checked={showBorders} /> Add page borders</Label>
			</div>

			<div class="bg-muted flex flex-wrap items-center gap-6 rounded-lg border p-4">
				<div class="shrink-0">
					<div class="sheet-border" style="--cols: {columns}; --rows: {rows}; --gap: {Math.max(2, gap)}px;">
						<div class="grid-preview">
							{#each Array.from({ length: rows * columns }) as _, i (i)}
								<div class="cell" class:has-cropmarks={showCropMarks}>
									<div class="page-placeholder" class:has-border={showBorders}>{i + 1}</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
				<div>
					<p class="mb-1 font-semibold">{nupPreview}</p>
					{#if originalPageCount > 0}
						<p class="text-muted-foreground text-sm">
							{originalPageCount} source pages → {estimatedOutputPages} output page{estimatedOutputPages !== 1 ? "s" : ""}
						</p>
					{/if}
					<ul class="text-muted-foreground mt-2 list-disc pl-5 text-sm">
						{#if repeatPages}<li>Each page repeated {columns * rows}×</li>{/if}
						{#if resizeToFit}<li>Pages scaled to fit</li>{:else}<li>Original page size</li>{/if}
						{#if gap > 0}<li>{gap} mm gap between pages</li>{/if}
						{#if autoRotate}<li>Auto-rotation enabled</li>{/if}
						{#if showBorders}<li>Page borders enabled</li>{/if}
						{#if showCropMarks}<li>Crop marks included</li>{/if}
					</ul>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	{#if error}
		<div class="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border px-4 py-3 text-sm">⚠️ {error}</div>
	{/if}

	<div class="mb-4 text-center">
		<Button size="lg" onclick={generateNupPdf} disabled={!pdfFile || processing}>
			{#if processing}
				<LoaderCircle class="size-4 animate-spin" />
				Processing...
			{:else}
				Generate N-Up PDF
			{/if}
		</Button>
	</div>

	<footer class="text-muted-foreground text-center text-sm">
		<p>✨ Vector quality preserved • No server upload • Runs entirely in your browser</p>
	</footer>
</main>

<style>
	.sheet-border {
		width: 80px;
		height: 110px;
		background: var(--background);
		border: 2px solid var(--muted-foreground);
		border-radius: 3px;
		padding: 4px;
		box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1);
	}

	.grid-preview {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		grid-template-rows: repeat(var(--rows), 1fr);
		gap: var(--gap, 2px);
		width: 100%;
		height: 100%;
	}

	.cell {
		background: var(--muted);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 1px;
		position: relative;
	}

	.cell.has-cropmarks::before {
		content: "";
		position: absolute;
		width: 1px;
		height: 4px;
		top: -3px;
		left: 0;
		background: #e53e3e;
	}

	.page-placeholder {
		width: 80%;
		height: 80%;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 1px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.5rem;
		color: var(--muted-foreground);
	}

	.page-placeholder.has-border {
		border-color: var(--foreground);
	}
</style>
