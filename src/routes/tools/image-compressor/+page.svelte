<script lang="ts">
	import { base } from "$app/paths";
	import JSZip from "jszip";
	import { onDestroy } from "svelte";

	type OutputFormat = "jpeg" | "png" | "webp";
	type ResizeMode = "fit-box" | "target-width" | "target-height";

	type SourceImage = {
		file: File;
		previewUrl: string;
		width: number;
		height: number;
	};

	type ProcessedImage = {
		fileName: string;
		blob: Blob;
		previewUrl: string;
		width: number;
		height: number;
	};

	const formatOptions: Array<{ value: OutputFormat; label: string; mime: string; extension: string }> = [
		{ value: "jpeg", label: "JPEG", mime: "image/jpeg", extension: "jpg" },
		{ value: "png", label: "PNG", mime: "image/png", extension: "png" },
		{ value: "webp", label: "WebP", mime: "image/webp", extension: "webp" },
	];

	let sourceImages = $state<SourceImage[]>([]);
	let processedImages = $state<ProcessedImage[]>([]);
	let error = $state("");
	let processing = $state(false);
	let processedCount = $state(0);

	let outputFormat = $state<OutputFormat>("jpeg");
	let resizeMode = $state<ResizeMode>("fit-box");
	let maxWidth = $state(2048);
	let maxHeight = $state(2048);
	let quality = $state(82);
	let preventUpscale = $state(true);

	const activeFormat = $derived(formatOptions.find(option => option.value === outputFormat) ?? formatOptions[0]);
	const originalTotalBytes = $derived(sourceImages.reduce((sum, item) => sum + item.file.size, 0));
	const processedTotalBytes = $derived(processedImages.reduce((sum, item) => sum + item.blob.size, 0));
	const hasResults = $derived(processedImages.length > 0);
	const progressPercent = $derived(
		sourceImages.length > 0
			? Math.min(100, Math.round((processedCount / sourceImages.length) * 100))
			: 0,
	);
	const sizeDeltaPercent = $derived(
		originalTotalBytes > 0
			? ((processedTotalBytes - originalTotalBytes) / originalTotalBytes) * 100
			: 0,
	);
	const canProcess = $derived(sourceImages.length > 0 && !processing);

	function formatBytes(bytes: number) {
		if (!Number.isFinite(bytes) || bytes <= 0)
			return "0 B";
		const units = ["B", "KB", "MB", "GB"];
		let value = bytes;
		let index = 0;
		while (value >= 1024 && index < units.length - 1) {
			value /= 1024;
			index += 1;
		}
		return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
	}

	function sanitizePositiveInt(value: number, fallback: number, min: number, max: number) {
		if (!Number.isFinite(value))
			return fallback;
		return Math.min(max, Math.max(min, Math.floor(value)));
	}

	function sanitizeQuality(value: number, fallback: number) {
		if (!Number.isFinite(value))
			return fallback;
		return Math.min(100, Math.max(1, Math.floor(value)));
	}

	function baseName(fileName: string) {
		return fileName.replace(/\.[^.]+$/, "");
	}

	async function loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
			img.src = src;
		});
	}

	function clearProcessedImages() {
		processedImages.forEach(item => URL.revokeObjectURL(item.previewUrl));
		processedImages = [];
	}

	function clearSourceImages() {
		sourceImages.forEach(item => URL.revokeObjectURL(item.previewUrl));
		sourceImages = [];
	}

	function clearAll() {
		clearSourceImages();
		clearProcessedImages();
		error = "";
		processedCount = 0;
	}

	onDestroy(() => {
		clearSourceImages();
		clearProcessedImages();
	});

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}

	async function filesToSourceImages(files: File[]) {
		const validFiles = files.filter(file => file.type.startsWith("image/"));
		if (validFiles.length === 0) {
			error = "Please select one or more image files";
			return;
		}

		error = "";
		clearProcessedImages();

		const loaded: SourceImage[] = [];
		for (const file of validFiles) {
			const previewUrl = URL.createObjectURL(file);
			try {
				const img = await loadImage(previewUrl);
				loaded.push({
					file,
					previewUrl,
					width: img.width,
					height: img.height,
				});
			}
			catch {
				URL.revokeObjectURL(previewUrl);
			}
		}

		clearSourceImages();
		sourceImages = loaded;
		processedCount = 0;
		if (loaded.length === 0)
			error = "Could not load selected images";
	}

	async function handleSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		await filesToSourceImages(files);
		input.value = "";
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
		await filesToSourceImages(files);
	}

	function buildTargetSize(width: number, height: number) {
		let scale: number;
		if (resizeMode === "target-width") {
			scale = maxWidth / width;
		}
		else if (resizeMode === "target-height") {
			scale = maxHeight / height;
		}
		else {
			const scaleX = maxWidth / width;
			const scaleY = maxHeight / height;
			scale = Math.min(scaleX, scaleY);
		}
		if (!Number.isFinite(scale) || scale <= 0)
			scale = 1;
		if (preventUpscale)
			scale = Math.min(scale, 1);
		return {
			width: Math.max(1, Math.round(width * scale)),
			height: Math.max(1, Math.round(height * scale)),
		};
	}

	async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, qualityValue?: number): Promise<Blob> {
		return new Promise((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (!blob) {
					reject(new Error("Failed to encode image"));
					return;
				}
				resolve(blob);
			}, mime, qualityValue);
		});
	}

	async function processImages() {
		if (sourceImages.length === 0)
			return;

		maxWidth = sanitizePositiveInt(maxWidth, 2048, 64, 12000);
		maxHeight = sanitizePositiveInt(maxHeight, 2048, 64, 12000);
		quality = sanitizeQuality(quality, 82);

		processing = true;
		processedCount = 0;
		error = "";
		clearProcessedImages();

		try {
			const next: ProcessedImage[] = [];
			const qualityRatio = quality / 100;

			for (let index = 0; index < sourceImages.length; index += 1) {
				const source = sourceImages[index];
				const sourceUrl = URL.createObjectURL(source.file);
				try {
					const img = await loadImage(sourceUrl);
					const target = buildTargetSize(img.width, img.height);
					const canvas = document.createElement("canvas");
					canvas.width = target.width;
					canvas.height = target.height;
					const ctx = canvas.getContext("2d");
					if (!ctx)
						throw new Error("Unable to create canvas context");
					ctx.drawImage(img, 0, 0, target.width, target.height);

					const blob = await canvasToBlob(
						canvas,
						activeFormat.mime,
						outputFormat === "png" ? undefined : qualityRatio,
					);
					const previewUrl = URL.createObjectURL(blob);
					next.push({
						fileName: `${baseName(source.file.name)}.${activeFormat.extension}`,
						blob,
						previewUrl,
						width: target.width,
						height: target.height,
					});
					processedCount = index + 1;
				}
				finally {
					URL.revokeObjectURL(sourceUrl);
				}
			}

			processedImages = next;
		}
		catch (err) {
			error = (err as Error).message || "Failed to process images";
			clearProcessedImages();
		}
		finally {
			processing = false;
		}
	}

	async function downloadZip() {
		if (processedImages.length === 0 || processing)
			return;

		processing = true;
		error = "";
		try {
			const zip = new JSZip();
			processedImages.forEach((item) => {
				zip.file(item.fileName, item.blob);
			});
			const blob = await zip.generateAsync({ type: "blob" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `compressed_images_${outputFormat}.zip`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		}
		catch (err) {
			error = (err as Error).message || "Failed to create zip";
		}
		finally {
			processing = false;
		}
	}
</script>

<svelte:head>
	<title>Batch Image Compressor</title>
</svelte:head>

<main class="page-container">
	<a href="{base}/" class="back-link">← Back to Tools</a>

	<h1>🗜️ Batch Image Compressor</h1>
	<p class="subtitle">Resize, convert, and compress multiple images in one pass.</p>

	<section class="card-section">
		<h2>Upload Images</h2>
		<div
			class="drop-zone"
			class:has-file={sourceImages.length > 0}
			ondrop={handleDrop}
			ondragover={handleDragOver}
			role="button"
			tabindex="0"
		>
			<div class="drop-content">
				<span class="upload-icon">🖼️</span>
				<p>Drag & drop image files</p>
				<p class="text-muted">or</p>
				<label class="btn btn-primary">
					Browse Images
					<input type="file" accept="image/*" multiple onchange={handleSelect} hidden />
				</label>
				{#if sourceImages.length > 0}
					<p class="text-muted">{sourceImages.length} image{sourceImages.length === 1 ? "" : "s"} loaded</p>
				{/if}
			</div>
		</div>
		{#if sourceImages.length > 0}
			<div class="section-actions">
				<button type="button" class="btn" onclick={clearAll}>Clear All</button>
			</div>
		{/if}
	</section>

	<section class="card-section">
		<h2>Compression Settings</h2>
		<div class="mode-row">
			<span class="mode-label">Resize Mode</span>
			<div class="mode-buttons">
				<button type="button" class="btn mode-btn" class:active={resizeMode === "fit-box"} onclick={() => {
					resizeMode = "fit-box";
				}}>
					Fit Within Box
				</button>
				<button type="button" class="btn mode-btn" class:active={resizeMode === "target-width"} onclick={() => {
					resizeMode = "target-width";
				}}>
					Target Width
				</button>
				<button type="button" class="btn mode-btn" class:active={resizeMode === "target-height"} onclick={() => {
					resizeMode = "target-height";
				}}>
					Target Height
				</button>
			</div>
		</div>
		<div class="settings-grid">
			<div class="setting-group">
				<label for="format">Output Format</label>
				<select id="format" bind:value={outputFormat}>
					{#each formatOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
			{#if resizeMode !== "target-height"}
				<div class="setting-group">
					<label for="maxWidth">{resizeMode === "target-width" ? "Target Width (px)" : "Max Width (px)"}</label>
					<input id="maxWidth" type="number" min="64" max="12000" bind:value={maxWidth} />
				</div>
			{/if}
			{#if resizeMode !== "target-width"}
				<div class="setting-group">
					<label for="maxHeight">{resizeMode === "target-height" ? "Target Height (px)" : "Max Height (px)"}</label>
					<input id="maxHeight" type="number" min="64" max="12000" bind:value={maxHeight} />
				</div>
			{/if}
			{#if outputFormat !== "png"}
				<div class="setting-group">
					<label for="quality">Quality ({quality}%)</label>
					<input id="quality" type="range" min="1" max="100" bind:value={quality} />
				</div>
			{/if}
		</div>
		<p class="text-muted">
			{#if resizeMode === "fit-box"}
				Images are resized to fit inside max width/height while preserving aspect ratio.
			{:else if resizeMode === "target-width"}
				Width is fixed and height is auto-scaled to preserve aspect ratio.
			{:else}
				Height is fixed and width is auto-scaled to preserve aspect ratio.
			{/if}
		</p>
		<label class="checkbox-label">
			<input type="checkbox" bind:checked={preventUpscale} />
			<span>Prevent upscaling small images</span>
		</label>
		<p class="text-muted">Metadata is stripped during export when images are re-encoded.</p>
	</section>

	{#if error}
		<div class="error-message">⚠️ {error}</div>
	{/if}

	<section class="text-center mb-3">
		<button class="btn btn-primary btn-large" onclick={processImages} disabled={!canProcess}>
			{#if processing}
				<span class="spinner"></span>
				Processing {processedCount}/{sourceImages.length}...
			{:else}
				🚀 Compress Images
			{/if}
		</button>
	</section>

	{#if sourceImages.length > 0 || hasResults || processing}
		<section class="card-section status-panel" aria-live="polite">
			<div class="status-header">
				<h2>Compression Status</h2>
				<span class="status-pill" class:status-ready={hasResults && !processing} class:status-active={processing}>
					{#if processing}
						Processing
					{:else if hasResults}
						Ready
					{:else}
						Waiting
					{/if}
				</span>
			</div>
			{#if processing}
				<p class="status-text">Processing {processedCount} of {sourceImages.length} images...</p>
			{:else if hasResults}
				<p class="status-text">Complete: {processedImages.length} files are ready for download.</p>
			{:else}
				<p class="status-text">Adjust settings and run compression.</p>
			{/if}
			<div class="progress-track">
				<div class="progress-fill" style="width: {processing ? progressPercent : hasResults ? 100 : 0}%;"></div>
			</div>
			<div class="progress-meta text-muted">
				<span>{processing ? `${progressPercent}%` : hasResults ? "100%" : "0%"}</span>
				{#if hasResults}
					<span>{formatBytes(originalTotalBytes)} → {formatBytes(processedTotalBytes)}</span>
				{/if}
			</div>
			{#if hasResults}
				<div class="status-actions">
					<button class="btn btn-primary" type="button" onclick={downloadZip} disabled={processing}>
						📦 Download ZIP
					</button>
					<a href="#results" class="btn btn-link">View Previews ↓</a>
				</div>
			{/if}
		</section>
	{/if}

	{#if sourceImages.length > 0 && !processing && !hasResults}
		<section class="card-section">
			<h2>Source Files</h2>
			<div class="stats-grid">
				<div class="stat-card">
					<span class="stat-label">Total Source Size</span>
					<strong>{formatBytes(originalTotalBytes)}</strong>
				</div>
				<div class="stat-card">
					<span class="stat-label">Target Limit</span>
					<strong>{maxWidth} × {maxHeight}px</strong>
				</div>
			</div>
			<div class="image-grid">
				{#each sourceImages as item, index}
					<div class="image-item">
						<img src={item.previewUrl} alt="Source image {index + 1}" loading="lazy" />
						<div class="image-meta">
							<span>{item.width} × {item.height}px</span>
							<span>{formatBytes(item.file.size)}</span>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if hasResults}
		<section class="card-section" id="results">
			<h2>Results</h2>
			<div class="stats-grid">
				<div class="stat-card">
					<span class="stat-label">Compressed Size</span>
					<strong>{formatBytes(processedTotalBytes)}</strong>
				</div>
				<div class="stat-card">
					<span class="stat-label">Change</span>
					<strong class:positive={sizeDeltaPercent > 0} class:negative={sizeDeltaPercent <= 0}>
						{sizeDeltaPercent > 0 ? "+" : ""}{sizeDeltaPercent.toFixed(1)}%
					</strong>
				</div>
				<div class="stat-card">
					<span class="stat-label">Output Files</span>
					<strong>{processedImages.length} {activeFormat.label}</strong>
				</div>
			</div>

			<div class="image-grid">
				{#each processedImages as item, index}
					<div class="image-item">
						<img src={item.previewUrl} alt="Compressed image {index + 1}" loading="lazy" />
						<div class="image-meta">
							<span>{item.width} × {item.height}px</span>
							<span>{formatBytes(item.blob.size)}</span>
						</div>
					</div>
				{/each}
			</div>

			<div class="text-center mt-2">
				<button class="btn btn-primary btn-large" type="button" onclick={downloadZip} disabled={processing}>
					📦 Download ZIP
				</button>
			</div>
		</section>
	{/if}

	<footer class="text-center text-muted">
		<p>✨ Runs in your browser • No uploads required</p>
	</footer>
</main>

<style>
	.drop-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.upload-icon {
		font-size: 3rem;
	}

	.settings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.mode-row {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}

	.mode-label {
		font-size: 0.85rem;
		font-weight: 500;
		color: #4a5568;
	}

	.mode-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.mode-btn {
		background: white;
		border: 1px solid #e2e8f0;
		color: #4a5568;
		padding: 0.5rem 0.9rem;
	}

	.mode-btn:hover {
		border-color: #007acc;
		color: #007acc;
	}

	.mode-btn.active {
		background: #007acc;
		border-color: #007acc;
		color: white;
	}

	.setting-group {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.section-actions {
		margin-top: 1rem;
		display: flex;
		justify-content: flex-end;
	}

	.status-panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.status-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.status-header h2 {
		margin: 0;
	}

	.status-pill {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		color: #4a5568;
		background: #edf2f7;
	}

	.status-pill.status-active {
		background: #e6fffa;
		color: #0f766e;
	}

	.status-pill.status-ready {
		background: #f0fff4;
		color: #276749;
	}

	.status-text {
		margin: 0;
	}

	.progress-track {
		height: 10px;
		border-radius: 999px;
		background: #e2e8f0;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #38b2ac, #2b6cb0);
		transition: width 0.2s ease;
	}

	.progress-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.85rem;
	}

	.status-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.btn-link {
		text-decoration: none;
		background: #edf2f7;
		color: #2d3748;
	}

	.btn-link:hover {
		background: #e2e8f0;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.stat-card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.stat-label {
		color: #718096;
		font-size: 0.8rem;
	}

	.positive {
		color: #c05621;
	}

	.negative {
		color: #2f855a;
	}

	.image-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 0.75rem;
	}

	.image-item {
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		overflow: hidden;
		background: white;
	}

	.image-item img {
		display: block;
		width: 100%;
		height: 120px;
		object-fit: cover;
	}

	.image-meta {
		display: flex;
		flex-direction: column;
		padding: 0.5rem;
		gap: 0.2rem;
		font-size: 0.8rem;
		color: #4a5568;
	}

	.btn-large {
		padding: 1rem 2rem;
		font-size: 1.1rem;
	}

	@media (max-width: 600px) {
		.progress-meta {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
