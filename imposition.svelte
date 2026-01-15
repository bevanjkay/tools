<script>
	import { PDFDocument } from "pdf-lib";

	let pdfFile = null;
	let fileName = "";
	let rows = 2;
	let columns = 2;
	let pageOrder = "row"; // 'row' or 'column'
	let outputSize = "same"; // 'same', 'a4', 'letter', 'a3'
	let margin = 5; // margin in mm
	let repeatPages = false; // repeat each page to fill the sheet
	let resizeToFit = false; // resize pages to fill cell space
	let autoRotate = false; // auto-rotate pages to match cell orientation
	let showCropMarks = false; // add crop marks around each page
	let processing = false;
	let error = "";
	let originalPageCount = 0;

	const PAGE_SIZES = {
		a4: { width: 595.28, height: 841.89 },
		a3: { width: 841.89, height: 1190.55 },
		letter: { width: 612, height: 792 },
		legal: { width: 612, height: 1008 },
		tabloid: { width: 792, height: 1224 },
	};

	const MM_TO_POINTS = 2.83465;
	const CROP_MARK_LENGTH = 10; // points
	const CROP_MARK_OFFSET = 3; // points from content

	async function handleFileSelect(event) {
		const file = event.target.files[0];
		if (file && file.type === "application/pdf") {
			pdfFile = await file.arrayBuffer();
			fileName = file.name;
			error = "";

			// Get page count
			try {
				const pdfDoc = await PDFDocument.load(pdfFile);
				originalPageCount = pdfDoc.getPageCount();
			}
			catch (e) {
				error = `Failed to load PDF: ${e.message}`;
				pdfFile = null;
				fileName = "";
			}
		}
		else {
			error = "Please select a valid PDF file";
		}
	}

	async function handleDrop(event) {
		event.preventDefault();
		const file = event.dataTransfer.files[0];
		if (file && file.type === "application/pdf") {
			pdfFile = await file.arrayBuffer();
			fileName = file.name;
			error = "";

			try {
				const pdfDoc = await PDFDocument.load(pdfFile);
				originalPageCount = pdfDoc.getPageCount();
			}
			catch (e) {
				error = `Failed to load PDF: ${e.message}`;
				pdfFile = null;
				fileName = "";
			}
		}
		else {
			error = "Please drop a valid PDF file";
		}
	}

	function handleDragOver(event) {
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
			// Load the source PDF
			const sourcePdf = await PDFDocument.load(pdfFile);
			const sourcePages = sourcePdf.getPages();
			const totalSourcePages = sourcePages.length;

			// Create a new PDF document
			const outputPdf = await PDFDocument.create();

			// Pre-embed all source pages once for reuse
			const embeddedPages = await outputPdf.embedPdf(sourcePdf, sourcePages.map((_, i) => i));

			// Determine output page size
			let outputWidth, outputHeight;
			if (outputSize === "same" && sourcePages.length > 0) {
				// Use the first page's dimensions, scaled up for n-up
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
				// Default to A4
				outputWidth = PAGE_SIZES.a4.width;
				outputHeight = PAGE_SIZES.a4.height;
			}

			// Calculate how many source pages fit on one output page
			const pagesPerSheet = rows * columns;

			// Convert margin from mm to points
			const marginPts = margin * MM_TO_POINTS;

			// Calculate the number of output pages needed
			const outputPageCount = repeatPages
				? totalSourcePages // One output page per source page when repeating
				: Math.ceil(totalSourcePages / pagesPerSheet);

			// Calculate cell dimensions (with margins)
			const cellWidth = (outputWidth - marginPts * 2) / columns;
			const cellHeight = (outputHeight - marginPts * 2) / rows;

			// Process each output page
			for (let outputPageIndex = 0; outputPageIndex < outputPageCount; outputPageIndex++) {
				// Create a new output page
				const outputPage = outputPdf.addPage([outputWidth, outputHeight]);

				// Embed source pages for this sheet
				for (let cellIndex = 0; cellIndex < pagesPerSheet; cellIndex++) {
					// Determine which source page to use
					let sourcePageIndex;
					if (repeatPages) {
						// In repeat mode, use the same source page for all cells on this sheet
						sourcePageIndex = outputPageIndex;
					}
					else {
						sourcePageIndex = outputPageIndex * pagesPerSheet + cellIndex;
					}

					if (sourcePageIndex >= totalSourcePages) {
						break; // No more source pages
					}

					// Calculate row and column for this cell
					let cellRow, cellCol;
					if (pageOrder === "row") {
						// Left to right, top to bottom
						cellRow = Math.floor(cellIndex / columns);
						cellCol = cellIndex % columns;
					}
					else {
						// Top to bottom, left to right
						cellCol = Math.floor(cellIndex / rows);
						cellRow = cellIndex % rows;
					}

					// Get the source page
					const sourcePage = sourcePages[sourcePageIndex];
					const { width: srcWidth, height: srcHeight } = sourcePage.getSize();

					// Get the pre-embedded page (reused, not duplicated)
					const embeddedPage = embeddedPages[sourcePageIndex];

					// Determine if we need to rotate
					const cellIsLandscape = cellWidth > cellHeight;
					const pageIsLandscape = srcWidth > srcHeight;
					const shouldRotate = autoRotate && (cellIsLandscape !== pageIsLandscape);

					// Effective dimensions after rotation
					const effectiveWidth = shouldRotate ? srcHeight : srcWidth;
					const effectiveHeight = shouldRotate ? srcWidth : srcHeight;

					// Calculate scaling
					let scale;
					if (resizeToFit) {
						// Scale to fit in cell while maintaining aspect ratio
						const scaleX = cellWidth / effectiveWidth;
						const scaleY = cellHeight / effectiveHeight;
						scale = Math.min(scaleX, scaleY);
					}
					else {
						// Keep original size (1:1 scale)
						scale = 1;
					}

					// Calculate the scaled dimensions
					const scaledWidth = effectiveWidth * scale;
					const scaledHeight = effectiveHeight * scale;

					// Calculate position (centered in cell)
          // PDF coordinates start from bottom-left
					const cellX = marginPts + cellCol * cellWidth;
					const cellY = outputHeight - marginPts - (cellRow + 1) * cellHeight;

					// Center the page in the cell
					const offsetX = (cellWidth - scaledWidth) / 2;
					const offsetY = (cellHeight - scaledHeight) / 2;

					const x = cellX + offsetX;
					const y = cellY + offsetY;

					// Draw the embedded page
					if (shouldRotate) {
						// Rotate 90 degrees clockwise
						outputPage.drawPage(embeddedPage, {
							x: x + scaledWidth,
							y,
							width: srcWidth * scale,
							height: srcHeight * scale,
							rotate: { type: "degrees", angle: 90 },
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

					// Draw crop marks if enabled
					if (showCropMarks) {
						const cropColor = { type: "RGB", red: 0, green: 0, blue: 0 };
						const lineWidth = 0.25;

						// Top-left corner
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

						// Top-right corner
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

						// Bottom-left corner
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

						// Bottom-right corner
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

			// Save and download
			const pdfBytes = await outputPdf.save();
			downloadPdf(pdfBytes);
		}
		catch (e) {
			error = `Error processing PDF: ${e.message}`;
			console.error(e);
		}
		finally {
			processing = false;
		}
	}

	function downloadPdf(pdfBytes) {
		const blob = new Blob([pdfBytes], { type: "application/pdf" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");

		// Generate output filename
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

	$: nupPreview = `${columns} × ${rows} = ${columns * rows} pages per sheet`;
	$: estimatedOutputPages = originalPageCount > 0
		? (repeatPages
			? originalPageCount
			: Math.ceil(originalPageCount / (rows * columns)))
		: 0;
</script>

<main>
	<div class="container">
		<header>
			<h1>📄 PDF N-Up Layout Generator</h1>
			<p class="subtitle">Combine multiple PDF pages onto single sheets while preserving vector quality</p>
		</header>

		<section class="upload-section">
			<div
				class="drop-zone"
				class:has-file={pdfFile}
				on:drop={handleDrop}
				on:dragover={handleDragOver}
				role="button"
				tabindex="0"
			>
				{#if pdfFile}
					<div class="file-info">
						<span class="file-icon">📄</span>
						<div class="file-details">
							<span class="file-name">{fileName}</span>
							<span class="page-count">{originalPageCount} page{originalPageCount !== 1 ? "s" : ""}</span>
						</div>
						<button class="clear-btn" on:click|stopPropagation={clearFile}>✕</button>
					</div>
				{:else}
					<div class="drop-content">
						<span class="upload-icon">📥</span>
						<p>Drag & drop a PDF here</p>
						<p class="or">or</p>
						<label class="file-input-label">
							Browse Files
							<input type="file" accept=".pdf" on:change={handleFileSelect} />
						</label>
					</div>
				{/if}
			</div>
		</section>

		<section class="settings-section">
			<h2>Layout Settings</h2>

			<div class="settings-grid">
				<div class="setting-group">
					<label for="columns">Columns</label>
					<input
						id="columns"
						type="number"
						bind:value={columns}
						min="1"
						max="10"
					/>
				</div>

				<div class="setting-group">
					<label for="rows">Rows</label>
					<input
						id="rows"
						type="number"
						bind:value={rows}
						min="1"
						max="10"
					/>
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
					<label for="margin">Margin (mm)</label>
					<input
						id="margin"
						type="number"
						bind:value={margin}
						min="0"
						max="25"
						step="0.5"
					/>
				</div>

				<div class="setting-group checkbox-group">
					<label class="checkbox-label">
						<input
							type="checkbox"
							bind:checked={repeatPages}
						/>
						<span>Repeat each page to fill sheet</span>
					</label>
				</div>

				<div class="setting-group checkbox-group">
					<label class="checkbox-label">
						<input
							type="checkbox"
							bind:checked={resizeToFit}
						/>
						<span>Resize pages to fill space</span>
					</label>
				</div>

				<div class="setting-group checkbox-group">
					<label class="checkbox-label">
						<input
							type="checkbox"
							bind:checked={autoRotate}
						/>
						<span>Auto-rotate pages to fit cells</span>
					</label>
				</div>

				<div class="setting-group checkbox-group">
					<label class="checkbox-label">
						<input
							type="checkbox"
							bind:checked={showCropMarks}
						/>
						<span>Add crop marks</span>
					</label>
				</div>
			</div>

			<div class="preview-info">
				<div class="preview-box">
					<div class="sheet-preview">
						<div class="sheet-border" style="--cols: {columns}; --rows: {rows}; --margin: {margin}mm;">
							<div class="sheet-margin">
								<div class="grid-preview">
									{#each Array.from({ length: rows * columns }) as _, i}
										<div class="cell" class:has-cropmarks={showCropMarks}>
											<div class="page-placeholder">{i + 1}</div>
										</div>
									{/each}
								</div>
							</div>
						</div>
					</div>
				</div>
				<div class="preview-text">
					<p><strong>{nupPreview}</strong></p>
					{#if originalPageCount > 0}
						<p class="estimate">
							{originalPageCount} source pages → {estimatedOutputPages} output page{estimatedOutputPages !== 1 ? "s" : ""}
						</p>
					{/if}
					<ul class="preview-options">
						{#if repeatPages}<li>Each page repeated {columns * rows}×</li>{/if}
						{#if resizeToFit}<li>Pages scaled to fit</li>{:else}<li>Original page size</li>{/if}
						{#if autoRotate}<li>Auto-rotation enabled</li>{/if}
						{#if showCropMarks}<li>Crop marks included</li>{/if}
					</ul>
				</div>
			</div>
		</section>

		{#if error}
			<div class="error-message">
				⚠️ {error}
			</div>
		{/if}

		<section class="action-section">
			<button
				class="generate-btn"
				on:click={generateNupPdf}
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

		<footer>
			<p>✨ Vector quality preserved • No server upload • Runs entirely in your browser</p>
		</footer>
	</div>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding: 2rem;
  }

  main {
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  .container {
    background: white;
    border-radius: 20px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    padding: 2.5rem;
    max-width: 700px;
    width: 100%;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 1.8rem;
    color: #1a202c;
    margin-bottom: 0.5rem;
  }

  .subtitle {
    color: #718096;
    font-size: 0.95rem;
  }

  h2 {
    font-size: 1.1rem;
    color: #2d3748;
    margin-bottom: 1rem;
  }

  .upload-section {
    margin-bottom: 2rem;
  }

  .drop-zone {
    border: 2px dashed #cbd5e0;
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
    cursor: pointer;
    background: #f7fafc;
  }

  .drop-zone:hover {
    border-color: #667eea;
    background: #eef2ff;
  }

  .drop-zone.has-file {
    border-style: solid;
    border-color: #48bb78;
    background: #f0fff4;
  }

  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .upload-icon {
    font-size: 3rem;
  }

  .or {
    color: #a0aec0;
    font-size: 0.85rem;
  }

  .file-input-label {
    background: #667eea;
    color: white;
    padding: 0.6rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.2s;
  }

  .file-input-label:hover {
    background: #5a67d8;
  }

  .file-input-label input {
    display: none;
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
    color: #2d3748;
    word-break: break-all;
  }

  .page-count {
    color: #48bb78;
    font-size: 0.85rem;
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

  .settings-section {
    background: #f7fafc;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

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

  .setting-group label {
    font-size: 0.85rem;
    font-weight: 500;
    color: #4a5568;
  }

  .setting-group input,
  .setting-group select {
    padding: 0.6rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 1rem;
    background: white;
  }

  .setting-group input:focus,
  .setting-group select:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .checkbox-group {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.95rem;
    color: #4a5568;
  }

  .checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #667eea;
    cursor: pointer;
  }

  .preview-info {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    background: white;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .preview-box {
    flex-shrink: 0;
  }

  .sheet-preview {
    width: 100px;
    height: 130px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sheet-border {
    width: 80px;
    height: 110px;
    background: white;
    border: 2px solid #2d3748;
    border-radius: 3px;
    padding: calc(var(--margin) * 0.3);
    box-shadow: 2px 2px 8px rgba(0,0,0,0.1);
  }

  .sheet-margin {
    width: 100%;
    height: 100%;
    background: #f0f0f0;
  }

  .grid-preview {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(var(--rows), 1fr);
    gap: 2px;
    width: 100%;
    height: 100%;
    padding: 2px;
  }

  .cell {
    background: #f7fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 1px;
    position: relative;
  }

  .cell.has-cropmarks::before,
  .cell.has-cropmarks::after {
    content: '';
    position: absolute;
    background: #e53e3e;
  }

  .cell.has-cropmarks::before {
    width: 1px;
    height: 4px;
    top: -3px;
    left: 0;
  }

  .cell.has-cropmarks::after {
    width: 4px;
    height: 1px;
    top: 0;
    left: -3px;
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

  .preview-text p {
    margin-bottom: 0.3rem;
    color: #2d3748;
  }

  .estimate {
    color: #667eea;
    font-size: 0.9rem;
  }

  .preview-options {
    margin-top: 0.5rem;
    padding-left: 1.2rem;
    font-size: 0.8rem;
    color: #718096;
  }

  .preview-options li {
    margin-bottom: 0.15rem;
  }

  .error-message {
    background: #fed7d7;
    color: #c53030;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .action-section {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .generate-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 1rem 2.5rem;
    font-size: 1.1rem;
    font-weight: 600;
    border-radius: 12px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .generate-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
  }

  .generate-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  footer {
    text-align: center;
    color: #a0aec0;
    font-size: 0.85rem;
  }

  @media (max-width: 600px) {
    :global(body) {
      padding: 1rem;
    }

    .container {
      padding: 1.5rem;
    }

    h1 {
      font-size: 1.4rem;
    }

    .settings-grid {
      grid-template-columns: 1fr 1fr;
    }

    .preview-info {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
