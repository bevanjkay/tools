<script lang="ts">
	import { resolve as resolvePath } from "$app/paths";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Slider } from "$lib/components/ui/slider";
	import { cn } from "$lib/utils";
	import { Blend, Eye, Image as ImageIcon, Images, LoaderCircle, Package, Palette, Shuffle, Upload, X } from "@lucide/svelte";
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
			if (backgroundPreview)
				URL.revokeObjectURL(backgroundPreview);
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
			if (backgroundPreview)
				URL.revokeObjectURL(backgroundPreview);
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
			const newFiles = [...files].filter(f => f.type.startsWith("image/"));
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
			const newFiles = [...files].filter(f => f.type.startsWith("image/"));
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

<main class="mx-auto max-w-4xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight"><Images class="text-primary size-7" /> Instagram Carousel Creator</h1>
	<p class="text-muted-foreground mb-8">Create carousel images with a consistent background</p>

	<Card.Root class="mb-6">
		<Card.Header><Card.Title>Output Resolution</Card.Title></Card.Header>
		<Card.Content class="space-y-4">
			<div class="flex flex-wrap gap-2">
				{#each presets as preset (preset.name)}
					<Button variant={width === preset.width && height === preset.height ? "default" : "outline"} size="sm" onclick={() => applyPreset(preset)}>{preset.name}</Button>
				{/each}
			</div>
			<div class="flex items-end gap-3">
				<div class="grid gap-1.5"><Label for="width">Width</Label><Input id="width" type="number" bind:value={width} min={100} max={4096} onchange={clearPreviews} /></div>
				<span class="text-muted-foreground pb-2">×</span>
				<div class="grid gap-1.5"><Label for="height">Height</Label><Input id="height" type="number" bind:value={height} min={100} max={4096} onchange={clearPreviews} /></div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="mb-6">
		<Card.Header><Card.Title>Background</Card.Title></Card.Header>
		<Card.Content class="space-y-4">
			<div class="flex flex-wrap gap-2">
				<Button variant={backgroundType === "image" ? "default" : "outline"} size="sm" onclick={() => {
					backgroundType = "image";
					clearPreviews();
				}}><ImageIcon class="size-4" /> Image</Button>
				<Button variant={backgroundType === "color" ? "default" : "outline"} size="sm" onclick={() => {
					backgroundType = "color";
					clearPreviews();
				}}><Palette class="size-4" /> Solid Color</Button>
				<Button variant={backgroundType === "gradient" ? "default" : "outline"} size="sm" onclick={() => {
					backgroundType = "gradient";
					clearPreviews();
				}}><Blend class="size-4" /> Gradient</Button>
			</div>

			{#if backgroundType === "image"}
				{#if backgroundPreview}
					<div class="relative overflow-hidden rounded-lg border">
						<img src={backgroundPreview} alt="Background preview" class="max-h-64 w-full object-contain" />
						<Button variant="destructive" size="icon" class="absolute top-2 right-2 size-8" onclick={clearBackground}><X class="size-4" /></Button>
					</div>
				{:else}
					<label
						class="border-input hover:border-ring hover:bg-accent bg-muted/40 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors"
						ondrop={handleBackgroundDrop}
						ondragover={handleDragOver}
					>
						<Upload class="text-muted-foreground size-9" />
						<p class="font-medium">Drag & drop a background image</p>
						<p class="text-muted-foreground text-sm">or click to browse</p>
						<input type="file" accept="image/*" onchange={handleBackgroundSelect} hidden />
					</label>
				{/if}

				{#if backgroundFile}
					<div class="grid gap-1.5">
						<Label>Background Position</Label>
						<div class="flex flex-wrap gap-2">
							{#each bgModes as mode (mode.value)}
								<Button variant={backgroundMode === mode.value ? "default" : "outline"} size="sm" onclick={() => {
									backgroundMode = mode.value;
									clearPreviews();
								}} title={mode.desc}>{mode.label}</Button>
							{/each}
						</div>
					</div>

					{#if backgroundUpscaled()}
						{@const info = backgroundUpscaled()}
						<div class="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
							<span>⚠️</span>
							<span>Background image will be upscaled ({info?.originalWidth}×{info?.originalHeight}), which may appear blurry.</span>
						</div>
					{/if}
				{/if}
			{/if}

			{#if backgroundType === "color"}
				<div class="flex flex-wrap items-center gap-4">
					<div class="size-16 shrink-0 rounded-lg border" style="background: {bgColor};"></div>
					<div class="flex items-center gap-2">
						<input type="color" bind:value={bgColor} onchange={clearPreviews} class="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1" />
						<Input type="text" bind:value={bgColor} onchange={clearPreviews} class="w-28 font-mono" pattern="^#[0-9A-Fa-f]{6}$" />
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each ["#1a1a2e", "#16213e", "#0f3460", "#533483", "#e94560", "#f5f5f5", "#2d3436", "#000000"] as preset (preset)}
						<button type="button" class="border-border size-8 rounded-md border" style="background: {preset};" onclick={() => {
							bgColor = preset;
							clearPreviews();
						}} title={preset} aria-label={preset}></button>
					{/each}
				</div>
			{/if}

			{#if backgroundType === "gradient"}
				<div
					class="h-24 w-full rounded-lg border"
					style="background: {gradientType === "linear"
						? `linear-gradient(${gradientAngle}deg, ${gradientColor1}, ${gradientColor2})`
						: `radial-gradient(circle, ${gradientColor1}, ${gradientColor2})`};"
				></div>

				<div class="flex flex-wrap gap-2">
					<Button variant={gradientType === "linear" ? "default" : "outline"} size="sm" onclick={() => {
						gradientType = "linear";
						clearPreviews();
					}}>Linear</Button>
					<Button variant={gradientType === "radial" ? "default" : "outline"} size="sm" onclick={() => {
						gradientType = "radial";
						clearPreviews();
					}}>Radial</Button>
				</div>

				<div class="flex flex-wrap items-center gap-4">
					<div class="flex items-center gap-2">
						<input type="color" bind:value={gradientColor1} onchange={clearPreviews} class="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1" />
						<Input type="text" bind:value={gradientColor1} onchange={clearPreviews} class="w-28 font-mono" />
					</div>
					<div class="flex items-center gap-2">
						<input type="color" bind:value={gradientColor2} onchange={clearPreviews} class="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1" />
						<Input type="text" bind:value={gradientColor2} onchange={clearPreviews} class="w-28 font-mono" />
					</div>
				</div>

				{#if gradientType === "linear"}
					<div class="grid gap-1.5">
						<Label for="gradient-angle">Angle ({gradientAngle}°)</Label>
						<div class="flex h-9 items-center"><Slider type="single" min={0} max={360} bind:value={gradientAngle} onValueChange={clearPreviews} /></div>
					</div>
				{/if}

				<div class="grid gap-1.5">
					<Label>Span</Label>
					<div class="flex flex-wrap gap-2">
						<Button variant={gradientMode === "single" ? "default" : "outline"} size="sm" onclick={() => {
							gradientMode = "single";
							clearPreviews();
						}} title="Same gradient on each slide">Per Slide</Button>
						<Button variant={gradientMode === "cover-all" ? "default" : "outline"} size="sm" onclick={() => {
							gradientMode = "cover-all";
							clearPreviews();
						}} title="Gradient spans all slides">Cover All</Button>
					</div>
				</div>

				<div class="flex flex-wrap gap-2">
					{#each [
						{ c1: "#667eea", c2: "#764ba2", name: "Purple Dream" },
						{ c1: "#f093fb", c2: "#f5576c", name: "Pink Sunset" },
						{ c1: "#4facfe", c2: "#00f2fe", name: "Ocean Blue" },
						{ c1: "#43e97b", c2: "#38f9d7", name: "Fresh Mint" },
						{ c1: "#fa709a", c2: "#fee140", name: "Warm Glow" },
						{ c1: "#a8edea", c2: "#fed6e3", name: "Soft Pastel" },
						{ c1: "#ff9a9e", c2: "#fecfef", name: "Rose" },
						{ c1: "#2c3e50", c2: "#4ca1af", name: "Dark Ocean" },
					] as preset (preset.name)}
						<button type="button" class="border-border size-9 rounded-md border" style="background: linear-gradient(135deg, {preset.c1}, {preset.c2});" onclick={() => {
							gradientColor1 = preset.c1;
							gradientColor2 = preset.c2;
							clearPreviews();
						}} title={preset.name} aria-label={preset.name}></button>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="mb-6">
		<Card.Header class="flex-row items-center justify-between space-y-0">
			<Card.Title>Carousel Images</Card.Title>
			{#if imageFiles.length > 0}
				<Button variant="outline" size="sm" onclick={clearAllImages}>Clear All</Button>
			{/if}
		</Card.Header>
		<Card.Content class="space-y-4">
			<label
				class="border-input hover:border-ring hover:bg-accent bg-muted/40 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors"
				ondrop={handleImagesDrop}
				ondragover={handleDragOver}
			>
				<Upload class="text-muted-foreground size-9" />
				<p class="font-medium">Drag & drop images here</p>
				<p class="text-muted-foreground text-sm">or click to browse</p>
				<input type="file" accept="image/*" multiple onchange={handleImagesSelect} hidden />
			</label>

			{#if imagePreviews.length > 0}
				<p class="text-muted-foreground text-sm">💡 Drag images to reorder</p>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
					{#each imagePreviews as preview, index (preview)}
						<div
							class={cn(
								"group relative overflow-hidden rounded-md border",
								dragIndex === index && "opacity-50",
								dragOverIndex === index && "ring-primary ring-2",
								upscaledImages.some(u => u.index === index) && "border-amber-500/60",
							)}
							draggable="true"
							ondragstart={() => handleReorderDragStart(index)}
							ondragover={e => handleReorderDragOver(e, index)}
							ondrop={() => handleReorderDrop(index)}
							ondragend={handleReorderDragEnd}
							role="listitem"
						>
							<img src={preview} alt="Preview {index + 1}" class="aspect-square w-full cursor-grab object-cover" />
							<span class="bg-background/80 absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-xs font-medium">{index + 1}</span>
							{#if upscaledImages.some(u => u.index === index)}
								{@const info = upscaledImages.find(u => u.index === index)}
								<span class="absolute bottom-1 right-1 text-xs" title="Image will be upscaled ({info?.originalWidth}×{info?.originalHeight})">⚠️</span>
							{/if}
							<button type="button" class="bg-background/80 hover:bg-destructive hover:text-destructive-foreground absolute top-1 right-1 flex size-6 items-center justify-center rounded-full text-xs opacity-0 transition group-hover:opacity-100" onclick={() => removeImage(index)} aria-label="Remove image">✕</button>
						</div>
					{/each}
				</div>

				{#if upscaledImages.length > 0}
					<div class="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
						<span>⚠️</span>
						<span>
							{upscaledImages.length === 1 ? "1 image" : `${upscaledImages.length} images`} will be upscaled beyond
							{upscaledImages.length === 1 ? "its" : "their"} original resolution, which may appear blurry.
						</span>
					</div>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="mb-6">
		<Card.Header><Card.Title>Layout Mode</Card.Title></Card.Header>
		<Card.Content class="space-y-4">
			<div class="grid gap-3 sm:grid-cols-2">
				<button
					type="button"
					class={cn("flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors", layoutMode === "centered" ? "border-primary bg-accent" : "border-border hover:bg-accent/50")}
					onclick={() => {
						layoutMode = "centered";
						clearPreviews();
					}}
				>
					<span class="font-semibold">Centered</span>
					<span class="text-muted-foreground text-sm">Image centered on each slide</span>
				</button>
				<button
					type="button"
					class={cn("flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors", layoutMode === "scattered" ? "border-primary bg-accent" : "border-border hover:bg-accent/50")}
					onclick={() => {
						layoutMode = "scattered";
						clearPreviews();
					}}
				>
					<span class="font-semibold">Scattered</span>
					<span class="text-muted-foreground text-sm">Random positions</span>
				</button>
			</div>

			{#if layoutMode === "scattered"}
				<div class="grid gap-1.5">
					<Label for="scatter-spread">Spread ({scatterSpread}%)</Label>
					<div class="flex h-9 items-center"><Slider type="single" min={0} max={100} bind:value={scatterSpread} onValueChange={clearPreviews} /></div>
				</div>
				<div class="grid gap-1.5">
					<Label for="scatter-seed">Variation</Label>
					<div class="flex items-center gap-3">
						<Slider type="single" min={1} max={100} bind:value={scatterSeed} onValueChange={clearPreviews} />
						<Button variant="outline" size="sm" class="shrink-0" onclick={() => {
							scatterSeed = Math.floor(Math.random() * 100) + 1;
							clearPreviews();
						}}><Shuffle class="size-4" /> Randomize</Button>
					</div>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="mb-6">
		<Card.Header><Card.Title>Image Style</Card.Title></Card.Header>
		<Card.Content class="space-y-4">
			<Label class="font-normal"><Checkbox bind:checked={roundedCorners} onCheckedChange={clearPreviews} /> Rounded Corners</Label>

			{#if roundedCorners}
				<div class="flex flex-wrap gap-2">
					{#each cornerRadiusPresets as preset (preset)}
						<Button variant={cornerRadius === preset ? "default" : "outline"} size="sm" onclick={() => {
							cornerRadius = preset;
							clearPreviews();
						}}>{preset}px</Button>
					{/each}
				</div>
			{/if}

			<Label class="font-normal"><Checkbox bind:checked={dropShadow} onCheckedChange={clearPreviews} /> Drop Shadow</Label>

			{#if dropShadow}
				<div class="grid gap-1.5">
					<Label for="shadow-blur">Blur ({shadowBlur}px)</Label>
					<div class="flex h-9 items-center"><Slider type="single" min={5} max={80} bind:value={shadowBlur} onValueChange={clearPreviews} /></div>
				</div>
				<div class="grid gap-1.5">
					<Label for="shadow-offset">Offset ({shadowOffsetY}px)</Label>
					<div class="flex h-9 items-center"><Slider type="single" min={0} max={50} bind:value={shadowOffsetY} onValueChange={clearPreviews} /></div>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<div class="mb-6 text-center">
		<Button size="lg" onclick={generatePreviews} disabled={!canGeneratePreviews || processing}>
			{#if processing && !previewsGenerated}
				<LoaderCircle class="size-4 animate-spin" />
				Generating {processedCount}/{imageFiles.length}...
			{:else}
				<Eye class="size-4" />
				Generate Preview
			{/if}
		</Button>
		{#if !canProcess && !processing}
			<p class="text-muted-foreground mt-2 text-sm">Add a background and at least one image to continue</p>
		{/if}
	</div>

	{#if previewsGenerated && processedPreviews.length > 0}
		<Card.Root class="mb-6">
			<Card.Header class="flex-row items-center justify-between space-y-0">
				<Card.Title>Preview ({processedPreviews.length} images)</Card.Title>
				<span class="text-muted-foreground text-sm">{width} × {height}px</span>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
					{#each processedPreviews as preview, index (preview)}
						<div class="relative overflow-hidden rounded-md border">
							<div class="w-full" style="aspect-ratio: {width} / {height};">
								<img src={preview} alt="Final image {index + 1}" loading="lazy" class="size-full object-cover" />
							</div>
							<span class="bg-background/80 absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-xs font-medium">{index + 1}</span>
						</div>
					{/each}
				</div>

				<div class="flex flex-wrap items-center gap-4">
					<div class="grid gap-1.5">
						<Label>Format</Label>
						<div class="flex gap-2">
							<Button variant={exportFormat === "png" ? "default" : "outline"} size="sm" onclick={() => {
								exportFormat = "png";
							}}>PNG</Button>
							<Button variant={exportFormat === "jpg" ? "default" : "outline"} size="sm" onclick={() => {
								exportFormat = "jpg";
							}}>JPG</Button>
						</div>
					</div>
					{#if exportFormat === "jpg"}
						<div class="grid min-w-[200px] flex-1 gap-1.5">
							<Label for="jpg-quality">Quality ({jpgQuality}%)</Label>
							<div class="flex h-9 items-center"><Slider type="single" min={50} max={100} bind:value={jpgQuality} /></div>
						</div>
					{/if}
				</div>

				<div class="text-center">
					<Button size="lg" onclick={downloadZip} disabled={processing}>
						{#if processing}
							<LoaderCircle class="size-4 animate-spin" />
							Creating ZIP...
						{:else}
							<Package class="size-4" />
							Download ZIP
						{/if}
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<footer class="text-muted-foreground text-center text-sm">
		<p>✨ Images processed in your browser • No upload required</p>
	</footer>
</main>
