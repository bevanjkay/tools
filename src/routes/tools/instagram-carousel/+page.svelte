<script lang="ts">
	import { base } from "$app/paths";
	import JSZip from "jszip";

	// Resolution settings
	let width = $state(1080);
	let height = $state(1080);

	// Background settings
	let backgroundType: "image" | "color" | "gradient" = $state("image");
	let backgroundFile: File | null = $state(null);
	let backgroundPreview: string | null = $state(null);
	let backgroundDimensions: { width: number; height: number } | null = $state(null);
	let backgroundMode: "fit" | "cover" | "stretch" | "cover-all" | "tile" = $state("cover");

	// Solid color background
	let bgColor = $state("#1a1a2e");

	// Gradient background
	let gradientType: "linear" | "radial" = $state("linear");
	let gradientMode: "single" | "cover-all" = $state("single");
	let gradientAngle = $state(135);
	let gradientColor1 = $state("#667eea");
	let gradientColor2 = $state("#764ba2");

	// Batch images
	let imageFiles: File[] = $state([]);
	let imagePreviews: string[] = $state([]);
	let imageDimensions: { width: number; height: number }[] = $state([]);

	// Drag reorder state
	let dragIndex: number | null = $state(null);
	let dragOverIndex: number | null = $state(null);

	// Preview of processed images
	let processedPreviews: string[] = $state([]);
	let previewsGenerated = $state(false);

	// Processing state
	let processing = $state(false);
	let processedCount = $state(0);

	// Export settings
	let exportFormat: "png" | "jpg" = $state("png");
	let jpgQuality = $state(92);

	// Layout mode
	let layoutMode: "centered" | "scattered" = $state("centered");
	let scatterSpread = $state(50); // How far from center images can scatter (percentage)
	let scatterSeed = $state(1); // Seed for consistent randomness

	// Image styling
	let roundedCorners = $state(false);
	let cornerRadius = $state(20);
	const cornerRadiusPresets = [5, 10, 20, 50];
	let dropShadow = $state(false);
	let shadowBlur = $state(30);
	let shadowOffsetY = $state(15);

	// Check for upscaled images (images shown larger than original)
	const upscaledImages = $derived(
		imageDimensions
			.map((dim, index) => {
				// Calculate the scale factor used (90% of fit scale for centered, 70% for scattered)
				const scaleFactor = layoutMode === "scattered" ? 0.7 : 0.9;
				const scale = Math.min(width / dim.width, height / dim.height) * scaleFactor;
				const isUpscaled = scale > 1;
				return { index, isUpscaled, scale, originalWidth: dim.width, originalHeight: dim.height };
			})
			.filter(item => item.isUpscaled),
	);

	// Check if background will be upscaled based on current mode
	const backgroundUpscaled = $derived(() => {
		if (backgroundType !== "image" || !backgroundDimensions)
			return null;
		const totalSlides = Math.max(imageFiles.length, 1);
		let requiredWidth = width;
		const requiredHeight = height;

		if (backgroundMode === "cover") {
			// Cover mode scales to fill single slide
			const scale = Math.max(width / backgroundDimensions.width, height / backgroundDimensions.height);
			if (scale > 1)
				return { scale, originalWidth: backgroundDimensions.width, originalHeight: backgroundDimensions.height };
		}
		else if (backgroundMode === "cover-all") {
			// Cover-all scales to fill all slides horizontally
			requiredWidth = width * totalSlides;
			const scale = Math.max(requiredWidth / backgroundDimensions.width, requiredHeight / backgroundDimensions.height);
			if (scale > 1)
				return { scale, originalWidth: backgroundDimensions.width, originalHeight: backgroundDimensions.height };
		}
		else if (backgroundMode === "stretch") {
			// Stretch always fills, check if either dimension is upscaled
			const scaleX = width / backgroundDimensions.width;
			const scaleY = height / backgroundDimensions.height;
			const maxScale = Math.max(scaleX, scaleY);
			if (maxScale > 1)
				return { scale: maxScale, originalWidth: backgroundDimensions.width, originalHeight: backgroundDimensions.height };
		}
		// Fit mode scales down, never up
		return null;
	});

	// Common Instagram sizes
	const presets = [
		{ name: "Square (1:1)", width: 1080, height: 1080 },
		{ name: "Portrait (4:5)", width: 1080, height: 1350 },
		{ name: "Landscape (1.91:1)", width: 1080, height: 566 },
	];

	// Background position modes
	const bgModes = [
		{ value: "cover" as const, label: "Cover", desc: "Fill & crop" },
		{ value: "cover-all" as const, label: "Cover All", desc: "Seamless pan" },
		{ value: "tile" as const, label: "Tile", desc: "Repeat pattern" },
		{ value: "fit" as const, label: "Fit", desc: "Fit inside" },
		{ value: "stretch" as const, label: "Stretch", desc: "Stretch to fill" },
	];

	function applyPreset(preset: { width: number; height: number }) {
		width = preset.width;
		height = preset.height;
		clearPreviews();
	}

	function clearPreviews() {
		processedPreviews.forEach(url => URL.revokeObjectURL(url));
		processedPreviews = [];
		previewsGenerated = false;
	}

	async function handleBackgroundSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file && file.type.startsWith("image/")) {
			backgroundFile = file;
			const url = URL.createObjectURL(file);
			backgroundPreview = url;
			const img = await loadImage(url);
			backgroundDimensions = { width: img.width, height: img.height };
			clearPreviews();
		}
	}

	async function handleBackgroundDrop(event: DragEvent) {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file && file.type.startsWith("image/")) {
			backgroundFile = file;
			const url = URL.createObjectURL(file);
			backgroundPreview = url;
			const img = await loadImage(url);
			backgroundDimensions = { width: img.width, height: img.height };
			clearPreviews();
		}
	}

	async function handleImagesSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const files = target.files;
		if (files) {
			const newFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
			const newPreviews: string[] = [];
			const newDimensions: { width: number; height: number }[] = [];

			for (const file of newFiles) {
				const url = URL.createObjectURL(file);
				newPreviews.push(url);
				const img = await loadImage(url);
				newDimensions.push({ width: img.width, height: img.height });
			}

			imageFiles = [...imageFiles, ...newFiles];
			imagePreviews = [...imagePreviews, ...newPreviews];
			imageDimensions = [...imageDimensions, ...newDimensions];
			clearPreviews();
		}
	}

	async function handleImagesDrop(event: DragEvent) {
		event.preventDefault();
		const files = event.dataTransfer?.files;
		if (files) {
			const newFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
			const newPreviews: string[] = [];
			const newDimensions: { width: number; height: number }[] = [];

			for (const file of newFiles) {
				const url = URL.createObjectURL(file);
				newPreviews.push(url);
				const img = await loadImage(url);
				newDimensions.push({ width: img.width, height: img.height });
			}

			imageFiles = [...imageFiles, ...newFiles];
			imagePreviews = [...imagePreviews, ...newPreviews];
			imageDimensions = [...imageDimensions, ...newDimensions];
			clearPreviews();
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}

	function removeImage(index: number) {
		URL.revokeObjectURL(imagePreviews[index]);
		imageFiles = imageFiles.filter((_, i) => i !== index);
		imagePreviews = imagePreviews.filter((_, i) => i !== index);
		imageDimensions = imageDimensions.filter((_, i) => i !== index);
		clearPreviews();
	}

	function clearBackground() {
		if (backgroundPreview) {
			URL.revokeObjectURL(backgroundPreview);
		}
		backgroundFile = null;
		backgroundPreview = null;
		backgroundDimensions = null;
		clearPreviews();
	}

	function clearAllImages() {
		imagePreviews.forEach(url => URL.revokeObjectURL(url));
		imageFiles = [];
		imagePreviews = [];
		imageDimensions = [];
		clearPreviews();
	}

	// Drag and drop reordering
	function handleReorderDragStart(index: number) {
		dragIndex = index;
	}

	function handleReorderDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		if (dragIndex !== null && dragIndex !== index) {
			dragOverIndex = index;
		}
	}

	function handleReorderDrop(index: number) {
		if (dragIndex !== null && dragIndex !== index) {
			// Reorder all arrays
			const newFiles = [...imageFiles];
			const newPreviews = [...imagePreviews];
			const newDimensions = [...imageDimensions];

			// Remove from old position
			const [movedFile] = newFiles.splice(dragIndex, 1);
			const [movedPreview] = newPreviews.splice(dragIndex, 1);
			const [movedDimension] = newDimensions.splice(dragIndex, 1);

			// Insert at new position
			newFiles.splice(index, 0, movedFile);
			newPreviews.splice(index, 0, movedPreview);
			newDimensions.splice(index, 0, movedDimension);

			imageFiles = newFiles;
			imagePreviews = newPreviews;
			imageDimensions = newDimensions;
			clearPreviews();
		}
		dragIndex = null;
		dragOverIndex = null;
	}

	function handleReorderDragEnd() {
		dragIndex = null;
		dragOverIndex = null;
	}

	async function loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = (event) => {
				const error = new Error(`Failed to load image: ${src}`);
				(error as any).event = event;
				reject(error);
			};
			img.src = src;
		});
	}

	// Seeded random number generator for consistent scatter positions
	function seededRandom(seed: number): () => number {
		return function () {
			seed = (seed * 9301 + 49297) % 233280;
			return seed / 233280;
		};
	}

	// Generate scattered position for an image - allows horizontal spillover into neighboring slides
	function getScatteredPosition(
		index: number,
		scaledWidth: number,
		scaledHeight: number,
	): { x: number; y: number } {
		const random = seededRandom(scatterSeed * 1000 + index * 137);

		// Allow images to spill beyond left/right edges based on spread percentage
		// At 100% spread, images can be positioned up to 30% of their width outside
		const spillAmount = scatterSpread / 100;
		const maxOffsetX = (width / 2 + scaledWidth * 0.3) * spillAmount;

		// Vertical movement is constrained - images can touch edges but not exceed them
		// Calculate the maximum vertical offset that keeps image within canvas
		const maxOffsetY = ((height - scaledHeight) / 2) * spillAmount;

		// Generate random offsets from center
		const offsetX = (random() - 0.5) * 2 * maxOffsetX;
		const offsetY = (random() - 0.5) * 2 * maxOffsetY;

		// Center position plus offset
		const x = (width - scaledWidth) / 2 + offsetX;
		let y = (height - scaledHeight) / 2 + offsetY;

		// Clamp vertical position to ensure image stays within canvas
		y = Math.max(0, Math.min(height - scaledHeight, y));

		return { x, y };
	}

	function drawColorOrGradientBackground(ctx: CanvasRenderingContext2D, index = 0, total = 1) {
		if (backgroundType === "color") {
			ctx.fillStyle = bgColor;
			ctx.fillRect(0, 0, width, height);
		}
		else if (backgroundType === "gradient") {
			let gradient: CanvasGradient;

			if (gradientType === "linear") {
				// Convert angle to coordinates
				const angleRad = (gradientAngle - 90) * (Math.PI / 180);

				if (gradientMode === "cover-all" && total > 1) {
					// Gradient spans all slides
					const totalWidth = width * total;
					const centerX = totalWidth / 2;
					const centerY = height / 2;
					const length = Math.sqrt(totalWidth * totalWidth + height * height) / 2;

					// Calculate gradient coordinates relative to total width
					const x1 = centerX - Math.cos(angleRad) * length - (index * width);
					const y1 = centerY - Math.sin(angleRad) * length;
					const x2 = centerX + Math.cos(angleRad) * length - (index * width);
					const y2 = centerY + Math.sin(angleRad) * length;

					gradient = ctx.createLinearGradient(x1, y1, x2, y2);
				}
				else {
					// Single slide gradient
					const centerX = width / 2;
					const centerY = height / 2;
					const length = Math.sqrt(width * width + height * height) / 2;

					const x1 = centerX - Math.cos(angleRad) * length;
					const y1 = centerY - Math.sin(angleRad) * length;
					const x2 = centerX + Math.cos(angleRad) * length;
					const y2 = centerY + Math.sin(angleRad) * length;

					gradient = ctx.createLinearGradient(x1, y1, x2, y2);
				}
			}
			else {
				// Radial gradient
				if (gradientMode === "cover-all" && total > 1) {
					// Radial gradient centered across all slides
					const totalWidth = width * total;
					const centerX = totalWidth / 2 - (index * width);
					const centerY = height / 2;
					const radius = Math.max(totalWidth, height) / 2;
					gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
				}
				else {
					// Single slide radial gradient
					const centerX = width / 2;
					const centerY = height / 2;
					const radius = Math.max(width, height) / 2;
					gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
				}
			}

			gradient.addColorStop(0, gradientColor1);
			gradient.addColorStop(1, gradientColor2);
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}
	}

	function drawBackground(ctx: CanvasRenderingContext2D, backgroundImg: HTMLImageElement | null, index = 0, total = 1) {
		// Handle color or gradient backgrounds
		if (backgroundType !== "image" || !backgroundImg) {
			drawColorOrGradientBackground(ctx, index, total);
			return;
		}
		let bgX = 0;
		let bgY = 0;
		let bgWidth = width;
		let bgHeight = height;

		if (backgroundMode === "cover") {
			// Scale to cover the canvas, centered
			const bgScale = Math.max(width / backgroundImg.width, height / backgroundImg.height);
			bgWidth = backgroundImg.width * bgScale;
			bgHeight = backgroundImg.height * bgScale;
			bgX = (width - bgWidth) / 2;
			bgY = (height - bgHeight) / 2;
			ctx.drawImage(backgroundImg, bgX, bgY, bgWidth, bgHeight);
		}
		else if (backgroundMode === "cover-all") {
			// Scale background to cover all images horizontally for seamless panning
			const totalWidth = width * total;
			const bgScale = Math.max(totalWidth / backgroundImg.width, height / backgroundImg.height);
			bgWidth = backgroundImg.width * bgScale;
			bgHeight = backgroundImg.height * bgScale;
			// Center vertically
			bgY = (height - bgHeight) / 2;
			// Offset horizontally based on which image we're rendering
			// Center the total background, then shift by index * width
			const totalBgX = (totalWidth - bgWidth) / 2;
			bgX = totalBgX - (index * width);
			ctx.drawImage(backgroundImg, bgX, bgY, bgWidth, bgHeight);
		}
		else if (backgroundMode === "tile") {
			// Tile the background image as a repeating pattern
			const pattern = ctx.createPattern(backgroundImg, "repeat");
			if (pattern) {
				ctx.fillStyle = pattern;
				ctx.fillRect(0, 0, width, height);
			}
		}
		else if (backgroundMode === "fit") {
			// Scale to fit inside the canvas, centered with letterboxing
			const bgScale = Math.min(width / backgroundImg.width, height / backgroundImg.height);
			bgWidth = backgroundImg.width * bgScale;
			bgHeight = backgroundImg.height * bgScale;
			bgX = (width - bgWidth) / 2;
			bgY = (height - bgHeight) / 2;
			// Fill background with a color first for letterboxing
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);
			ctx.drawImage(backgroundImg, bgX, bgY, bgWidth, bgHeight);
		}
		else {
			// "stretch" uses default values: 0, 0, width, height
			ctx.drawImage(backgroundImg, bgX, bgY, bgWidth, bgHeight);
		}
	}

	// Helper to draw an image on canvas with styling
	function drawStyledImage(
		ctx: CanvasRenderingContext2D,
		img: HTMLImageElement,
		x: number,
		y: number,
		scaledWidth: number,
		scaledHeight: number,
	) {
		// Apply drop shadow if enabled
		if (dropShadow) {
			ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
			ctx.shadowBlur = shadowBlur;
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = shadowOffsetY;
		}

		// Draw the image with optional rounded corners
		if (roundedCorners) {
			ctx.beginPath();
			ctx.roundRect(x, y, scaledWidth, scaledHeight, cornerRadius);
			ctx.closePath();
			ctx.save();
			ctx.clip();
			ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
			ctx.restore();
			ctx.shadowColor = "transparent";
		}
		else {
			ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
		}

		// Reset shadow
		ctx.shadowColor = "transparent";
		ctx.shadowBlur = 0;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
	}

	async function generatePreviews() {
		// Check if we have a valid background (image file, or color/gradient type)
		const hasValidBackground = backgroundType !== "image" || backgroundFile !== null;
		if (!hasValidBackground || imageFiles.length === 0)
			return;

		processing = true;
		processedCount = 0;
		clearPreviews();

		try {
			let backgroundImg: HTMLImageElement | null = null;
			let backgroundUrl: string | null = null;

			if (backgroundType === "image" && backgroundFile) {
				backgroundUrl = URL.createObjectURL(backgroundFile);
				backgroundImg = await loadImage(backgroundUrl);
			}

			const newPreviews: string[] = [];

			// Pre-load all images and calculate their positions
			const loadedImages: { img: HTMLImageElement; url: string; scaledWidth: number; scaledHeight: number; x: number; y: number }[] = [];

			for (let i = 0; i < imageFiles.length; i++) {
				const file = imageFiles[i];
				const imageUrl = URL.createObjectURL(file);
				const img = await loadImage(imageUrl);

				const scaleFactor = layoutMode === "scattered" ? 0.7 : 0.9;
				const scale = Math.min(width / img.width, height / img.height) * scaleFactor;
				const scaledWidth = img.width * scale;
				const scaledHeight = img.height * scale;

				let x: number;
				let y: number;

				if (layoutMode === "scattered") {
					const pos = getScatteredPosition(i, scaledWidth, scaledHeight);
					x = pos.x;
					y = pos.y;
				}
				else {
					x = (width - scaledWidth) / 2;
					y = (height - scaledHeight) / 2;
				}

				loadedImages.push({ img, url: imageUrl, scaledWidth, scaledHeight, x, y });
			}

			// Now render each slide, including spillover from neighboring slides
			for (let i = 0; i < imageFiles.length; i++) {
				const canvas = document.createElement("canvas");
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext("2d")!;

				// Draw background based on mode
				drawBackground(ctx, backgroundImg, i, imageFiles.length);

				// In scattered mode, draw images that spill into this slide from neighbors
				if (layoutMode === "scattered") {
					// Draw previous slide's image if it spills into this slide (from the left)
					if (i > 0) {
						const prev = loadedImages[i - 1];
						// Previous image's right edge in its own coordinate system
						const prevRightEdge = prev.x + prev.scaledWidth;
						// If it extends past the slide width, it spills into the next slide
						if (prevRightEdge > width) {
							// Draw it offset by -width (shifted left by one slide)
							drawStyledImage(ctx, prev.img, prev.x - width, prev.y, prev.scaledWidth, prev.scaledHeight);
						}
					}

					// Draw next slide's image if it spills into this slide (from the right)
					if (i < imageFiles.length - 1) {
						const next = loadedImages[i + 1];
						// If next image starts before 0, it spills into the previous slide
						if (next.x < 0) {
							// Draw it offset by +width (shifted right by one slide)
							drawStyledImage(ctx, next.img, next.x + width, next.y, next.scaledWidth, next.scaledHeight);
						}
					}
				}

				// Draw the current slide's main image (on top of spillover)
				const current = loadedImages[i];
				drawStyledImage(ctx, current.img, current.x, current.y, current.scaledWidth, current.scaledHeight);

				// Create preview URL (always PNG for consistent quality)
				const previewUrl = canvas.toDataURL("image/png");
				newPreviews.push(previewUrl);

				processedCount = i + 1;
			}

			// Clean up image URLs
			for (const item of loadedImages) {
				URL.revokeObjectURL(item.url);
			}

			if (backgroundUrl) {
				URL.revokeObjectURL(backgroundUrl);
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
			const extension = exportFormat === "jpg" ? "jpg" : "png";

			for (let i = 0; i < processedPreviews.length; i++) {
				// Convert data URL to blob
				const dataUrl = processedPreviews[i];
				let blob: Blob;

				if (exportFormat === "jpg") {
					// Convert PNG preview to JPG
					const response = await fetch(dataUrl);
					const img = await createImageBitmap(await response.blob());
					const canvas = document.createElement("canvas");
					canvas.width = img.width;
					canvas.height = img.height;
					const ctx = canvas.getContext("2d")!;
					ctx.drawImage(img, 0, 0);
					const jpgDataUrl = canvas.toDataURL("image/jpeg", jpgQuality / 100);
					const jpgResponse = await fetch(jpgDataUrl);
					blob = await jpgResponse.blob();
				}
				else {
					// Use PNG preview as-is
					const response = await fetch(dataUrl);
					blob = await response.blob();
				}

				// Add to zip
				const fileName = `carousel_${String(i + 1).padStart(2, "0")}.${extension}`;
				zip.file(fileName, blob);
			}

			// Generate and download zip
			const zipBlob = await zip.generateAsync({ type: "blob" });
			const url = URL.createObjectURL(zipBlob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "instagram_carousel.zip";
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

	const canProcess = $derived(
		(backgroundType !== "image" || backgroundFile !== null) && imageFiles.length > 0,
	);
	const canGeneratePreviews = $derived(canProcess && !previewsGenerated);
</script>

<svelte:head>
	<title>Instagram Carousel Creator</title>
</svelte:head>

<main class="page-container">
	<a href="{base}/" class="back-link">← Back to Tools</a>

	<h1>📸 Instagram Carousel Creator</h1>
	<p class="subtitle">Create carousel images with a consistent background</p>

	<!-- Resolution Settings -->
	<section class="card-section">
		<h2>Output Resolution</h2>
		<div class="resolution-controls">
			<div class="presets">
				{#each presets as preset}
					<button
						type="button"
						class="btn preset-btn"
						class:active={width === preset.width && height === preset.height}
						onclick={() => applyPreset(preset)}
					>
						{preset.name}
					</button>
				{/each}
			</div>
			<div class="custom-size">
				<div class="size-input">
					<label for="width">Width</label>
					<input id="width" type="number" bind:value={width} min="100" max="4096" />
				</div>
				<span class="size-separator">×</span>
				<div class="size-input">
					<label for="height">Height</label>
					<input id="height" type="number" bind:value={height} min="100" max="4096" />
				</div>
			</div>
		</div>
	</section>

	<!-- Background -->
	<section class="card-section">
		<h2>Background</h2>

		<!-- Background type selector -->
		<div class="bg-type-selector">
			<button
				type="button"
				class="btn bg-type-btn"
				class:active={backgroundType === "image"}
				onclick={() => {
					backgroundType = "image";
					clearPreviews();
				}}
			>
				🖼️ Image
			</button>
			<button
				type="button"
				class="btn bg-type-btn"
				class:active={backgroundType === "color"}
				onclick={() => {
					backgroundType = "color";
					clearPreviews();
				}}
			>
				🎨 Solid Color
			</button>
			<button
				type="button"
				class="btn bg-type-btn"
				class:active={backgroundType === "gradient"}
				onclick={() => {
					backgroundType = "gradient";
					clearPreviews();
				}}
			>
				🌈 Gradient
			</button>
		</div>

		<!-- Image background -->
		{#if backgroundType === "image"}
			<div
				class="drop-zone"
				class:has-file={backgroundFile}
				ondrop={handleBackgroundDrop}
				ondragover={handleDragOver}
				role="button"
				tabindex="0"
			>
				{#if backgroundPreview}
					<div class="background-preview">
						<img src={backgroundPreview} alt="Background preview" />
						<div class="preview-overlay">
							<button type="button" class="remove-btn" onclick={clearBackground}>✕</button>
						</div>
					</div>
				{:else}
					<div class="drop-content">
						<span class="upload-icon">🖼️</span>
						<p>Drag & drop a background image</p>
						<p class="text-muted">or</p>
						<label class="btn btn-primary">
							Browse Files
							<input type="file" accept="image/*" onchange={handleBackgroundSelect} hidden />
						</label>
					</div>
				{/if}
			</div>

			{#if backgroundFile}
				<div class="bg-mode-selector">
					<span class="mode-label">Background Position:</span>
					<div class="mode-buttons">
						{#each bgModes as mode}
							<button
								type="button"
								class="btn mode-btn"
								class:active={backgroundMode === mode.value}
								onclick={() => {
									backgroundMode = mode.value;
									clearPreviews();
								}}
								title={mode.desc}
							>
								{mode.label}
							</button>
						{/each}
					</div>
				</div>

				{#if backgroundUpscaled()}
					{@const info = backgroundUpscaled()}
					<div class="upscale-warning">
						<span class="warning-icon">⚠️</span>
						<span>
							Background image will be upscaled ({info?.originalWidth}×{info?.originalHeight}), which may appear blurry.
						</span>
					</div>
				{/if}
			{/if}
		{/if}

		<!-- Solid color background -->
		{#if backgroundType === "color"}
			<div class="color-picker-section">
				<div class="color-preview-large" style="background: {bgColor};"></div>
				<div class="color-controls">
					<label class="color-input-row">
						<span>Color</span>
						<input
							type="color"
							bind:value={bgColor}
							onchange={clearPreviews}
						/>
						<input
							type="text"
							bind:value={bgColor}
							onchange={clearPreviews}
							class="color-hex-input"
							pattern="^#[0-9A-Fa-f]{6}$"
						/>
					</label>
				</div>
				<div class="color-presets">
					{#each ["#1a1a2e", "#16213e", "#0f3460", "#533483", "#e94560", "#f5f5f5", "#2d3436", "#000000"] as preset}
						<button
							type="button"
							class="color-preset"
							style="background: {preset};"
							onclick={() => {
								bgColor = preset;
								clearPreviews();
							}}
							title={preset}
						></button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Gradient background -->
		{#if backgroundType === "gradient"}
			<div class="gradient-picker-section">
				<div
					class="color-preview-large"
					style="background: {gradientType === "linear"
						? `linear-gradient(${gradientAngle}deg, ${gradientColor1}, ${gradientColor2})`
						: `radial-gradient(circle, ${gradientColor1}, ${gradientColor2})`};"
				></div>

				<div class="gradient-type-selector">
					<button
						type="button"
						class="btn mode-btn"
						class:active={gradientType === "linear"}
						onclick={() => {
							gradientType = "linear";
							clearPreviews();
						}}
					>
						Linear
					</button>
					<button
						type="button"
						class="btn mode-btn"
						class:active={gradientType === "radial"}
						onclick={() => {
							gradientType = "radial";
							clearPreviews();
						}}
					>
						Radial
					</button>
				</div>

				<div class="gradient-controls">
					<label class="color-input-row">
						<span>Color 1</span>
						<input
							type="color"
							bind:value={gradientColor1}
							onchange={clearPreviews}
						/>
						<input
							type="text"
							bind:value={gradientColor1}
							onchange={clearPreviews}
							class="color-hex-input"
						/>
					</label>
					<label class="color-input-row">
						<span>Color 2</span>
						<input
							type="color"
							bind:value={gradientColor2}
							onchange={clearPreviews}
						/>
						<input
							type="text"
							bind:value={gradientColor2}
							onchange={clearPreviews}
							class="color-hex-input"
						/>
					</label>

					{#if gradientType === "linear"}
						<div class="style-row">
							<label for="gradient-angle" class="style-label">Angle</label>
							<div class="slider-group">
								<input
									id="gradient-angle"
									type="range"
									min="0"
									max="360"
									bind:value={gradientAngle}
									onchange={clearPreviews}
								/>
								<span class="slider-value">{gradientAngle}°</span>
							</div>
						</div>
					{/if}

					<div class="gradient-mode-selector">
						<span class="mode-label">Span:</span>
						<div class="mode-buttons">
							<button
								type="button"
								class="btn mode-btn"
								class:active={gradientMode === "single"}
								onclick={() => {
									gradientMode = "single";
									clearPreviews();
								}}
								title="Same gradient on each slide"
							>
								Per Slide
							</button>
							<button
								type="button"
								class="btn mode-btn"
								class:active={gradientMode === "cover-all"}
								onclick={() => {
									gradientMode = "cover-all";
									clearPreviews();
								}}
								title="Gradient spans all slides"
							>
								Cover All
							</button>
						</div>
					</div>
				</div>

				<div class="gradient-presets">
					{#each [
						{ c1: "#667eea", c2: "#764ba2", name: "Purple Dream" },
						{ c1: "#f093fb", c2: "#f5576c", name: "Pink Sunset" },
						{ c1: "#4facfe", c2: "#00f2fe", name: "Ocean Blue" },
						{ c1: "#43e97b", c2: "#38f9d7", name: "Fresh Mint" },
						{ c1: "#fa709a", c2: "#fee140", name: "Warm Glow" },
						{ c1: "#a8edea", c2: "#fed6e3", name: "Soft Pastel" },
						{ c1: "#ff9a9e", c2: "#fecfef", name: "Rose" },
						{ c1: "#2c3e50", c2: "#4ca1af", name: "Dark Ocean" },
					] as preset}
						<button
							type="button"
							class="gradient-preset"
							style="background: linear-gradient(135deg, {preset.c1}, {preset.c2});"
							onclick={() => {
								gradientColor1 = preset.c1;
								gradientColor2 = preset.c2;
								clearPreviews();
							}}
							title={preset.name}
						></button>
					{/each}
				</div>
			</div>
		{/if}
	</section>

	<!-- Batch Images -->
	<section class="card-section">
		<div class="section-header">
			<h2>Carousel Images</h2>
			{#if imageFiles.length > 0}
				<button type="button" class="btn btn-small" onclick={clearAllImages}>Clear All</button>
			{/if}
		</div>
		<div
			class="drop-zone images-drop"
			ondrop={handleImagesDrop}
			ondragover={handleDragOver}
			role="button"
			tabindex="0"
		>
			<div class="drop-content">
				<span class="upload-icon">📷</span>
				<p>Drag & drop images here</p>
				<p class="text-muted">or</p>
				<label class="btn btn-primary">
					Browse Files
					<input type="file" accept="image/*" multiple onchange={handleImagesSelect} hidden />
				</label>
			</div>
		</div>

		{#if imagePreviews.length > 0}
			<p class="text-muted reorder-hint">💡 Drag images to reorder</p>
			<div class="image-grid">
				{#each imagePreviews as preview, index}
					<div
						class="image-item"
						class:dragging={dragIndex === index}
						class:drag-over={dragOverIndex === index}
						class:upscaled={upscaledImages.some(u => u.index === index)}
						draggable="true"
						ondragstart={() => handleReorderDragStart(index)}
						ondragover={e => handleReorderDragOver(e, index)}
						ondrop={() => handleReorderDrop(index)}
						ondragend={handleReorderDragEnd}
						role="listitem"
					>
						<img src={preview} alt="Preview {index + 1}" />
						<span class="image-number">{index + 1}</span>
						{#if upscaledImages.some(u => u.index === index)}
							{@const info = upscaledImages.find(u => u.index === index)}
							<span class="upscale-badge" title="Image will be upscaled ({info?.originalWidth}×{info?.originalHeight})">⚠️</span>
						{/if}
						<button type="button" class="remove-btn" onclick={() => removeImage(index)}>✕</button>
					</div>
				{/each}
			</div>

			{#if upscaledImages.length > 0}
				<div class="upscale-warning">
					<span class="warning-icon">⚠️</span>
					<span>
						{upscaledImages.length === 1 ? "1 image" : `${upscaledImages.length} images`} will be upscaled beyond
						{upscaledImages.length === 1 ? "its" : "their"} original resolution, which may appear blurry.
					</span>
				</div>
			{/if}
		{/if}
	</section>

	<!-- Layout Mode -->
	<section class="card-section">
		<h2>Layout Mode</h2>
		<div class="layout-mode-selector">
			<button
				type="button"
				class="btn layout-btn"
				class:active={layoutMode === "centered"}
				onclick={() => {
					layoutMode = "centered";
					clearPreviews();
				}}
			>
				<span class="layout-icon">⊕</span>
				<span class="layout-name">Centered</span>
				<span class="layout-desc">Image centered on each slide</span>
			</button>
			<button
				type="button"
				class="btn layout-btn"
				class:active={layoutMode === "scattered"}
				onclick={() => {
					layoutMode = "scattered";
					clearPreviews();
				}}
			>
				<span class="layout-icon">✦</span>
				<span class="layout-name">Scattered</span>
				<span class="layout-desc">Random positions</span>
			</button>
		</div>

		{#if layoutMode === "scattered"}
			<div class="scatter-options">
				<div class="style-row">
					<label for="scatter-spread" class="style-label">Spread</label>
					<div class="slider-group">
						<input
							id="scatter-spread"
							type="range"
							min="0"
							max="100"
							bind:value={scatterSpread}
							onchange={clearPreviews}
						/>
						<span class="slider-value">{scatterSpread}%</span>
					</div>
				</div>
				<div class="style-row">
					<label for="scatter-seed" class="style-label">Variation</label>
					<div class="slider-group">
						<input
							id="scatter-seed"
							type="range"
							min="1"
							max="100"
							bind:value={scatterSeed}
							onchange={clearPreviews}
						/>
						<button
							type="button"
							class="btn btn-small"
							onclick={() => {
								scatterSeed = Math.floor(Math.random() * 100) + 1;
								clearPreviews();
							}}
						>
							🎲 Randomize
						</button>
					</div>
				</div>
			</div>
		{/if}
	</section>

	<!-- Image Styling -->
	<section class="card-section">
		<h2>Image Style</h2>
		<div class="style-controls">
			<div class="style-row">
				<label class="style-label">
					<input
						type="checkbox"
						bind:checked={roundedCorners}
						onchange={clearPreviews}
					/>
					Rounded Corners
				</label>
			</div>

			{#if roundedCorners}
				<div class="radius-options">
					{#each cornerRadiusPresets as preset}
						<button
							type="button"
							class="btn radius-btn"
							class:active={cornerRadius === preset}
							onclick={() => {
								cornerRadius = preset;
								clearPreviews();
							}}>
							{preset}px
						</button>
					{/each}
				</div>
			{/if}

			<div class="style-row">
				<label class="style-label">
					<input
						type="checkbox"
						bind:checked={dropShadow}
						onchange={clearPreviews}
					/>
					Drop Shadow
				</label>
			</div>

			{#if dropShadow}
				<div class="shadow-options">
					<div class="style-row">
						<label for="shadow-blur" class="style-label">Blur</label>
						<div class="slider-group">
							<input
								id="shadow-blur"
								type="range"
								min="5"
								max="80"
								bind:value={shadowBlur}
								onchange={clearPreviews}
							/>
							<span class="slider-value">{shadowBlur}px</span>
						</div>
					</div>
					<div class="style-row">
						<label for="shadow-offset" class="style-label">Offset</label>
						<div class="slider-group">
							<input
								id="shadow-offset"
								type="range"
								min="0"
								max="50"
								bind:value={shadowOffsetY}
								onchange={clearPreviews}
							/>
							<span class="slider-value">{shadowOffsetY}px</span>
						</div>
					</div>
				</div>
			{/if}
		</div>
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
				Generating {processedCount}/{imageFiles.length}...
			{:else}
				👁️ Generate Preview
			{/if}
		</button>
		{#if !canProcess && !processing}
			<p class="text-muted hint">Add a background and at least one image to continue</p>
		{/if}
	</section>

	<!-- Preview Section -->
	{#if previewsGenerated && processedPreviews.length > 0}
		<section class="card-section">
			<div class="section-header">
				<h2>Preview ({processedPreviews.length} images)</h2>
				<span class="preview-resolution">{width} × {height}px</span>
			</div>
			<div class="preview-grid">
				{#each processedPreviews as preview, index}
					<div class="preview-item">
						<div class="preview-image-wrapper" style="aspect-ratio: {width} / {height};">
							<img src={preview} alt="Final image {index + 1}" loading="lazy" />
						</div>
						<span class="image-number">{index + 1}</span>
					</div>
				{/each}
			</div>

			<div class="export-options">
				<div class="format-selector">
					<span class="mode-label">Format:</span>
					<div class="mode-buttons">
						<button
							type="button"
							class="btn mode-btn"
							class:active={exportFormat === "png"}
							onclick={() => {
								exportFormat = "png";
							}}
						>
							PNG
						</button>
						<button
							type="button"
							class="btn mode-btn"
							class:active={exportFormat === "jpg"}
							onclick={() => {
								exportFormat = "jpg";
							}}
						>
							JPG
						</button>
					</div>
				</div>

				{#if exportFormat === "jpg"}
					<div class="quality-slider">
						<label for="jpg-quality" class="style-label">Quality</label>
						<div class="slider-group">
							<input
								id="jpg-quality"
								type="range"
								min="50"
								max="100"
								bind:value={jpgQuality}
							/>
							<span class="slider-value">{jpgQuality}%</span>
						</div>
					</div>
				{/if}
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
	/* Resolution controls */
	.resolution-controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.preset-btn {
		background: white;
		border: 1px solid #e2e8f0;
		color: #4a5568;
	}

	.preset-btn:hover {
		border-color: #007acc;
		color: #007acc;
	}

	.preset-btn.active {
		background: #007acc;
		border-color: #007acc;
		color: white;
	}

	.custom-size {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.size-input {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		width: 120px;
	}

	.size-separator {
		padding-bottom: 0.6rem;
		color: #718096;
		font-size: 1.25rem;
	}

	/* Background preview */
	.background-preview {
		position: relative;
		display: inline-block;
	}

	.background-preview img {
		max-width: 100%;
		max-height: 200px;
		border-radius: 8px;
	}

	.preview-overlay {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
	}

	/* Background type selector */
	.bg-type-selector {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.bg-type-btn {
		flex: 1;
		padding: 0.75rem 1rem;
		background: white;
		border: 1px solid #e2e8f0;
		color: #4a5568;
		font-size: 0.9rem;
	}

	.bg-type-btn:hover {
		border-color: #007acc;
		color: #007acc;
	}

	.bg-type-btn.active {
		background: #007acc;
		border-color: #007acc;
		color: white;
	}

	/* Color picker section */
	.color-picker-section,
	.gradient-picker-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.color-preview-large {
		width: 100%;
		height: 120px;
		border-radius: 8px;
		border: 1px solid #e2e8f0;
	}

	.color-controls,
	.gradient-controls {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.color-input-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.color-input-row span {
		min-width: 60px;
		font-weight: 500;
		color: #4a5568;
	}

	.color-input-row input[type="color"] {
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		padding: 0;
		background: none;
	}

	.color-input-row input[type="color"]::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.color-input-row input[type="color"]::-webkit-color-swatch {
		border: 1px solid #e2e8f0;
		border-radius: 6px;
	}

	.color-hex-input {
		width: 90px;
		padding: 0.5rem;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		font-family: monospace;
		font-size: 0.9rem;
	}

	.color-presets,
	.gradient-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.color-preset,
	.gradient-preset {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		border: 2px solid transparent;
		cursor: pointer;
		transition: transform 0.15s, border-color 0.15s;
	}

	.color-preset:hover,
	.gradient-preset:hover {
		transform: scale(1.1);
		border-color: #007acc;
	}

	.gradient-type-selector {
		display: flex;
		gap: 0.5rem;
	}

	.gradient-type-selector .mode-btn {
		flex: 1;
	}

	.gradient-mode-selector {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid #e2e8f0;
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

	.btn-small {
		padding: 0.4rem 0.75rem;
		font-size: 0.85rem;
		background: #e2e8f0;
		color: #4a5568;
	}

	.btn-small:hover {
		background: #cbd5e0;
	}

	/* Images drop zone */
	.images-drop {
		margin-bottom: 1rem;
	}

	.reorder-hint {
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
	}

	/* Image grid */
	.image-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 0.75rem;
	}

	.image-item {
		position: relative;
		aspect-ratio: 1;
		border-radius: 8px;
		overflow: hidden;
		background: #f7fafc;
		cursor: grab;
		transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
		border: 2px solid transparent;
	}

	.image-item:active {
		cursor: grabbing;
	}

	.image-item.dragging {
		opacity: 0.5;
		transform: scale(0.95);
	}

	.image-item.drag-over {
		border-color: #007acc;
		transform: scale(1.02);
		box-shadow: 0 4px 12px rgba(0, 122, 204, 0.3);
	}

	.image-item.upscaled {
		border-color: #ed8936;
	}

	.image-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.image-number {
		position: absolute;
		bottom: 0.25rem;
		left: 0.25rem;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		font-size: 0.75rem;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
	}

	.upscale-badge {
		position: absolute;
		top: 0.25rem;
		left: 0.25rem;
		font-size: 0.9rem;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
	}

	.upscale-warning {
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

	.image-item:hover .remove-btn,
	.background-preview:hover .remove-btn,
	.preview-overlay .remove-btn {
		opacity: 1;
	}

	.remove-btn:hover {
		background: #c53030;
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

	/* Background mode selector */
	.bg-mode-selector {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid #e2e8f0;
	}

	.mode-label {
		font-weight: 500;
		color: #4a5568;
		white-space: nowrap;
	}

	.mode-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.mode-btn {
		background: white;
		border: 1px solid #e2e8f0;
		color: #4a5568;
		padding: 0.4rem 0.75rem;
		font-size: 0.9rem;
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

	/* Preview grid */
	.preview-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1rem;
	}

	.preview-item {
		position: relative;
		border-radius: 8px;
		overflow: hidden;
		background: #f7fafc;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.preview-image-wrapper {
		position: relative;
		width: 100%;
		background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
		background-size: 200% 100%;
		animation: loading 1.5s ease-in-out infinite;
	}

	@keyframes loading {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	.preview-image-wrapper img {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.preview-item img {
		width: 100%;
		height: auto;
		display: block;
	}

	.preview-item .image-number {
		bottom: 0.5rem;
		left: 0.5rem;
		font-size: 0.85rem;
		padding: 0.25rem 0.5rem;
	}

	.preview-resolution {
		font-size: 0.9rem;
		color: #718096;
	}

	.mt-2 {
		margin-top: 1.5rem;
	}

	/* Style controls */
	.style-controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.style-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.style-label {
		min-width: 140px;
		font-weight: 500;
		color: #4a5568;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.style-label input[type="checkbox"] {
		width: 18px;
		height: 18px;
		accent-color: #007acc;
	}

	.slider-group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
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
		min-width: 50px;
		text-align: right;
		font-size: 0.9rem;
		color: #718096;
		font-variant-numeric: tabular-nums;
	}

	.shadow-options {
		margin-left: 1.5rem;
		padding-left: 1rem;
		border-left: 2px solid #e2e8f0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.radius-options {
		display: flex;
		gap: 0.5rem;
		margin-left: 1.5rem;
		padding-left: 1rem;
		border-left: 2px solid #e2e8f0;
	}

	.radius-btn {
		background: white;
		border: 1px solid #e2e8f0;
		color: #4a5568;
		padding: 0.4rem 0.75rem;
		font-size: 0.9rem;
	}

	.radius-btn:hover {
		border-color: #007acc;
		color: #007acc;
	}

	.radius-btn.active {
		background: #007acc;
		border-color: #007acc;
		color: white;
	}

	/* Layout mode selector */
	.layout-mode-selector {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	.layout-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 1rem;
		background: white;
		border: 2px solid #e2e8f0;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.layout-btn:hover {
		border-color: #007acc;
	}

	.layout-btn.active {
		border-color: #007acc;
		background: #f0f7ff;
	}

	.layout-icon {
		font-size: 1.75rem;
	}

	.layout-name {
		font-weight: 600;
		color: #2d3748;
	}

	.layout-desc {
		font-size: 0.8rem;
		color: #718096;
	}

	.scatter-options {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid #e2e8f0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* Export options */
	.export-options {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid #e2e8f0;
	}

	.format-selector {
		display: flex;
		align-items: center;
		gap: 1rem;
		justify-content: center;
	}

	.quality-slider {
		display: flex;
		align-items: center;
		gap: 1rem;
		max-width: 400px;
		margin: 0 auto;
	}

	.quality-slider .style-label {
		min-width: auto;
	}

	/* Responsive */
	@media (max-width: 600px) {
		.custom-size {
			flex-wrap: wrap;
		}

		.size-input {
			width: 100px;
		}

		.image-grid {
			grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
		}

		.preview-grid {
			grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		}

		.bg-mode-selector {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.style-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.style-label {
			min-width: auto;
		}

		.slider-group {
			width: 100%;
		}

		.shadow-options {
			margin-left: 0;
			padding-left: 0;
			border-left: none;
			padding-top: 0.5rem;
			border-top: 1px solid #e2e8f0;
		}
	}
</style>
