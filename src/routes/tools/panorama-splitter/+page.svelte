<script lang="ts">
	import { resolve as resolvePath } from "$app/paths";
	import { Columns3, Eye, LoaderCircle, Package, X } from "@lucide/svelte";
	import FileDropZone from "#lib/components/file-drop-zone.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { Slider } from "#lib/components/ui/slider/index.js";
	import { loadImage } from "#lib/image.js";
	import { panoramaSlices, panoramaUpscale } from "#lib/panorama.js";
	import { downloadZip } from "#lib/zip.js";

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

	const sliceOptions = $derived.by(() => {
		if (!imageDimensions)
			return null;
		return {
			imageWidth: imageDimensions.width,
			imageHeight: imageDimensions.height,
			splitCount,
			outputWidth,
			outputHeight,
			paddingPercent,
			paddingMode,
		};
	});

	// Warn when each strip has to be enlarged to fill its slide.
	const pixelationWarning = $derived.by(() => {
		if (!sliceOptions)
			return null;
		const scale = panoramaUpscale(sliceOptions);
		if (scale <= 1)
			return null;
		const [first] = panoramaSlices(sliceOptions);
		return { scale, sourceWidth: Math.round(first.source.w), sourceHeight: Math.round(first.source.h) };
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

	async function handleImage(files: File[]) {
		const file = files[0];
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
			const slices = panoramaSlices({
				imageWidth: img.width,
				imageHeight: img.height,
				splitCount,
				outputWidth,
				outputHeight,
				paddingPercent,
				paddingMode,
			});

			for (const [i, { source, dest }] of slices.entries()) {
				const canvas = document.createElement("canvas");
				canvas.width = outputWidth;
				canvas.height = outputHeight;
				const ctx = canvas.getContext("2d");
				if (!ctx)
					throw new Error("Unable to create canvas context");

				ctx.fillStyle = paddingColor;
				ctx.fillRect(0, 0, outputWidth, outputHeight);
				ctx.drawImage(img, source.x, source.y, source.w, source.h, dest.x, dest.y, dest.w, dest.h);

				newPreviews.push(canvas.toDataURL("image/png"));
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

	async function downloadAllAsZip() {
		if (processedPreviews.length === 0)
			return;

		processing = true;

		try {
			const entries = [];
			for (const [i, dataUrl] of processedPreviews.entries())
				entries.push({ name: `panorama_${String(i + 1).padStart(2, "0")}.png`, data: await (await fetch(dataUrl)).blob() });
			await downloadZip(entries, "panorama_split.zip");
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

<main class="mx-auto max-w-4xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<Columns3 class="text-primary size-7" />
		Panorama Splitter
	</h1>
	<p class="text-muted-foreground mb-8">Split wide panorama images into Instagram carousel slides</p>

	<Card.Root class="mb-6">
		<Card.Header>
			<Card.Title>Panorama Image</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if imagePreview}
				<div class="relative overflow-hidden rounded-lg border">
					<img src={imagePreview} alt="Panorama preview" class="max-h-64 w-full object-contain" />
					<Button variant="destructive" size="icon" class="absolute top-2 right-2 size-8" onclick={clearImage}><X class="size-4" /></Button>
				</div>
				{#if imageDimensions}
					<p class="text-muted-foreground mt-2 text-center text-sm">{imageDimensions.width} × {imageDimensions.height}px</p>
				{/if}
			{:else}
				<FileDropZone accept="image/*" label="Drag & drop a panorama image" onfiles={handleImage} />
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="mb-6">
		<Card.Header>
			<Card.Title>Split Settings</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-5">
			<div class="grid gap-1.5">
				<Label>Number of Slides</Label>
				<div class="flex flex-wrap gap-2">
					{#each splitCountOptions as count (count)}
						<Button
							variant={splitCount === count ? "default" : "outline"}
							size="icon"
							onclick={() => {
								splitCount = count;
								clearPreviews();
							}}
						>
							{count}
						</Button>
					{/each}
				</div>
			</div>

			<div class="grid gap-1.5">
				<Label>Output Aspect Ratio</Label>
				<div class="flex flex-wrap gap-2">
					{#each aspectRatioOptions as option (option.value)}
						<Button
							variant={outputAspectRatio === option.value ? "default" : "outline"}
							size="sm"
							onclick={() => {
								outputAspectRatio = option.value;
								clearPreviews();
							}}
							title={option.desc}
						>
							{option.label}
						</Button>
					{/each}
				</div>
			</div>

			<div class="grid gap-1.5">
				<Label for="padding">Padding</Label>
				<div class="flex flex-wrap items-center gap-4">
					<div class="flex flex-1 items-center gap-3">
						<Slider type="single" min={0} max={20} bind:value={paddingPercent} onValueChange={clearPreviews} />
						<span class="text-muted-foreground w-10 shrink-0 text-sm">{paddingPercent}%</span>
					</div>
					{#if paddingPercent > 0}
						<div class="flex items-center gap-2">
							<Label for="padding-color">Color</Label>
							<input id="padding-color" type="color" bind:value={paddingColor} onchange={clearPreviews} class="border-input size-9 cursor-pointer rounded-md border bg-transparent p-1" />
						</div>
					{/if}
				</div>
				{#if paddingPercent > 0}
					<div class="mt-2 grid gap-1.5">
						<Label>Apply To</Label>
						<div class="flex flex-wrap gap-2">
							{#each paddingModeOptions as mode (mode.value)}
								<Button
									variant={paddingMode === mode.value ? "default" : "outline"}
									size="sm"
									onclick={() => {
										paddingMode = mode.value;
										clearPreviews();
									}}
									title={mode.desc}
								>
									{mode.label}
								</Button>
							{/each}
						</div>
						<p class="text-muted-foreground text-sm">
							{#if paddingMode === "per-slide"}
								Padding around each individual slide
							{:else}
								Padding only on the outer edges of the carousel
							{/if}
						</p>
					</div>
				{/if}
			</div>

			{#if pixelationWarning}
				<div class="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
					<span>⚠️</span>
					<span>
						Image will be upscaled by {pixelationWarning.scale.toFixed(1)}× which may appear blurry.
						Source segment size: {pixelationWarning.sourceWidth}×{pixelationWarning.sourceHeight}px
					</span>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<div class="mb-6 text-center">
		<Button size="lg" onclick={generatePreviews} disabled={!canGeneratePreviews || processing}>
			{#if processing && !previewsGenerated}
				<LoaderCircle class="size-4 animate-spin" />
				Generating {processedCount}/{splitCount}...
			{:else}
				<Eye class="size-4" />
				Generate Preview
			{/if}
		</Button>
		{#if !canProcess && !processing}
			<p class="text-muted-foreground mt-2 text-sm">Add a panorama image to continue</p>
		{/if}
	</div>

	{#if previewsGenerated && processedPreviews.length > 0}
		<Card.Root class="mb-6">
			<Card.Header class="flex-row items-center justify-between space-y-0">
				<Card.Title>Preview ({processedPreviews.length} slides)</Card.Title>
				<span class="text-muted-foreground text-sm">{outputWidth} × {outputHeight}px each</span>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex snap-x gap-2 overflow-x-auto pb-2">
					{#each processedPreviews as preview, index (preview)}
						<div class="relative shrink-0 snap-center">
							<img src={preview} alt="Slide {index + 1}" class="h-56 rounded-md border object-contain" />
							<span class="bg-background/80 absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-xs font-medium">{index + 1}</span>
						</div>
					{/each}
				</div>

				<p class="text-muted-foreground text-center text-sm">← Scroll to preview the carousel →</p>

				<div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
					{#each processedPreviews as preview, index (preview)}
						<div class="relative overflow-hidden rounded-md border">
							<img src={preview} alt="Final image {index + 1}" class="w-full object-contain" />
							<span class="bg-background/80 absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-xs font-medium">{index + 1}</span>
						</div>
					{/each}
				</div>

				<div class="text-center">
					<Button size="lg" onclick={downloadAllAsZip} disabled={processing}>
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
