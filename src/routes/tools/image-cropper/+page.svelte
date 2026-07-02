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
	import { ChevronLeft, ChevronRight, Crop, LoaderCircle, Package, Pencil, RotateCcw, Upload, X } from "@lucide/svelte";
	import JSZip from "jszip";
	import { onDestroy } from "svelte";

	type OutputFormat = "jpeg" | "png" | "webp";
	type CropRect = { x: number; y: number; w: number; h: number };

	type SourceImage = {
		id: string;
		file: File;
		previewUrl: string;
		naturalWidth: number;
		naturalHeight: number;
		crop: CropRect;
		customized: boolean;
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

	const ratioOptions: Array<{ label: string; value: string; ratio: number | null }> = [
		{ label: "Free", value: "free", ratio: null },
		{ label: "1:1", value: "1:1", ratio: 1 },
		{ label: "4:5", value: "4:5", ratio: 4 / 5 },
		{ label: "5:4", value: "5:4", ratio: 5 / 4 },
		{ label: "3:4", value: "3:4", ratio: 3 / 4 },
		{ label: "4:3", value: "4:3", ratio: 4 / 3 },
		{ label: "2:3", value: "2:3", ratio: 2 / 3 },
		{ label: "3:2", value: "3:2", ratio: 3 / 2 },
		{ label: "9:16", value: "9:16", ratio: 9 / 16 },
		{ label: "16:9", value: "16:9", ratio: 16 / 9 },
		{ label: "Custom", value: "custom", ratio: null },
	];

	const alignSteps = [0, 0.5, 1];
	const FILE_EXTENSION_RE = /\.[^.]+$/;
	const MIN_CROP_PX = 16;

	let sourceImages = $state<SourceImage[]>([]);
	let processedImages = $state<ProcessedImage[]>([]);
	let error = $state("");
	let processing = $state(false);
	let processedCount = $state(0);

	let ratioValue = $state("1:1");
	let customW = $state(1);
	let customH = $state(1);
	let alignX = $state(0.5);
	let alignY = $state(0.5);
	let useExactSize = $state(false);
	let outW = $state(1080);
	let outH = $state(1080);
	let outputFormat = $state<OutputFormat>("jpeg");
	let quality = $state(90);

	let editingId = $state<string | null>(null);
	let editorDispW = $state(0);
	let editorDispH = $state(0);

	const activeFormat = $derived(formatOptions.find(option => option.value === outputFormat) ?? formatOptions[0]);
	const hasResults = $derived(processedImages.length > 0);
	const canProcess = $derived(sourceImages.length > 0 && !processing);
	const editingIndex = $derived(sourceImages.findIndex(item => item.id === editingId));
	const editingImage = $derived(editingIndex >= 0 ? sourceImages[editingIndex] : null);

	const activeRatio = $derived.by(() => {
		if (useExactSize) {
			const r = outW / outH;
			return Number.isFinite(r) && r > 0 ? r : null;
		}
		if (ratioValue === "custom") {
			const r = customW / customH;
			return Number.isFinite(r) && r > 0 ? r : null;
		}
		return ratioOptions.find(option => option.value === ratioValue)?.ratio ?? null;
	});

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

	function baseName(fileName: string) {
		return fileName.replace(FILE_EXTENSION_RE, "");
	}

	function sanitizeQuality(value: number, fallback: number) {
		if (!Number.isFinite(value))
			return fallback;
		return Math.min(100, Math.max(1, Math.floor(value)));
	}

	function defaultCrop(natW: number, natH: number, ratio: number | null, ax: number, ay: number): CropRect {
		if (ratio === null)
			return { x: 0, y: 0, w: natW, h: natH };
		const imageRatio = natW / natH;
		let w: number;
		let h: number;
		if (imageRatio > ratio) {
			h = natH;
			w = h * ratio;
		}
		else {
			w = natW;
			h = w / ratio;
		}
		w = Math.round(w);
		h = Math.round(h);
		return {
			x: Math.round((natW - w) * ax),
			y: Math.round((natH - h) * ay),
			w,
			h,
		};
	}

	function nearestAlign(pos: number, total: number, size: number) {
		if (total - size <= 0)
			return 0.5;
		const fraction = pos / (total - size);
		return fraction < 0.25 ? 0 : fraction > 0.75 ? 1 : 0.5;
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
		editingId = null;
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
					id: `img-${crypto.randomUUID()}`,
					file,
					previewUrl,
					naturalWidth: img.naturalWidth,
					naturalHeight: img.naturalHeight,
					crop: defaultCrop(img.naturalWidth, img.naturalHeight, activeRatio, alignX, alignY),
					customized: false,
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

	// Re-apply the default crop (ratio + alignment) to every image. Manual per-image
	// tweaks are intentionally reset so the shared settings stay predictable.
	function applyRatioToAll() {
		clearProcessedImages();
		for (const item of sourceImages) {
			item.crop = defaultCrop(item.naturalWidth, item.naturalHeight, activeRatio, alignX, alignY);
			item.customized = false;
		}
	}

	function selectRatio(value: string) {
		ratioValue = value;
		if (value !== "custom")
			applyRatioToAll();
	}

	function applyCustomRatio() {
		if (ratioValue === "custom")
			applyRatioToAll();
	}

	function setAlignment(ax: number, ay: number) {
		alignX = ax;
		alignY = ay;
		applyRatioToAll();
	}

	function toggleExactSize(checked: boolean) {
		useExactSize = checked;
		applyRatioToAll();
	}

	function applyExactSize() {
		if (useExactSize)
			applyRatioToAll();
	}

	function resetCrop(id: string) {
		const item = sourceImages.find(entry => entry.id === id);
		if (!item)
			return;
		item.crop = defaultCrop(item.naturalWidth, item.naturalHeight, activeRatio, alignX, alignY);
		item.customized = false;
		clearProcessedImages();
	}

	// --- Interactive crop editor -------------------------------------------------

	type DragMode = "move" | "nw" | "ne" | "sw" | "se";
	let drag: { mode: DragMode; startX: number; startY: number; rect: CropRect } | null = null;

	function openEditor(id: string) {
		editingId = id;
	}

	function openFirstEditor() {
		if (sourceImages.length > 0)
			editingId = sourceImages[0].id;
	}

	function closeEditor() {
		editingId = null;
	}

	function gotoDelta(delta: number) {
		if (editingIndex < 0)
			return;
		const next = editingIndex + delta;
		if (next < 0 || next >= sourceImages.length)
			return;
		editingId = sourceImages[next].id;
	}

	$effect(() => {
		if (!editingId)
			return;
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape")
				closeEditor();
			else if (event.key === "ArrowLeft")
				gotoDelta(-1);
			else if (event.key === "ArrowRight")
				gotoDelta(1);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	// Reposition the current image's crop to an alignment anchor, keeping its size.
	function alignCurrentCrop(ax: number, ay: number) {
		const item = editingImage;
		if (!item)
			return;
		item.crop = {
			...item.crop,
			x: Math.round((item.naturalWidth - item.crop.w) * ax),
			y: Math.round((item.naturalHeight - item.crop.h) * ay),
		};
		item.customized = true;
		clearProcessedImages();
	}

	function startDrag(mode: DragMode, event: PointerEvent) {
		if (!editingImage)
			return;
		event.preventDefault();
		// Stop a handle's pointerdown from bubbling to the box's "move" handler,
		// which would otherwise overwrite the resize with a move.
		event.stopPropagation();
		drag = { mode, startX: event.clientX, startY: event.clientY, rect: { ...editingImage.crop } };
		window.addEventListener("pointermove", onDrag);
		window.addEventListener("pointerup", endDrag);
	}

	function clamp(value: number, min: number, max: number) {
		return Math.min(max, Math.max(min, value));
	}

	function onDrag(event: PointerEvent) {
		const item = editingImage;
		if (!drag || !item || editorDispW <= 0)
			return;
		const scale = item.naturalWidth / editorDispW;
		const dx = (event.clientX - drag.startX) * scale;
		const dy = (event.clientY - drag.startY) * scale;
		const start = drag.rect;
		const natW = item.naturalWidth;
		const natH = item.naturalHeight;

		if (drag.mode === "move") {
			item.crop = {
				...start,
				x: clamp(start.x + dx, 0, natW - start.w),
				y: clamp(start.y + dy, 0, natH - start.h),
			};
			item.customized = true;
			return;
		}

		// Corner resize: opposite corner stays fixed.
		const dirX = drag.mode === "ne" || drag.mode === "se" ? 1 : -1;
		const dirY = drag.mode === "sw" || drag.mode === "se" ? 1 : -1;
		const fixedX = dirX > 0 ? start.x : start.x + start.w;
		const fixedY = dirY > 0 ? start.y : start.y + start.h;
		const pointerX = (dirX > 0 ? start.x + start.w : start.x) + dx;
		const pointerY = (dirY > 0 ? start.y + start.h : start.y) + dy;

		const availW = dirX > 0 ? natW - fixedX : fixedX;
		const availH = dirY > 0 ? natH - fixedY : fixedY;

		let w: number;
		let h: number;
		if (activeRatio !== null) {
			w = clamp(Math.abs(pointerX - fixedX), MIN_CROP_PX, availW);
			h = w / activeRatio;
			if (h > availH) {
				h = availH;
				w = h * activeRatio;
			}
			w = Math.max(w, MIN_CROP_PX);
			h = Math.max(h, MIN_CROP_PX);
		}
		else {
			w = clamp(Math.abs(pointerX - fixedX), MIN_CROP_PX, availW);
			h = clamp(Math.abs(pointerY - fixedY), MIN_CROP_PX, availH);
		}

		item.crop = {
			x: Math.round(dirX > 0 ? fixedX : fixedX - w),
			y: Math.round(dirY > 0 ? fixedY : fixedY - h),
			w: Math.round(w),
			h: Math.round(h),
		};
		item.customized = true;
	}

	function endDrag() {
		drag = null;
		window.removeEventListener("pointermove", onDrag);
		window.removeEventListener("pointerup", endDrag);
		clearProcessedImages();
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

		quality = sanitizeQuality(quality, 90);
		processing = true;
		processedCount = 0;
		error = "";
		clearProcessedImages();

		try {
			const next: ProcessedImage[] = [];
			const qualityRatio = quality / 100;
			const exactW = Math.max(1, Math.round(outW));
			const exactH = Math.max(1, Math.round(outH));

			for (let index = 0; index < sourceImages.length; index += 1) {
				const source = sourceImages[index];
				const img = await loadImage(source.previewUrl);
				const crop = source.crop;
				const cropW = Math.max(1, Math.round(crop.w));
				const cropH = Math.max(1, Math.round(crop.h));
				const targetW = useExactSize ? exactW : cropW;
				const targetH = useExactSize ? exactH : cropH;
				const canvas = document.createElement("canvas");
				canvas.width = targetW;
				canvas.height = targetH;
				const ctx = canvas.getContext("2d");
				if (!ctx)
					throw new Error("Unable to create canvas context");
				ctx.drawImage(img, crop.x, crop.y, cropW, cropH, 0, 0, targetW, targetH);

				const blob = await canvasToBlob(
					canvas,
					activeFormat.mime,
					outputFormat === "png" ? undefined : qualityRatio,
				);
				const previewUrl = URL.createObjectURL(blob);
				next.push({
					fileName: `${baseName(source.file.name)}_cropped.${activeFormat.extension}`,
					blob,
					previewUrl,
					width: targetW,
					height: targetH,
				});
				processedCount = index + 1;
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

	function downloadBlob(blob: Blob, name: string) {
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = name;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
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
			downloadBlob(blob, `cropped_images_${outputFormat}.zip`);
		}
		catch (err) {
			error = (err as Error).message || "Failed to create zip";
		}
		finally {
			processing = false;
		}
	}
</script>

{#snippet alignGrid(currentX: number, currentY: number, pick: (x: number, y: number) => void, disabled: boolean)}
	<div class="bg-muted grid w-fit grid-cols-3 gap-1 rounded-lg p-1" role="group" aria-label="Crop alignment">
		{#each alignSteps as ay (ay)}
			{#each alignSteps as ax (ax)}
				<button
					type="button"
					{disabled}
					class={cn(
						"flex size-7 items-center justify-center rounded transition-colors disabled:opacity-40",
						currentX === ax && currentY === ay ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground",
					)}
					onclick={() => pick(ax, ay)}
					aria-label="Align {ay === 0 ? "top" : ay === 1 ? "bottom" : "middle"} {ax === 0 ? "left" : ax === 1 ? "right" : "centre"}"
					aria-pressed={currentX === ax && currentY === ay}
				>
					<span class="size-1.5 rounded-full bg-current"></span>
				</button>
			{/each}
		{/each}
	</div>
{/snippet}

<svelte:head>
	<title>Image Cropper</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<Crop class="text-primary size-7" />
		Image Cropper
	</h1>
	<p class="text-muted-foreground mb-8">Crop many images to a shared aspect ratio, then fine-tune any of them individually.</p>

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
			<Card.Title>Crop Settings</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="grid gap-1.5">
				<Label>Aspect Ratio</Label>
				<div class="bg-muted inline-flex flex-wrap gap-1 rounded-lg p-1">
					{#each ratioOptions as option (option.value)}
						<Button variant={!useExactSize && ratioValue === option.value ? "default" : "ghost"} size="sm" disabled={useExactSize} onclick={() => selectRatio(option.value)}>{option.label}</Button>
					{/each}
				</div>
				{#if useExactSize}
					<p class="text-muted-foreground text-xs">Exact output size is controlling the ratio ({outW}:{outH}).</p>
				{/if}
			</div>

			{#if ratioValue === "custom" && !useExactSize}
				<div class="flex flex-wrap items-end gap-3">
					<div class="grid gap-1.5">
						<Label for="customW">Width ratio</Label>
						<Input id="customW" type="number" min={1} class="w-24" bind:value={customW} onchange={applyCustomRatio} />
					</div>
					<span class="pb-2 text-lg">:</span>
					<div class="grid gap-1.5">
						<Label for="customH">Height ratio</Label>
						<Input id="customH" type="number" min={1} class="w-24" bind:value={customH} onchange={applyCustomRatio} />
					</div>
				</div>
			{/if}

			<div class="flex flex-wrap items-start gap-6">
				<div class="grid gap-1.5">
					<Label>Crop Alignment</Label>
					{@render alignGrid(alignX, alignY, setAlignment, activeRatio === null)}
					<p class="text-muted-foreground text-xs">{activeRatio === null ? "Only applies with a fixed ratio" : "Where the crop sits by default"}</p>
				</div>

				<div class="grid gap-1.5">
					<Label>Output Size</Label>
					<Label class="font-normal"><Checkbox checked={useExactSize} onCheckedChange={toggleExactSize} /> Resize to exact pixels</Label>
					{#if useExactSize}
						<div class="flex items-end gap-2">
							<Input type="number" min={1} class="w-24" bind:value={outW} onchange={applyExactSize} aria-label="Output width" />
							<span class="pb-2">×</span>
							<Input type="number" min={1} class="w-24" bind:value={outH} onchange={applyExactSize} aria-label="Output height" />
							<span class="text-muted-foreground pb-2 text-sm">px</span>
						</div>
					{/if}
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-1.5">
					<Label for="format">Output Format</Label>
					<Select id="format" bind:value={outputFormat}>
						{#each formatOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</Select>
				</div>
				{#if outputFormat !== "png"}
					<div class="grid gap-1.5">
						<Label for="quality">Quality ({quality}%)</Label>
						<div class="flex h-9 items-center"><Slider type="single" min={1} max={100} bind:value={quality} /></div>
					</div>
				{/if}
			</div>
			<p class="text-muted-foreground text-sm">
				{#if activeRatio === null}
					Free mode selects the whole image by default — open any image to draw a custom crop.
				{:else}
					Every image is cropped to this ratio. Open an image to reposition or resize its crop.
				{/if}
			</p>
		</Card.Content>
	</Card.Root>

	{#if error}
		<div class="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border px-4 py-3 text-sm">⚠️ {error}</div>
	{/if}

	{#if sourceImages.length > 0}
		<div class="mb-6 flex flex-wrap items-center justify-center gap-3">
			<Button variant="outline" size="lg" onclick={openFirstEditor} disabled={processing}>
				<Pencil class="size-4" />
				Customise Crop Positions
			</Button>
			<Button size="lg" onclick={processImages} disabled={!canProcess}>
				{#if processing}
					<LoaderCircle class="size-4 animate-spin" />
					Cropping {processedCount}/{sourceImages.length}...
				{:else}
					Crop {sourceImages.length} Image{sourceImages.length === 1 ? "" : "s"}
				{/if}
			</Button>
		</div>
	{/if}

	{#if sourceImages.length > 0}
		<Card.Root class="mb-6">
			<Card.Header>
				<Card.Title>Images</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
					{#each sourceImages as item (item.id)}
						{@const left = (item.crop.x / item.naturalWidth) * 100}
						{@const top = (item.crop.y / item.naturalHeight) * 100}
						{@const width = (item.crop.w / item.naturalWidth) * 100}
						{@const height = (item.crop.h / item.naturalHeight) * 100}
						<div class="overflow-hidden rounded-md border">
							<button type="button" class="relative block w-full cursor-pointer" onclick={() => openEditor(item.id)} aria-label="Edit crop for {item.file.name}">
								<img src={item.previewUrl} alt={item.file.name} loading="lazy" class="block max-h-40 w-full bg-black/5 object-contain" />
								<span class="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style="left:{left}%;top:{top}%;width:{width}%;height:{height}%;"></span>
								{#if item.customized}
									<span class="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium">Custom</span>
								{/if}
							</button>
							<div class="flex items-center justify-between gap-1 p-2">
								<span class="text-muted-foreground truncate text-xs" title={item.file.name}>{item.file.name}</span>
								<div class="flex shrink-0 gap-1">
									<Button variant="ghost" size="icon" class="size-7" onclick={() => openEditor(item.id)} aria-label="Edit crop">
										<Pencil class="size-3.5" />
									</Button>
									{#if item.customized}
										<Button variant="ghost" size="icon" class="size-7" onclick={() => resetCrop(item.id)} aria-label="Reset crop">
											<RotateCcw class="size-3.5" />
										</Button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if hasResults}
		<Card.Root class="mb-6" id="results">
			<Card.Header class="flex-row items-center justify-between space-y-0">
				<Card.Title>Results</Card.Title>
				<Button onclick={downloadZip} disabled={processing}>
					<Package class="size-4" />
					Download ZIP
				</Button>
			</Card.Header>
			<Card.Content>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
					{#each processedImages as item (item.previewUrl)}
						<div class="overflow-hidden rounded-md border">
							<img src={item.previewUrl} alt={item.fileName} loading="lazy" class="block max-h-40 w-full bg-black/5 object-contain" />
							<div class="text-muted-foreground flex flex-col gap-0.5 p-2 text-xs">
								<span>{item.width} × {item.height}px</span>
								<span>{formatBytes(item.blob.size)}</span>
								<button type="button" class="text-primary text-left hover:underline" onclick={() => downloadBlob(item.blob, item.fileName)}>Download</button>
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<footer class="text-muted-foreground text-center text-sm">
		<p>✨ Runs in your browser • No uploads required</p>
	</footer>
</main>

{#if editingImage}
	{@const item = editingImage}
	{@const scale = editorDispW > 0 ? editorDispW / item.naturalWidth : 0}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
		role="button"
		tabindex="-1"
		onclick={event => event.target === event.currentTarget && closeEditor()}
		onkeydown={event => event.key === "Escape" && closeEditor()}
	>
		<div class="bg-background flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-auto rounded-xl border p-4 shadow-xl">
			<div class="flex items-center justify-between gap-2">
				<h2 class="flex items-center gap-2 font-semibold"><Crop class="text-primary size-5" /> Adjust Crop</h2>
				<div class="flex items-center gap-1">
					<Button variant="outline" size="icon" class="size-8" onclick={() => gotoDelta(-1)} disabled={editingIndex <= 0} aria-label="Previous image">
						<ChevronLeft class="size-4" />
					</Button>
					<span class="text-muted-foreground min-w-16 text-center text-sm tabular-nums">{editingIndex + 1} / {sourceImages.length}</span>
					<Button variant="outline" size="icon" class="size-8" onclick={() => gotoDelta(1)} disabled={editingIndex >= sourceImages.length - 1} aria-label="Next image">
						<ChevronRight class="size-4" />
					</Button>
					<Button variant="ghost" size="icon" class="size-8" onclick={closeEditor} aria-label="Close">
						<X class="size-4" />
					</Button>
				</div>
			</div>

			<div class="flex justify-center">
				<div class="relative inline-block touch-none select-none">
					<img
						src={item.previewUrl}
						alt={item.file.name}
						class="block max-h-[60vh] max-w-full"
						bind:clientWidth={editorDispW}
						bind:clientHeight={editorDispH}
						draggable="false"
					/>
					{#if scale > 0}
						{@const box = { left: item.crop.x * scale, top: item.crop.y * scale, w: item.crop.w * scale, h: item.crop.h * scale }}
						<div class="pointer-events-none absolute inset-0 bg-black/50" style="clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, {box.left}px {box.top}px, {box.left}px {box.top + box.h}px, {box.left + box.w}px {box.top + box.h}px, {box.left + box.w}px {box.top}px, {box.left}px {box.top}px);"></div>
						<div
							class="absolute cursor-move border-2 border-white"
							style="left:{box.left}px;top:{box.top}px;width:{box.w}px;height:{box.h}px;"
							onpointerdown={event => startDrag("move", event)}
							role="button"
							tabindex="-1"
							aria-label="Move crop"
						>
							{#each ["nw", "ne", "sw", "se"] as const as handle (handle)}
								<span
									class="border-primary absolute size-3 rounded-full border-2 bg-white"
									class:cursor-nwse-resize={handle === "nw" || handle === "se"}
									class:cursor-nesw-resize={handle === "ne" || handle === "sw"}
									style="{handle.includes("n") ? "top:-6px" : "bottom:-6px"};{handle.includes("w") ? "left:-6px" : "right:-6px"};"
									onpointerdown={event => startDrag(handle, event)}
									role="button"
									tabindex="-1"
									aria-label="Resize crop {handle}"
								></span>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<div class="flex flex-wrap items-end justify-between gap-3">
				<div class="grid gap-1.5">
					<Label>Alignment</Label>
					{@render alignGrid(
						nearestAlign(item.crop.x, item.naturalWidth, item.crop.w),
						nearestAlign(item.crop.y, item.naturalHeight, item.crop.h),
						alignCurrentCrop,
						false,
					)}
				</div>
				<div class="text-muted-foreground flex flex-col items-end gap-2 text-sm">
					<span>Crop: {Math.round(item.crop.w)} × {Math.round(item.crop.h)}px{activeRatio === null ? "" : useExactSize ? ` → ${Math.round(outW)} × ${Math.round(outH)}px` : ""}</span>
					<div class="flex gap-2">
						<Button variant="outline" size="sm" onclick={() => resetCrop(item.id)}>
							<RotateCcw class="size-3.5" />
							Reset
						</Button>
						<Button size="sm" onclick={closeEditor}>Done</Button>
					</div>
				</div>
			</div>
			<p class="text-muted-foreground text-center text-xs">Use ← → arrow keys to move between images</p>
		</div>
	</div>
{/if}
