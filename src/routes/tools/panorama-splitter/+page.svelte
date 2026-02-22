<script lang="ts">
	import { base } from "$app/paths";
	import JSZip from "jszip";

	// Image state
	let imageFile: File | null = $state(null);
	let imagePreview: string | null = $state(null);
	let imageDimensions: { width: number; height: number } | null = $state(null);

	// Split settings
	let splitCount = $state(3);
	let outputAspectRatio: "square" | "portrait" = $state("square");
	let paddingPercent = $state(0);
	let paddingColor = $state("#ffffff");
	let paddingMode: "per-slide" | "carousel" = $state("per-slide");

	// Output dimensions based on aspect ratio
	const outputWidth = 1080;
	const outputHeight = $derived(outputAspectRatio === "square" ? 1080 : 1350);

	// Preview state
	let processedPreviews: string[] = $state([]);
	let previewsGenerated = $state(false);

	// Processing state
	let processing = $state(false);
	let processedCount = $state(0);

	// Check if image will be pixelated
	const pixelationWarning = $derived(() => {
		if (!imageDimensions)
			return null;

		// Calculate the height each segment needs from the source image
		const segmentSourceWidth = imageDimensions.width / splitCount;
		const segmentAspectRatio = outputWidth / outputHeight;
		const segmentSourceHeight = segmentSourceWidth / segmentAspectRatio;

		// Account for padding - the actual image area is reduced by padding
		const paddingFraction = paddingPercent / 100;
		let effectiveOutputWidth: number;
		let effectiveOutputHeight: number;

		if (paddingMode === "per-slide") {
			// Per-slide: padding applied to each slide
			effectiveOutputWidth = outputWidth * (1 - paddingFraction * 2);
			effectiveOutputHeight = outputHeight * (1 - paddingFraction * 2);
		}
		else {
			// Carousel: padding only on the outer edges
			// Left/right padding only affects first/last slides, top/bottom affects all
			effectiveOutputWidth = outputWidth;
			effectiveOutputHeight = outputHeight * (1 - paddingFraction * 2);
		}

		// Cover mode: scale to fill the entire area (use the larger scale)
		const scaleX = effectiveOutputWidth / segmentSourceWidth;
		const scaleY = effectiveOutputHeight / Math.min(segmentSourceHeight, imageDimensions.height);
		const scale = Math.max(scaleX, scaleY);
		if (scale > 1) {
			return {
				scale,
				sourceWidth: Math.round(segmentSourceWidth),
				sourceHeight: Math.round(Math.min(segmentSourceHeight, imageDimensions.height)),
			};
		}

		return null;
	});

	const aspectRatioOptions = [
		{ value: "square" as const, label: "Square (1:1)", desc: "1080×1080" },
		{ value: "portrait" as const, label: "Portrait (4:5)", desc: "1080×1350" },
	];

	const paddingModeOptions = [
		{ value: "per-slide" as const, label: "Per Slide", desc: "Padding around each slide" },
		{ value: "carousel" as const, label: "Carousel", desc: "Padding around entire carousel" },
	];

	const splitCountOptions = [2, 3, 4, 5, 6, 7, 8, 9, 10];

	function clearPreviews() {
		processedPreviews.forEach(url => URL.revokeObjectURL(url));
		processedPreviews = [];
		previewsGenerated = false;
	}

	async function loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = (event) => {
				const error = new Error(`Failed to load image: ${src}`);
				(error as Error & { event: unknown }).event = event;
				reject(error);
			};
			img.src = src;
		});
	}

	async function handleImageSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file && file.type.startsWith("image/")) {
			await setImage(file);
		}
	}

	async function handleImageDrop(event: DragEvent) {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file && file.type.startsWith("image/")) {
			await setImage(file);
		}
	}

	async function setImage(file: File) {
		// Clean up previous image
		if (imagePreview) {
			URL.revokeObjectURL(imagePreview);
		}
		clearPreviews();

		imageFile = file;
		imagePreview = URL.createObjectURL(file);

		// Get image dimensions
		const img = await loadImage(imagePreview);
		imageDimensions = { width: img.width, height: img.height };
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}

	function clearImage() {
		if (imagePreview) {
			URL.revokeObjectURL(imagePreview);
		}
		imageFile = null;
		imagePreview = null;
		imageDimensions = null;
		clearPreviews();
	}

	async function generatePreviews() {
		if (!imageFile || !imageDimensions)
			return;

		processing = true;
		processedCount = 0;
		clearPreviews();

		try {
			const imageUrl = URL.createObjectURL(imageFile);
			let img: HTMLImageElement;
			try {
				img = await loadImage(imageUrl);
			}
			finally {
				URL.revokeObjectURL(imageUrl);
			}
			const newPreviews: string[] = [];

			// Calculate segment dimensions from source image
			const segmentSourceWidth = img.width / splitCount;

			// Calculate padding in pixels based on mode
			const paddingPixels = (paddingPercent / 100) * outputWidth;

			for (let i = 0; i < splitCount; i++) {
				const canvas = document.createElement("canvas");
				canvas.width = outputWidth;
				canvas.height = outputHeight;
				const ctx = canvas.getContext("2d")!;

				// Fill with padding color
				ctx.fillStyle = paddingColor;
				ctx.fillRect(0, 0, outputWidth, outputHeight);

				// Calculate source rectangle (the slice of the panorama)
				const sourceX = i * segmentSourceWidth;
				const sourceWidth = segmentSourceWidth;

				// Calculate content area based on padding mode
				let contentX: number;
				let contentY: number;
				let contentWidth: number;
				let contentHeight: number;

				if (paddingMode === "per-slide") {
					// Per-slide: padding on all sides of each slide
					contentX = paddingPixels;
					contentY = paddingPixels;
					contentWidth = outputWidth - paddingPixels * 2;
					contentHeight = outputHeight - paddingPixels * 2;
				}
				else {
					// Carousel: padding only on outer edges
					// Left padding only on first slide, right padding only on last slide
					// Top/bottom padding on all slides
					const isFirst = i === 0;
					const isLast = i === splitCount - 1;

					contentX = isFirst ? paddingPixels : 0;
					contentY = paddingPixels;
					contentWidth = outputWidth - (isFirst ? paddingPixels : 0) - (isLast ? paddingPixels : 0);
					contentHeight = outputHeight - paddingPixels * 2;
				}

				// Cover mode: scale to fill content area, may crop top/bottom
				const segmentAspectRatio = contentWidth / contentHeight;
				const sourceAspectRatio = sourceWidth / img.height;

				let drawSourceX = sourceX;
				let drawSourceY = 0;
				let drawSourceWidth = sourceWidth;
				let drawSourceHeight = img.height;

				if (sourceAspectRatio < segmentAspectRatio) {
					// Source is taller than needed, crop top/bottom
					drawSourceHeight = sourceWidth / segmentAspectRatio;
					drawSourceY = (img.height - drawSourceHeight) / 2;
				}
				else {
					// Source is wider than needed, crop sides (shouldn't happen with panoramas)
					drawSourceWidth = img.height * segmentAspectRatio;
					drawSourceX = sourceX + (sourceWidth - drawSourceWidth) / 2;
				}

				ctx.drawImage(
					img,
					drawSourceX,
					drawSourceY,
					drawSourceWidth,
					drawSourceHeight,
					contentX,
					contentY,
					contentWidth,
					contentHeight,
				);

				// Create preview URL
				const previewUrl = canvas.toDataURL("image/png");
				newPreviews.push(previewUrl);
				processedCount = i + 1;
			}

			processedPreviews = newPreviews;
			previewsGenerated = true;
		}
		catch (error) {
			console.error("Error generating previews:", error);
		}
		finally {
			processing = false;
		}
	}

	async function downloadZip() {
		if (processedPreviews.length === 0)
			return;

		processing = true;

		try {
			const zip = new JSZip();

			for (let i = 0; i < processedPreviews.length; i++) {
				const dataUrl = processedPreviews[i];
				const response = await fetch(dataUrl);
				const blob = await response.blob();

				const fileName = `panorama_${String(i + 1).padStart(2, "0")}.png`;
				zip.file(fileName, blob);
			}

			const zipBlob = await zip.generateAsync({ type: "blob" });
			const url = URL.createObjectURL(zipBlob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "panorama_split.zip";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		}
		catch (error) {
			console.error("Error creating zip:", error);
		}
		finally {
			processing = false;
		}
	}

	const canProcess = $derived(imageFile !== null);
	const canGeneratePreviews = $derived(canProcess && !previewsGenerated);
</script>

<svelte:head>
	<title>Panorama Splitter for Instagram</title>
</svelte:head>

<main class="page-container">
	<a href="{base}/" class="back-link">← Back to Tools</a>

	<h1>🌄 Panorama Splitter</h1>
	<p class="subtitle">Split wide panorama images into Instagram carousel slides</p>

	<!-- Image Upload -->
	<section class="card-section">
		<h2>Panorama Image</h2>
		<div
			class="drop-zone"
			class:has-file={imageFile}
			ondrop={handleImageDrop}
			ondragover={handleDragOver}
			role="button"
			tabindex="0"
		>
			{#if imagePreview}
				<div class="image-preview">
					<img src={imagePreview} alt="Panorama preview" />
					<div class="preview-overlay">
						<button type="button" class="remove-btn" onclick={clearImage}>✕</button>
					</div>
				</div>
				{#if imageDimensions}
					<p class="dimensions-info">{imageDimensions.width} × {imageDimensions.height}px</p>
				{/if}
			{:else}
				<div class="drop-content">
					<span class="upload-icon">🌄</span>
					<p>Drag & drop a panorama image</p>
					<p class="text-muted">or</p>
					<label class="btn btn-primary">
						Browse Files
						<input type="file" accept="image/*" onchange={handleImageSelect} hidden />
					</label>
				</div>
			{/if}
		</div>
	</section>

	<!-- Split Settings -->
	<section class="card-section">
		<h2>Split Settings</h2>

		<div class="settings-grid">
			<!-- Number of splits -->
			<div class="setting-group">
				<p class="setting-label">Number of Slides</p>
				<div class="split-count-buttons">
					{#each splitCountOptions as count}
						<button
							type="button"
							class="btn count-btn"
							class:active={splitCount === count}
							onclick={() => {
								splitCount = count;
								clearPreviews();
							}}
						>
							{count}
						</button>
					{/each}
				</div>
			</div>

			<!-- Aspect ratio -->
			<div class="setting-group">
				<p class="setting-label">Output Aspect Ratio</p>
				<div class="option-buttons">
					{#each aspectRatioOptions as option}
						<button
							type="button"
							class="btn option-btn"
							class:active={outputAspectRatio === option.value}
							onclick={() => {
								outputAspectRatio = option.value;
								clearPreviews();
							}}
							title={option.desc}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Padding -->
			<div class="setting-group">
				<label class="setting-label" for="padding">Padding</label>
				<div class="padding-controls">
					<div class="slider-group">
						<input
							id="padding"
							type="range"
							min="0"
							max="20"
							bind:value={paddingPercent}
							onchange={clearPreviews}
						/>
						<span class="slider-value">{paddingPercent}%</span>
					</div>
					{#if paddingPercent > 0}
						<div class="color-picker">
							<label for="padding-color">Color</label>
							<input
								id="padding-color"
								type="color"
								bind:value={paddingColor}
								onchange={clearPreviews}
							/>
						</div>
					{/if}
				</div>
				{#if paddingPercent > 0}
					<div class="padding-mode-section">
						<p class="setting-label">Apply To</p>
						<div class="option-buttons">
							{#each paddingModeOptions as mode}
								<button
									type="button"
									class="btn option-btn"
									class:active={paddingMode === mode.value}
									onclick={() => {
										paddingMode = mode.value;
										clearPreviews();
									}}
									title={mode.desc}
								>
									{mode.label}
								</button>
							{/each}
						</div>
						<p class="setting-hint">
							{#if paddingMode === "per-slide"}
								Padding around each individual slide
							{:else}
								Padding only on the outer edges of the carousel
							{/if}
						</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Pixelation warning -->
		{#if pixelationWarning()}
			{@const warning = pixelationWarning()}
			<div class="pixelation-warning">
				<span class="warning-icon">⚠️</span>
				<span>
					Image will be upscaled by {warning?.scale.toFixed(1)}× which may appear blurry.
					Source segment size: {warning?.sourceWidth}×{warning?.sourceHeight}px
				</span>
			</div>
		{/if}
	</section>

	<!-- Generate Preview Button -->
	<section class="text-center mb-3">
		<button
			type="button"
			class="btn btn-primary btn-large"
			onclick={generatePreviews}
			disabled={!canGeneratePreviews || processing}
		>
			{#if processing && !previewsGenerated}
				<span class="spinner"></span>
				Generating {processedCount}/{splitCount}...
			{:else}
				👁️ Generate Preview
			{/if}
		</button>
		{#if !canProcess && !processing}
			<p class="text-muted hint">Add a panorama image to continue</p>
		{/if}
	</section>

	<!-- Preview Section -->
	{#if previewsGenerated && processedPreviews.length > 0}
		<section class="card-section">
			<div class="section-header">
				<h2>Preview ({processedPreviews.length} slides)</h2>
				<span class="preview-resolution">{outputWidth} × {outputHeight}px each</span>
			</div>

			<!-- Carousel simulation -->
			<div class="carousel-preview">
				{#each processedPreviews as preview, index}
					<div class="carousel-slide">
						<img src={preview} alt="Slide {index + 1}" />
						<span class="slide-number">{index + 1}</span>
					</div>
				{/each}
			</div>

			<p class="text-muted text-center carousel-hint">← Scroll to preview the carousel →</p>

			<!-- Grid preview -->
			<div class="preview-grid">
				{#each processedPreviews as preview, index}
					<div class="preview-item">
						<img src={preview} alt="Final image {index + 1}" />
						<span class="image-number">{index + 1}</span>
					</div>
				{/each}
			</div>

			<div class="text-center mt-2">
				<button
					type="button"
					class="btn btn-primary btn-large"
					onclick={downloadZip}
					disabled={processing}
				>
					{#if processing}
						<span class="spinner"></span>
						Creating ZIP...
					{:else}
						🚀 Download ZIP
					{/if}
				</button>
			</div>
		</section>
	{/if}

	<footer class="text-center text-muted">
		<p>✨ Images processed in your browser • No upload required</p>
	</footer>
</main>

<style>
	/* Image preview */
	.image-preview {
		position: relative;
		display: inline-block;
		max-width: 100%;
	}

	.image-preview img {
		max-width: 100%;
		max-height: 300px;
		border-radius: 8px;
		object-fit: contain;
	}

	.preview-overlay {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
	}

	.dimensions-info {
		margin-top: 0.5rem;
		font-size: 0.9rem;
		color: #718096;
	}

	/* Drop content */
	.drop-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.upload-icon {
		font-size: 3rem;
	}

	/* Remove button */
	.remove-btn {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		background: #e53e3e;
		color: white;
		border: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		cursor: pointer;
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.image-preview:hover .remove-btn {
		opacity: 1;
	}

	.remove-btn:hover {
		background: #c53030;
	}

	/* Settings */
	.settings-grid {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.setting-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

		.setting-label {
			font-weight: 500;
			color: #4a5568;
			margin: 0;
		}

	.setting-hint {
		font-size: 0.85rem;
		color: #718096;
		margin: 0;
	}

	/* Split count buttons */
	.split-count-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.count-btn {
		background: white;
		border: 1px solid #e2e8f0;
		color: #4a5568;
		padding: 0.5rem 1rem;
		min-width: 48px;
	}

	.count-btn:hover {
		border-color: #007acc;
		color: #007acc;
	}

	.count-btn.active {
		background: #007acc;
		border-color: #007acc;
		color: white;
	}

	/* Option buttons */
	.option-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.option-btn {
		background: white;
		border: 1px solid #e2e8f0;
		color: #4a5568;
		padding: 0.5rem 1rem;
	}

	.option-btn:hover {
		border-color: #007acc;
		color: #007acc;
	}

	.option-btn.active {
		background: #007acc;
		border-color: #007acc;
		color: white;
	}

	/* Padding controls */
	.padding-controls {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.slider-group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 200px;
	}

	.slider-group input[type="range"] {
		flex: 1;
		height: 6px;
		border-radius: 3px;
		background: #e2e8f0;
		appearance: none;
		cursor: pointer;
	}

	.slider-group input[type="range"]::-webkit-slider-thumb {
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #007acc;
		cursor: pointer;
	}

	.slider-group input[type="range"]::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #007acc;
		cursor: pointer;
		border: none;
	}

	.slider-value {
		min-width: 40px;
		text-align: right;
		font-size: 0.9rem;
		color: #718096;
		font-variant-numeric: tabular-nums;
	}

	.color-picker {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.color-picker input[type="color"] {
		width: 40px;
		height: 32px;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		cursor: pointer;
		padding: 2px;
	}

	/* Padding mode section */
	.padding-mode-section {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* Pixelation warning */
	.pixelation-warning {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background: #fffaf0;
		border: 1px solid #ed8936;
		border-radius: 8px;
		color: #c05621;
		font-size: 0.9rem;
	}

	.warning-icon {
		font-size: 1.1rem;
	}

	/* Section header */
	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.section-header h2 {
		margin-bottom: 0;
	}

	.preview-resolution {
		font-size: 0.9rem;
		color: #718096;
	}

	/* Carousel preview */
	.carousel-preview {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding: 1rem 0;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
	}

	.carousel-slide {
		position: relative;
		flex-shrink: 0;
		width: 280px;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		scroll-snap-align: start;
	}

	.carousel-slide img {
		width: 100%;
		height: auto;
		display: block;
	}

	.slide-number {
		position: absolute;
		bottom: 0.5rem;
		left: 0.5rem;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}

	.carousel-hint {
		font-size: 0.85rem;
		margin-bottom: 1.5rem;
	}

	/* Preview grid */
	.preview-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 1rem;
	}

	.preview-item {
		position: relative;
		border-radius: 8px;
		overflow: hidden;
		background: #f7fafc;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.preview-item img {
		width: 100%;
		height: auto;
		display: block;
	}

	.image-number {
		position: absolute;
		bottom: 0.5rem;
		left: 0.5rem;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		font-size: 0.85rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}

	/* Large button */
	.btn-large {
		padding: 1rem 2rem;
		font-size: 1.1rem;
	}

	.hint {
		margin-top: 0.75rem;
		font-size: 0.9rem;
	}

	.mt-2 {
		margin-top: 1.5rem;
	}

	/* Responsive */
	@media (max-width: 600px) {
		.split-count-buttons {
			gap: 0.4rem;
		}

		.count-btn {
			padding: 0.4rem 0.75rem;
			min-width: 40px;
		}

		.carousel-slide {
			width: 220px;
		}

		.preview-grid {
			grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		}

		.padding-controls {
			flex-direction: column;
			align-items: flex-start;
		}

		.slider-group {
			width: 100%;
		}
	}
</style>
