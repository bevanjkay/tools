<script lang="ts">
	import { resolve as resolvePath } from "$app/paths";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Select } from "$lib/components/ui/select";
	import { Slider } from "$lib/components/ui/slider";
	import { cn } from "$lib/utils";
	import { LoaderCircle, Package, Shrink, Upload } from "@lucide/svelte";
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
	const FILE_EXTENSION_RE = /\.[^.]+$/;

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
		return fileName.replace(FILE_EXTENSION_RE, "");
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
		const files = input.files ? [...input.files] : [];
		await filesToSourceImages(files);
		input.value = "";
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		const files = event.dataTransfer?.files ? [...event.dataTransfer.files] : [];
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

<main class="mx-auto max-w-4xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<Shrink class="text-primary size-7" />
		Batch Image Compressor
	</h1>
	<p class="text-muted-foreground mb-8">Resize, convert, and compress multiple images in one pass.</p>

	<Card.Root class="mb-6">
		<Card.Header>
			<Card.Title>Upload Images</Card.Title>
		</Card.Header>
		<Card.Content>
			<label
				class="border-input hover:border-ring hover:bg-accent bg-muted/40 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors"
				ondrop={handleDrop}
				ondragover={handleDragOver}
			>
				<Upload class="text-muted-foreground size-9" />
				<p class="font-medium">Drag & drop image files</p>
				<p class="text-muted-foreground text-sm">or click to browse</p>
				{#if sourceImages.length > 0}
					<p class="text-muted-foreground text-sm">{sourceImages.length} image{sourceImages.length === 1 ? "" : "s"} loaded</p>
				{/if}
				<input type="file" accept="image/*" multiple onchange={handleSelect} hidden />
			</label>
			{#if sourceImages.length > 0}
				<div class="mt-3">
					<Button variant="outline" size="sm" onclick={clearAll}>Clear All</Button>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="mb-6">
		<Card.Header>
			<Card.Title>Compression Settings</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="grid gap-1.5">
				<Label>Resize Mode</Label>
				<div class="bg-muted inline-flex flex-wrap gap-1 rounded-lg p-1">
					<Button variant={resizeMode === "fit-box" ? "default" : "ghost"} size="sm" onclick={() => (resizeMode = "fit-box")}>Fit Within Box</Button>
					<Button variant={resizeMode === "target-width" ? "default" : "ghost"} size="sm" onclick={() => (resizeMode = "target-width")}>Target Width</Button>
					<Button variant={resizeMode === "target-height" ? "default" : "ghost"} size="sm" onclick={() => (resizeMode = "target-height")}>Target Height</Button>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<div class="grid gap-1.5">
					<Label for="format">Output Format</Label>
					<Select id="format" bind:value={outputFormat}>
						{#each formatOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</Select>
				</div>
				{#if resizeMode !== "target-height"}
					<div class="grid gap-1.5">
						<Label for="maxWidth">{resizeMode === "target-width" ? "Target Width (px)" : "Max Width (px)"}</Label>
						<Input id="maxWidth" type="number" min={64} max={12000} bind:value={maxWidth} />
					</div>
				{/if}
				{#if resizeMode !== "target-width"}
					<div class="grid gap-1.5">
						<Label for="maxHeight">{resizeMode === "target-height" ? "Target Height (px)" : "Max Height (px)"}</Label>
						<Input id="maxHeight" type="number" min={64} max={12000} bind:value={maxHeight} />
					</div>
				{/if}
				{#if outputFormat !== "png"}
					<div class="grid gap-1.5">
						<Label for="quality">Quality ({quality}%)</Label>
						<div class="flex h-9 items-center"><Slider type="single" min={1} max={100} bind:value={quality} /></div>
					</div>
				{/if}
			</div>
			<p class="text-muted-foreground text-sm">
				{#if resizeMode === "fit-box"}
					Images are resized to fit inside max width/height while preserving aspect ratio.
				{:else if resizeMode === "target-width"}
					Width is fixed and height is auto-scaled to preserve aspect ratio.
				{:else}
					Height is fixed and width is auto-scaled to preserve aspect ratio.
				{/if}
			</p>
			<Label class="font-normal"><Checkbox bind:checked={preventUpscale} /> Prevent upscaling small images</Label>
			<p class="text-muted-foreground text-sm">Metadata is stripped during export when images are re-encoded.</p>
		</Card.Content>
	</Card.Root>

	{#if error}
		<div class="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border px-4 py-3 text-sm">⚠️ {error}</div>
	{/if}

	<div class="mb-6 text-center">
		<Button size="lg" onclick={processImages} disabled={!canProcess}>
			{#if processing}
				<LoaderCircle class="size-4 animate-spin" />
				Processing {processedCount}/{sourceImages.length}...
			{:else}
				Compress Images
			{/if}
		</Button>
	</div>

	{#if sourceImages.length > 0 || hasResults || processing}
		<Card.Root class="mb-6" aria-live="polite">
			<Card.Header class="flex-row items-center justify-between space-y-0">
				<Card.Title>Compression Status</Card.Title>
				<span class={cn(
					"rounded-full px-2.5 py-0.5 text-xs font-medium",
					processing ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : hasResults ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
				)}>
					{#if processing}Processing{:else if hasResults}Ready{:else}Waiting{/if}
				</span>
			</Card.Header>
			<Card.Content>
				{#if processing}
					<p class="mb-2 text-sm">Processing {processedCount} of {sourceImages.length} images...</p>
				{:else if hasResults}
					<p class="mb-2 text-sm">Complete: {processedImages.length} files are ready for download.</p>
				{:else}
					<p class="text-muted-foreground mb-2 text-sm">Adjust settings and run compression.</p>
				{/if}
				<div class="bg-muted h-2 w-full overflow-hidden rounded-full">
					<div class="bg-primary h-full transition-all" style="width: {processing ? progressPercent : hasResults ? 100 : 0}%;"></div>
				</div>
				<div class="text-muted-foreground mt-1.5 flex justify-between text-xs">
					<span>{processing ? `${progressPercent}%` : hasResults ? "100%" : "0%"}</span>
					{#if hasResults}
						<span>{formatBytes(originalTotalBytes)} → {formatBytes(processedTotalBytes)}</span>
					{/if}
				</div>
				{#if hasResults}
					<div class="mt-4 flex flex-wrap items-center gap-2">
						<Button onclick={downloadZip} disabled={processing}>
							<Package class="size-4" />
							Download ZIP
						</Button>
						<Button variant="link" onclick={() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" })}>View Previews ↓</Button>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	{#if sourceImages.length > 0 && !processing && !hasResults}
		<Card.Root class="mb-6">
			<Card.Header>
				<Card.Title>Source Files</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-2 gap-3">
					<div class="bg-muted flex flex-col gap-1 rounded-lg border p-3">
						<span class="text-muted-foreground text-xs">Total Source Size</span>
						<strong>{formatBytes(originalTotalBytes)}</strong>
					</div>
					<div class="bg-muted flex flex-col gap-1 rounded-lg border p-3">
						<span class="text-muted-foreground text-xs">Target Limit</span>
						<strong>{maxWidth} × {maxHeight}px</strong>
					</div>
				</div>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
					{#each sourceImages as item, index (item.previewUrl)}
						<div class="overflow-hidden rounded-md border">
							<img src={item.previewUrl} alt="Source image {index + 1}" loading="lazy" class="aspect-square w-full object-cover" />
							<div class="text-muted-foreground flex flex-col gap-0.5 p-2 text-xs">
								<span>{item.width} × {item.height}px</span>
								<span>{formatBytes(item.file.size)}</span>
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if hasResults}
		<Card.Root class="mb-6" id="results">
			<Card.Header>
				<Card.Title>Results</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-3 gap-3">
					<div class="bg-muted flex flex-col gap-1 rounded-lg border p-3">
						<span class="text-muted-foreground text-xs">Compressed Size</span>
						<strong>{formatBytes(processedTotalBytes)}</strong>
					</div>
					<div class="bg-muted flex flex-col gap-1 rounded-lg border p-3">
						<span class="text-muted-foreground text-xs">Change</span>
						<strong class={sizeDeltaPercent > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
							{sizeDeltaPercent > 0 ? "+" : ""}{sizeDeltaPercent.toFixed(1)}%
						</strong>
					</div>
					<div class="bg-muted flex flex-col gap-1 rounded-lg border p-3">
						<span class="text-muted-foreground text-xs">Output Files</span>
						<strong>{processedImages.length} {activeFormat.label}</strong>
					</div>
				</div>

				<div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
					{#each processedImages as item, index (item.previewUrl)}
						<div class="overflow-hidden rounded-md border">
							<img src={item.previewUrl} alt="Compressed image {index + 1}" loading="lazy" class="aspect-square w-full object-cover" />
							<div class="text-muted-foreground flex flex-col gap-0.5 p-2 text-xs">
								<span>{item.width} × {item.height}px</span>
								<span>{formatBytes(item.blob.size)}</span>
							</div>
						</div>
					{/each}
				</div>

				<div class="text-center">
					<Button size="lg" onclick={downloadZip} disabled={processing}>
						<Package class="size-4" />
						Download ZIP
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<footer class="text-muted-foreground text-center text-sm">
		<p>✨ Runs in your browser • No uploads required</p>
	</footer>
</main>
