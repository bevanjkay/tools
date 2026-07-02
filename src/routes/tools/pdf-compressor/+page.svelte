<script lang="ts">
	import { resolve as resolvePath } from "$app/paths";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Label } from "$lib/components/ui/label";
	import { Select } from "$lib/components/ui/select";
	import { Slider } from "$lib/components/ui/slider";
	import { downsamplePdf, rasterizePdf } from "$lib/pdf-compress";
	import { cn } from "$lib/utils";
	import { FileArchive, LoaderCircle, Package, Trash2, Upload } from "@lucide/svelte";
	import JSZip from "jszip";
	import { onDestroy } from "svelte";

	type CompressMode = "downsample" | "rasterize";

	type SourcePdf = {
		id: string;
		file: File;
	};

	type ProcessedPdf = {
		fileName: string;
		blob: Blob;
		originalSize: number;
	};

	const PDF_EXTENSION_RE = /\.pdf$/i;

	const dpiOptions = [
		{ value: 72, label: "72 (screen, smallest)" },
		{ value: 96, label: "96 (screen)" },
		{ value: 120, label: "120 (balanced)" },
		{ value: 150, label: "150 (print)" },
		{ value: 200, label: "200 (high quality)" },
	];

	const imageDpiOptions = [
		{ value: 0, label: "Keep resolution (quality only)" },
		{ value: 72, label: "72 DPI (screen, smallest)" },
		{ value: 96, label: "96 DPI (screen)" },
		{ value: 150, label: "150 DPI (balanced)" },
		{ value: 200, label: "200 DPI (good print)" },
		{ value: 300, label: "300 DPI (high quality)" },
	];

	let sourcePdfs = $state<SourcePdf[]>([]);
	let processedPdfs = $state<ProcessedPdf[]>([]);
	let error = $state("");
	let processing = $state(false);
	let processedCount = $state(0);
	let statusText = $state("");

	let mode = $state<CompressMode>("downsample");
	let dpi = $state(96);
	let quality = $state(65);
	let imageDpi = $state(150);
	let imageQuality = $state(65);

	const hasResults = $derived(processedPdfs.length > 0);
	const canProcess = $derived(sourcePdfs.length > 0 && !processing);
	const originalTotalBytes = $derived(sourcePdfs.reduce((sum, item) => sum + item.file.size, 0));
	const processedTotalBytes = $derived(processedPdfs.reduce((sum, item) => sum + item.blob.size, 0));
	const sizeDeltaPercent = $derived(
		originalTotalBytes > 0 && hasResults
			? ((processedTotalBytes - originalTotalBytes) / originalTotalBytes) * 100
			: 0,
	);

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
		return fileName.replace(PDF_EXTENSION_RE, "");
	}

	function clearProcessed() {
		processedPdfs = [];
	}

	function clearAll() {
		sourcePdfs = [];
		clearProcessed();
		error = "";
		statusText = "";
		processedCount = 0;
	}

	onDestroy(() => {
		clearProcessed();
	});

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}

	function addFiles(files: File[]) {
		const valid = files.filter(file => file.type === "application/pdf" || PDF_EXTENSION_RE.test(file.name));
		if (valid.length === 0) {
			error = "Please select one or more PDF files";
			return;
		}
		error = "";
		clearProcessed();
		sourcePdfs = [
			...sourcePdfs,
			...valid.map(file => ({ id: `pdf-${crypto.randomUUID()}`, file })),
		];
	}

	function handleSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		addFiles(input.files ? [...input.files] : []);
		input.value = "";
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		addFiles(event.dataTransfer?.files ? [...event.dataTransfer.files] : []);
	}

	function removeFile(id: string) {
		sourcePdfs = sourcePdfs.filter(item => item.id !== id);
		clearProcessed();
	}

	async function processPdfs() {
		if (sourcePdfs.length === 0)
			return;

		processing = true;
		processedCount = 0;
		error = "";
		statusText = "";
		clearProcessed();

		try {
			const next: ProcessedPdf[] = [];
			for (let index = 0; index < sourcePdfs.length; index += 1) {
				const source = sourcePdfs[index];
				statusText = `Processing ${source.file.name}...`;
				const bytes = await source.file.arrayBuffer();
				const result = mode === "rasterize"
					? await rasterizePdf(bytes, { dpi, quality })
					: await downsamplePdf(bytes, { imageDpi, imageQuality });
				const blob = new Blob([new Uint8Array(result)], { type: "application/pdf" });
				next.push({
					fileName: `${baseName(source.file.name)}_compressed.pdf`,
					blob,
					originalSize: source.file.size,
				});
				processedCount = index + 1;
			}
			processedPdfs = next;
			statusText = "";
		}
		catch (err) {
			error = (err as Error).message || "Failed to compress PDF";
			clearProcessed();
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
		if (processedPdfs.length === 0 || processing)
			return;
		processing = true;
		error = "";
		try {
			const zip = new JSZip();
			processedPdfs.forEach((item) => {
				zip.file(item.fileName, item.blob);
			});
			const blob = await zip.generateAsync({ type: "blob" });
			downloadBlob(blob, "compressed_pdfs.zip");
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
	<title>PDF Compressor</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<FileArchive class="text-primary size-7" />
		PDF Compressor
	</h1>
	<p class="text-muted-foreground mb-8">Shrink PDF file sizes right in your browser.</p>

	<Card.Root class="mb-6">
		<Card.Header>
			<Card.Title>Upload PDFs</Card.Title>
		</Card.Header>
		<Card.Content>
			<label
				class="border-input hover:border-ring hover:bg-accent bg-muted/40 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors"
				ondrop={handleDrop}
				ondragover={handleDragOver}
			>
				<Upload class="text-muted-foreground size-9" />
				<p class="font-medium">Drag & drop PDF files</p>
				<p class="text-muted-foreground text-sm">or click to browse</p>
				{#if sourcePdfs.length > 0}
					<p class="text-muted-foreground text-sm">{sourcePdfs.length} PDF{sourcePdfs.length === 1 ? "" : "s"} loaded</p>
				{/if}
				<input type="file" accept="application/pdf,.pdf" multiple onchange={handleSelect} hidden />
			</label>
			{#if sourcePdfs.length > 0}
				<div class="mt-3 space-y-2">
					{#each sourcePdfs as item (item.id)}
						<div class="bg-muted flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
							<span class="truncate text-sm" title={item.file.name}>{item.file.name}</span>
							<div class="flex shrink-0 items-center gap-2">
								<span class="text-muted-foreground text-xs">{formatBytes(item.file.size)}</span>
								<Button variant="ghost" size="icon" class="size-7" onclick={() => removeFile(item.id)} aria-label="Remove">
									<Trash2 class="size-3.5" />
								</Button>
							</div>
						</div>
					{/each}
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
				<Label>Mode</Label>
				<div class="bg-muted inline-flex flex-wrap gap-1 rounded-lg p-1">
					<Button variant={mode === "downsample" ? "default" : "ghost"} size="sm" onclick={() => (mode = "downsample")}>Downsample images (keep text)</Button>
					<Button variant={mode === "rasterize" ? "default" : "ghost"} size="sm" onclick={() => (mode = "rasterize")}>Aggressive (rasterize)</Button>
				</div>
			</div>

			{#if mode === "downsample"}
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div class="grid gap-1.5">
						<Label for="imageDpi">Target image resolution</Label>
						<Select id="imageDpi" bind:value={imageDpi}>
							{#each imageDpiOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</Select>
					</div>
					<div class="grid gap-1.5">
						<Label for="imageQuality">JPEG Quality ({imageQuality}%)</Label>
						<div class="flex h-9 items-center"><Slider type="single" min={1} max={100} bind:value={imageQuality} /></div>
					</div>
				</div>
				<p class="text-muted-foreground text-sm">
					Recompresses embedded JPEG photos to a target DPI (based on where each image sits on the page) while leaving text and vectors selectable. Images it can't safely re-encode (CMYK, lossless, masked) or place are left at full resolution and only re-compressed, so gains depend on the PDF.
				</p>
			{:else}
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div class="grid gap-1.5">
						<Label for="dpi">Resolution (DPI)</Label>
						<Select id="dpi" bind:value={dpi}>
							{#each dpiOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</Select>
					</div>
					<div class="grid gap-1.5">
						<Label for="quality">JPEG Quality ({quality}%)</Label>
						<div class="flex h-9 items-center"><Slider type="single" min={1} max={100} bind:value={quality} /></div>
					</div>
				</div>
				<p class="text-muted-foreground text-sm">
					Each page is re-rendered as a JPEG image and rebuilt into a new PDF. Big, reliable size reductions — but text becomes part of the image and is no longer selectable or searchable.
				</p>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if error}
		<div class="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border px-4 py-3 text-sm">⚠️ {error}</div>
	{/if}

	{#if sourcePdfs.length > 0}
		<div class="mb-6 text-center">
			<Button size="lg" onclick={processPdfs} disabled={!canProcess}>
				{#if processing}
					<LoaderCircle class="size-4 animate-spin" />
					Compressing {processedCount}/{sourcePdfs.length}...
				{:else}
					Compress {sourcePdfs.length} PDF{sourcePdfs.length === 1 ? "" : "s"}
				{/if}
			</Button>
			{#if processing && statusText}
				<p class="text-muted-foreground mt-2 text-sm">{statusText}</p>
			{/if}
		</div>
	{/if}

	{#if hasResults}
		<Card.Root class="mb-6" id="results">
			<Card.Header class="flex-row items-center justify-between space-y-0">
				<Card.Title>Results</Card.Title>
				{#if processedPdfs.length > 1}
					<Button onclick={downloadZip} disabled={processing}>
						<Package class="size-4" />
						Download ZIP
					</Button>
				{/if}
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-3 gap-3">
					<div class="bg-muted flex flex-col gap-1 rounded-lg border p-3">
						<span class="text-muted-foreground text-xs">Original</span>
						<strong>{formatBytes(originalTotalBytes)}</strong>
					</div>
					<div class="bg-muted flex flex-col gap-1 rounded-lg border p-3">
						<span class="text-muted-foreground text-xs">Compressed</span>
						<strong>{formatBytes(processedTotalBytes)}</strong>
					</div>
					<div class="bg-muted flex flex-col gap-1 rounded-lg border p-3">
						<span class="text-muted-foreground text-xs">Change</span>
						<strong class={sizeDeltaPercent > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
							{sizeDeltaPercent > 0 ? "+" : ""}{sizeDeltaPercent.toFixed(1)}%
						</strong>
					</div>
				</div>

				<div class="space-y-2">
					{#each processedPdfs as item (item.fileName)}
						{@const delta = item.originalSize > 0 ? ((item.blob.size - item.originalSize) / item.originalSize) * 100 : 0}
						<div class="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
							<span class="truncate text-sm" title={item.fileName}>{item.fileName}</span>
							<div class="flex shrink-0 items-center gap-3 text-xs">
								<span class="text-muted-foreground">{formatBytes(item.originalSize)} → {formatBytes(item.blob.size)}</span>
								<span class={cn("font-medium", delta > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
									{delta > 0 ? "+" : ""}{delta.toFixed(1)}%
								</span>
								<button type="button" class="text-primary hover:underline" onclick={() => downloadBlob(item.blob, item.fileName)}>Download</button>
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
