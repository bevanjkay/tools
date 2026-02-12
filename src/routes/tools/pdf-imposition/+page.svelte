<script lang="ts">
	import { base } from "$app/paths";
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

		processing = true;
		error = "";

		try {
			const sourcePdf = await PDFDocument.load(pdfFile);
			const sourcePages = sourcePdf.getPages();
			const totalSourcePages = sourcePages.length;

			const outputPdf = await PDFDocument.create();

			const embeddedPages = await outputPdf.embedPdf(sourcePdf, sourcePages.map((_, i) => i));

			let outputWidth: number, outputHeight: number;
			if (outputSize === "same" && sourcePages.length > 0) {
				const firstPage = sourcePages[0];
				const { width, height } = firstPage.getSize();
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

			const pagesPerSheet = rows * columns;
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
				const columnWidths = Array.from({ length: columns }, () => (resizeToFit ? cellWidth : 0));
				const rowHeights = Array.from({ length: rows }, () => (resizeToFit ? cellHeight : 0));

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
						const { width: srcWidth, height: srcHeight } = sourcePage.getSize();

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
					const { width: srcWidth, height: srcHeight } = sourcePage.getSize();

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

		const baseName = fileName.replace(/\.pdf$/i, "");
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

<main class="page-container">
	<a href="{base}/" class="back-link">← Back to Tools</a>

	<h1>📄 PDF N-Up Layout Generator</h1>
	<p class="subtitle">Combine multiple PDF pages onto single sheets while preserving vector quality</p>

	<section class="mb-3">
		<div
			class="drop-zone"
			class:has-file={pdfFile}
			ondrop={handleDrop}
			ondragover={handleDragOver}
			role="button"
			tabindex="0"
		>
			{#if pdfFile}
				<div class="file-info">
					<span class="file-icon">📄</span>
					<div class="file-details">
						<span class="file-name">{fileName}</span>
						<span class="text-success">{originalPageCount} page{originalPageCount !== 1 ? "s" : ""}</span>
					</div>
					<button class="clear-btn" onclick={(e) => {
						e.stopPropagation();
						clearFile();
					}}>✕</button>
				</div>
			{:else}
				<div class="drop-content">
					<span class="upload-icon">📥</span>
					<p>Drag & drop a PDF here</p>
					<p class="text-muted">or</p>
					<label class="btn btn-primary">
						Browse Files
						<input type="file" accept=".pdf" onchange={handleFileSelect} hidden />
					</label>
				</div>
			{/if}
		</div>
	</section>

	<section class="card-section">
		<h2>Layout Settings</h2>

		<div class="settings-grid">
			<div class="setting-group">
				<label for="columns">Columns</label>
				<input id="columns" type="number" bind:value={columns} min="1" max="10" />
			</div>

			<div class="setting-group">
				<label for="rows">Rows</label>
				<input id="rows" type="number" bind:value={rows} min="1" max="10" />
			</div>

			<div class="setting-group">
				<label for="pageOrder">Page Order</label>
				<select id="pageOrder" bind:value={pageOrder}>
					<option value="row">Left to Right, Top to Bottom (Z)</option>
					<option value="column">Top to Bottom, Left to Right (N)</option>
				</select>
			</div>

			<div class="setting-group">
				<label for="outputSize">Output Page Size</label>
				<select id="outputSize" bind:value={outputSize}>
					<option value="same">Auto (Scale from source)</option>
					<option value="a4">A4 (210 × 297 mm)</option>
					<option value="a3">A3 (297 × 420 mm)</option>
					<option value="letter">Letter (8.5 × 11 in)</option>
					<option value="legal">Legal (8.5 × 14 in)</option>
					<option value="tabloid">Tabloid (11 × 17 in)</option>
				</select>
			</div>

			<div class="setting-group">
				<label for="margin">Outer Margin (mm)</label>
				<input id="margin" type="number" bind:value={margin} min="0" max="25" step="0.5" />
			</div>

			<div class="setting-group">
				<label for="gap">Inner Gap (mm)</label>
				<input id="gap" type="number" bind:value={gap} min="0" max="25" step="0.5" />
			</div>
		</div>

		<div class="checkbox-grid">
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={repeatPages} />
				<span>Repeat each page to fill sheet</span>
			</label>
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={resizeToFit} />
				<span>Resize pages to fill space</span>
			</label>
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={autoRotate} />
				<span>Auto-rotate pages to fit cells</span>
			</label>
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={showCropMarks} />
				<span>Add crop marks</span>
			</label>
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={showBorders} />
				<span>Add page borders</span>
			</label>
		</div>

		<div class="preview-info card">
			<div class="preview-box">
				<div class="sheet-border" style="--cols: {columns}; --rows: {rows}; --gap: {Math.max(2, gap)}px;">
					<div class="grid-preview">
						{#each Array.from({ length: rows * columns }) as _, i}
							<div class="cell" class:has-cropmarks={showCropMarks}>
								<div class="page-placeholder" class:has-border={showBorders}>{i + 1}</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
			<div class="preview-text">
				<p><strong>{nupPreview}</strong></p>
				{#if originalPageCount > 0}
					<p class="text-muted">
						{originalPageCount} source pages → {estimatedOutputPages} output page{estimatedOutputPages !== 1 ? "s" : ""}
					</p>
				{/if}
				<ul class="preview-options text-muted">
					{#if repeatPages}<li>Each page repeated {columns * rows}×</li>{/if}
					{#if resizeToFit}<li>Pages scaled to fit</li>{:else}<li>Original page size</li>{/if}
					{#if gap > 0}<li>{gap} mm gap between pages</li>{/if}
					{#if autoRotate}<li>Auto-rotation enabled</li>{/if}
					{#if showBorders}<li>Page borders enabled</li>{/if}
					{#if showCropMarks}<li>Crop marks included</li>{/if}
				</ul>
			</div>
		</div>
	</section>

	{#if error}
		<div class="error-message">⚠️ {error}</div>
	{/if}

	<section class="text-center mb-3">
		<button
			class="btn btn-primary btn-large"
			onclick={generateNupPdf}
			disabled={!pdfFile || processing}
		>
			{#if processing}
				<span class="spinner"></span>
				Processing...
			{:else}
				🚀 Generate N-Up PDF
			{/if}
		</button>
	</section>

	<footer class="text-center text-muted">
		<p>✨ Vector quality preserved • No server upload • Runs entirely in your browser</p>
	</footer>
</main>

<style>
  /* Tool-specific styles only */
  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .checkbox-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.95rem;
  }

  .checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #007acc;
    cursor: pointer;
  }

  /* File upload specific */
  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .upload-icon {
    font-size: 3rem;
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 1rem;
    justify-content: center;
  }

  .file-icon {
    font-size: 2.5rem;
  }

  .file-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .file-name {
    font-weight: 600;
    word-break: break-all;
  }

  .clear-btn {
    background: #e53e3e;
    color: white;
    border: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .clear-btn:hover {
    background: #c53030;
  }

  /* Preview specific */
  .preview-info {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .preview-box {
    flex-shrink: 0;
  }

  .sheet-border {
    width: 80px;
    height: 110px;
    background: white;
    border: 2px solid #2d3748;
    border-radius: 3px;
    padding: 4px;
    box-shadow: 2px 2px 8px rgba(0,0,0,0.1);
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
    background: #f7fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 1px;
    position: relative;
  }

  .cell.has-cropmarks::before {
    content: '';
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
    background: white;
    border: 1px solid #cbd5e0;
    border-radius: 1px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.5rem;
    color: #718096;
  }

	.page-placeholder.has-border {
		border-color: #2d3748;
	}

  .preview-text p {
    margin-bottom: 0.3rem;
  }

  .preview-options {
    margin-top: 0.5rem;
    padding-left: 1.2rem;
    font-size: 0.85rem;
  }

  .preview-options li {
    margin-bottom: 0.15rem;
  }

  /* Large button variant */
  .btn-large {
    padding: 1rem 2rem;
    font-size: 1.1rem;
  }

  @media (max-width: 600px) {
    .settings-grid {
      grid-template-columns: 1fr 1fr;
    }

    .checkbox-grid {
      grid-template-columns: 1fr;
    }

    .preview-info {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
