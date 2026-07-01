<script lang="ts">
	import { resolve as resolvePath } from "$app/paths";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Input } from "$lib/components/ui/input";
	import { Select } from "$lib/components/ui/select";
	import { cn } from "$lib/utils";
	import { ChevronLeft, ChevronRight, FileStack, FileText, RotateCw, Trash2, Upload } from "@lucide/svelte";
	import JSZip from "jszip";
	import { degrees, PDFDocument } from "pdf-lib";
	import { SvelteMap } from "svelte/reactivity";

	type PageItem = {
		id: string;
		sourceId: string;
		sourceName: string;
		sourceIndex: number;
		rotation: number;
		selected: boolean;
	};

	type SplitMode = "individual" | "everyN" | "ranges";

	const PDF_EXTENSION_RE = /\.pdf$/i;
	const RANGE_RE = /^\d+(?:-\d+)?$/;

	const sources = new SvelteMap<string, ArrayBuffer>();

	let pages = $state<PageItem[]>([]);
	let processing = $state(false);
	let error = $state("");
	let info = $state("");
	let dragIndex = $state<number | null>(null);
	let idCounter = 0;

	let splitMode = $state<SplitMode>("individual");
	let everyN = $state(1);
	let rangesText = $state("");

	const selectedCount = $derived(pages.filter(page => page.selected).length);
	const baseName = $derived(
		pages.length > 0 ? pages[0].sourceName.replace(PDF_EXTENSION_RE, "") : "document",
	);

	async function addFiles(fileList: FileList | null | undefined) {
		if (!fileList || fileList.length === 0)
			return;
		error = "";
		info = "";
		const incoming = [...fileList].filter(file => file.type === "application/pdf" || PDF_EXTENSION_RE.test(file.name));
		if (incoming.length === 0) {
			error = "Please add valid PDF files";
			return;
		}

		const added: PageItem[] = [];
		for (const file of incoming) {
			try {
				const bytes = await file.arrayBuffer();
				const doc = await PDFDocument.load(bytes);
				const count = doc.getPageCount();
				const sourceId = `src-${idCounter++}`;
				sources.set(sourceId, bytes);
				for (let i = 0; i < count; i++) {
					added.push({
						id: `pg-${idCounter++}`,
						sourceId,
						sourceName: file.name,
						sourceIndex: i,
						rotation: 0,
						selected: false,
					});
				}
			}
			catch (e) {
				error = `Failed to load ${file.name}: ${(e as Error).message}`;
			}
		}

		pages = [...pages, ...added];
	}

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		void addFiles(target.files);
		target.value = "";
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		void addFiles(event.dataTransfer?.files);
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}

	function rotatePage(id: string) {
		const page = pages.find(item => item.id === id);
		if (page)
			page.rotation = (page.rotation + 90) % 360;
	}

	function removePage(id: string) {
		pages = pages.filter(item => item.id !== id);
	}

	function movePage(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= pages.length)
			return;
		const next = [...pages];
		[next[index], next[target]] = [next[target], next[index]];
		pages = next;
	}

	function onCardDragStart(index: number) {
		dragIndex = index;
	}

	function onCardDrop(index: number) {
		if (dragIndex === null || dragIndex === index) {
			dragIndex = null;
			return;
		}
		const next = [...pages];
		const [moved] = next.splice(dragIndex, 1);
		next.splice(index, 0, moved);
		pages = next;
		dragIndex = null;
	}

	function toggleSelect(id: string) {
		const page = pages.find(item => item.id === id);
		if (page)
			page.selected = !page.selected;
	}

	function selectAll() {
		for (const page of pages)
			page.selected = true;
	}

	function clearSelection() {
		for (const page of pages)
			page.selected = false;
	}

	function clearAll() {
		pages = [];
		sources.clear();
		error = "";
		info = "";
	}

	async function buildPdf(items: PageItem[]): Promise<Uint8Array> {
		const out = await PDFDocument.create();
		const cache = new SvelteMap<string, PDFDocument>();
		for (const item of items) {
			let srcDoc = cache.get(item.sourceId);
			if (!srcDoc) {
				const bytes = sources.get(item.sourceId);
				if (!bytes)
					continue;
				srcDoc = await PDFDocument.load(bytes);
				cache.set(item.sourceId, srcDoc);
			}
			const [copied] = await out.copyPages(srcDoc, [item.sourceIndex]);
			if (item.rotation !== 0) {
				const base = copied.getRotation().angle;
				copied.setRotation(degrees((base + item.rotation) % 360));
			}
			out.addPage(copied);
		}
		return out.save();
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

	function downloadPdf(bytes: Uint8Array, name: string) {
		downloadBlob(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), name);
	}

	async function mergeDownload() {
		if (pages.length === 0)
			return;
		processing = true;
		error = "";
		info = "";
		try {
			const bytes = await buildPdf(pages);
			downloadPdf(bytes, `${baseName}_merged.pdf`);
			info = `Saved ${pages.length} page${pages.length === 1 ? "" : "s"} to one PDF.`;
		}
		catch (e) {
			error = `Failed to build PDF: ${(e as Error).message}`;
		}
		finally {
			processing = false;
		}
	}

	async function downloadSelected() {
		const selected = pages.filter(page => page.selected);
		if (selected.length === 0)
			return;
		processing = true;
		error = "";
		info = "";
		try {
			const bytes = await buildPdf(selected);
			downloadPdf(bytes, `${baseName}_extract.pdf`);
			info = `Extracted ${selected.length} selected page${selected.length === 1 ? "" : "s"}.`;
		}
		catch (e) {
			error = `Failed to extract pages: ${(e as Error).message}`;
		}
		finally {
			processing = false;
		}
	}

	function parseRanges(text: string, max: number): { label: string; items: PageItem[] }[] {
		const groups: { label: string; items: PageItem[] }[] = [];
		for (const rawPart of text.split(",")) {
			const part = rawPart.trim();
			if (!part)
				continue;
			if (!RANGE_RE.test(part))
				throw new Error(`Invalid range: "${part}"`);
			const [startStr, endStr] = part.split("-");
			const start = Number.parseInt(startStr, 10);
			const end = endStr === undefined ? start : Number.parseInt(endStr, 10);
			if (start < 1 || end > max || start > end)
				throw new Error(`Range "${part}" is out of bounds (1-${max})`);
			const items = pages.slice(start - 1, end);
			groups.push({ label: start === end ? `${start}` : `${start}-${end}`, items });
		}
		if (groups.length === 0)
			throw new Error("Enter at least one page range");
		return groups;
	}

	function buildSplitGroups(): { label: string; items: PageItem[] }[] {
		if (splitMode === "individual")
			return pages.map((page, index) => ({ label: String(index + 1).padStart(2, "0"), items: [page] }));

		if (splitMode === "everyN") {
			const size = Math.max(1, Math.floor(Number(everyN) || 1));
			const groups: { label: string; items: PageItem[] }[] = [];
			for (let offset = 0; offset < pages.length; offset += size) {
				const items = pages.slice(offset, offset + size);
				const from = offset + 1;
				const to = offset + items.length;
				groups.push({ label: from === to ? `${from}` : `${from}-${to}`, items });
			}
			return groups;
		}

		return parseRanges(rangesText, pages.length);
	}

	async function splitDownload() {
		if (pages.length === 0)
			return;
		processing = true;
		error = "";
		info = "";
		try {
			const groups = buildSplitGroups();
			if (groups.length === 1) {
				const bytes = await buildPdf(groups[0].items);
				downloadPdf(bytes, `${baseName}_pages_${groups[0].label}.pdf`);
				info = "Only one output file — downloaded directly.";
				return;
			}

			const zip = new JSZip();
			for (const group of groups) {
				const bytes = await buildPdf(group.items);
				zip.file(`${baseName}_pages_${group.label}.pdf`, bytes);
			}
			const blob = await zip.generateAsync({ type: "blob" });
			downloadBlob(blob, `${baseName}_split.zip`);
			info = `Split into ${groups.length} files (zipped).`;
		}
		catch (e) {
			error = (e as Error).message || "Failed to split PDF";
		}
		finally {
			processing = false;
		}
	}
</script>

<svelte:head>
	<title>PDF Organizer</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<FileStack class="text-primary size-7" />
		PDF Organizer
	</h1>
	<p class="text-muted-foreground mb-8">Merge, split, reorder, rotate, and extract PDF pages — all in your browser.</p>

	<label
		class="border-input hover:border-ring hover:bg-accent bg-muted/40 mb-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors"
		ondrop={handleDrop}
		ondragover={handleDragOver}
	>
		<Upload class="text-muted-foreground size-9" />
		<p class="font-medium">Drag & drop one or more PDFs here</p>
		<p class="text-muted-foreground text-sm">or click to browse</p>
		<input type="file" accept=".pdf" multiple onchange={handleFileSelect} hidden />
	</label>

	{#if error}
		<div class="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border px-4 py-3 text-sm">⚠️ {error}</div>
	{/if}
	{#if info && !error}
		<div class="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">✅ {info}</div>
	{/if}

	{#if pages.length > 0}
		<Card.Root class="mb-6">
			<Card.Header class="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
				<Card.Title>Pages ({pages.length})</Card.Title>
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" onclick={selectAll}>Select All</Button>
					<Button variant="outline" size="sm" onclick={clearSelection}>Clear Selection</Button>
					<Button variant="outline" size="sm" onclick={clearAll}>Remove All</Button>
				</div>
			</Card.Header>
			<Card.Content>
				<p class="text-muted-foreground mb-4 text-sm">Drag cards to reorder. Rotate or delete individual pages, or tick pages to extract them.</p>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
					{#each pages as page, index (page.id)}
						<article
							class={cn(
								"bg-card flex cursor-grab flex-col gap-2 rounded-lg border p-2.5",
								page.selected ? "border-primary ring-primary/20 ring-2" : "border-border",
								dragIndex === index && "opacity-50",
							)}
							draggable="true"
							ondragstart={() => onCardDragStart(index)}
							ondragover={handleDragOver}
							ondrop={() => onCardDrop(index)}
							ondragend={() => (dragIndex = null)}
						>
							<div class="flex items-center gap-2 text-sm">
								<Checkbox checked={page.selected} onCheckedChange={() => toggleSelect(page.id)} />
								<span class="font-semibold">{index + 1}</span>
							</div>
							<div class="bg-muted grid h-[90px] place-items-center rounded-md border transition-transform" style="transform: rotate({page.rotation}deg);">
								<FileText class="text-muted-foreground size-9" />
							</div>
							<div class="flex min-w-0 flex-col text-xs">
								<span class="truncate" title={page.sourceName}>{page.sourceName}</span>
								<span class="text-muted-foreground">p{page.sourceIndex + 1}{page.rotation ? ` · ${page.rotation}°` : ""}</span>
							</div>
							<div class="grid grid-cols-4 gap-1">
								<Button variant="outline" size="icon" class="size-7" title="Move left" onclick={() => movePage(index, -1)} disabled={index === 0}><ChevronLeft class="size-4" /></Button>
								<Button variant="outline" size="icon" class="size-7" title="Rotate 90°" onclick={() => rotatePage(page.id)}><RotateCw class="size-4" /></Button>
								<Button variant="outline" size="icon" class="hover:bg-destructive/10 hover:text-destructive size-7" title="Delete page" onclick={() => removePage(page.id)}><Trash2 class="size-4" /></Button>
								<Button variant="outline" size="icon" class="size-7" title="Move right" onclick={() => movePage(index, 1)} disabled={index === pages.length - 1}><ChevronRight class="size-4" /></Button>
							</div>
						</article>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Export</Card.Title>
			</Card.Header>
			<Card.Content class="divide-border divide-y">
				<div class="flex flex-wrap items-center justify-between gap-3 pb-4">
					<div>
						<h3 class="font-semibold">Merge / Save</h3>
						<p class="text-muted-foreground text-sm">Save every page in the current order as a single PDF.</p>
					</div>
					<Button onclick={mergeDownload} disabled={processing}>Save PDF ({pages.length})</Button>
				</div>

				<div class="flex flex-wrap items-center justify-between gap-3 py-4">
					<div>
						<h3 class="font-semibold">Extract Selected</h3>
						<p class="text-muted-foreground text-sm">Save only the ticked pages as one PDF.</p>
					</div>
					<Button variant="outline" onclick={downloadSelected} disabled={processing || selectedCount === 0}>Extract Selected ({selectedCount})</Button>
				</div>

				<div class="flex flex-wrap items-center justify-between gap-3 pt-4">
					<div class="min-w-[220px] flex-1">
						<h3 class="font-semibold">Split</h3>
						<div class="my-2 flex flex-wrap gap-2">
							<div class="w-52">
								<Select bind:value={splitMode} aria-label="Split mode">
									<option value="individual">Each page separately</option>
									<option value="everyN">Every N pages</option>
									<option value="ranges">Custom ranges</option>
								</Select>
							</div>
							{#if splitMode === "everyN"}
								<div class="w-40"><Input type="number" min={1} max={pages.length} bind:value={everyN} aria-label="Pages per file" /></div>
							{/if}
							{#if splitMode === "ranges"}
								<div class="w-52"><Input type="text" bind:value={rangesText} placeholder="e.g. 1-3, 4, 5-8" aria-label="Page ranges" /></div>
							{/if}
						</div>
						<p class="text-muted-foreground text-sm">Multiple output files are delivered as a ZIP.</p>
					</div>
					<Button onclick={splitDownload} disabled={processing}>Split & Download</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<footer class="text-muted-foreground mt-8 text-center text-sm">
		<p>✨ No server upload • Runs entirely in your browser</p>
	</footer>
</main>
