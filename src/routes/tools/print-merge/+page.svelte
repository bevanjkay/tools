<script lang="ts">
	import type { PDFFont } from "pdf-lib";
	import type { ImpositionOptions, OutputSize, PageOrder } from "#lib/imposition.js";
	import type { Background, DataTable, Layout, PageSizeId, SelectedRow, TextField } from "#lib/print-merge.js";
	import { resolve as resolvePath } from "$app/paths";
	import { AlignCenter, AlignLeft, AlignRight, ChevronLeft, ChevronRight, Download, FileText, LayoutGrid, LoaderCircle, Plus, Printer, Trash2, TriangleAlert, Upload, X } from "@lucide/svelte";
	import { PDFDocument } from "pdf-lib";
	import { onMount, untrack } from "svelte";
	import FileDropZone from "#lib/components/file-drop-zone.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { Select } from "#lib/components/ui/select/index.js";
	import { downloadBlob } from "#lib/download.js";
	import { imposePdf } from "#lib/imposition.js";
	import { renderPdfThumbnails } from "#lib/pdf-thumbnails.js";
	import {
		BASELINE_RATIO,
		buildMergedPdf,
		defaultField,
		defaultLayout,
		embedLayoutFonts,
		fontFor,
		fontKey,
		layoutColumns,
		layoutFieldText,
		LINE_HEIGHT,
		measureWith,
		naturalOrientation,
		PAGE_SIZES,
		pageDimensions,
		parseDelimited,
		parseLayout,
		ptToMm,
		selectRows,
		serializeLayout,
	} from "#lib/print-merge.js";
	import { sanitizeNonNegative, sanitizePositiveInt } from "#lib/sanitize.js";
	import { cn } from "#lib/utils.js";

	const STORAGE_KEY = "print-merge-layout";
	const CUSTOM_FONT_FAMILY = "PrintMergeCustomFont";
	const PREVIEW_FONTS: Record<TextField["font"], string> = {
		helvetica: "Helvetica, Arial, sans-serif",
		times: "'Times New Roman', Times, serif",
		courier: "'Courier New', Courier, monospace",
		custom: `${CUSTOM_FONT_FAMILY}, Helvetica, Arial, sans-serif`,
	};
	const TEXT_ANCHORS = { left: "start", center: "middle", right: "end" } as const;
	const FILE_EXTENSION_RE = /\.[^.]+$/;
	const MAX_TABLE_ROWS = 200;

	// --- Data ------------------------------------------------------------------
	let table = $state<DataTable | null>(null);
	let dataName = $state("");
	let pasteText = $state("");

	// --- Layout ----------------------------------------------------------------
	let layout = $state<Layout>(defaultLayout());
	let selectedFieldId = $state<string | null>(null);
	let layoutMessage = $state("");

	// --- Assets ----------------------------------------------------------------
	let background = $state<Background | null>(null);
	let backgroundName = $state("");
	let backgroundPreview = $state<string | null>(null);
	let customFont = $state<Uint8Array | null>(null);
	let customFontName = $state("");
	let customFontFace: FontFace | null = null;
	let fonts = $state<Map<string, PDFFont> | null>(null);

	// --- Output ----------------------------------------------------------------
	let position = $state(0);
	let processing = $state(false);
	let progress = $state("");
	let error = $state("");
	const imposition = $state({
		rows: 2,
		columns: 2,
		pageOrder: "row" as PageOrder,
		outputSize: "a3" as OutputSize,
		margin: 5,
		gap: 2,
		resizeToFit: false,
		autoRotate: true,
		showCropMarks: true,
		showBorders: false,
	});

	const dims = $derived(pageDimensions(layout.page));
	const columns = $derived(layoutColumns(layout));
	const selectedRows = $derived<SelectedRow[]>(table ? selectRows(table.rows, layout.selection, columns) : []);
	const previewIndex = $derived(Math.min(position, Math.max(0, selectedRows.length - 1)));
	// Without data, show each placeholder's name so fields can still be positioned.
	const previewRow = $derived<SelectedRow>(selectedRows[previewIndex] ?? { index: -1, data: Object.fromEntries(columns.map(column => [column, `{${column}}`])) });
	const selectedField = $derived(layout.fields.find(field => field.id === selectedFieldId) ?? null);
	const fontKeys = $derived(layout.fields.map(field => fontKey(field.font, field.bold)).toSorted().join());
	const customFontUsed = $derived(layout.fields.some(field => field.font === "custom"));
	const missingColumns = $derived.by(() => {
		const headers = table?.headers;
		return headers ? columns.filter(column => column !== "Row" && !headers.includes(column)) : [];
	});

	// Null while the face a field now asks for is still being embedded.
	function measurerFor(field: TextField) {
		const font = fonts ? fontFor(fonts, field) : undefined;
		if (!font)
			return null;
		const standard = fontKey(field.font, field.bold) !== "custom" || !customFont;
		return { measure: measureWith(font, standard), standard };
	}

	const previewFields = $derived(layout.fields.map((field) => {
		const measurer = measurerFor(field);
		if (!measurer)
			return { field, lines: [field.template], size: field.size, overflow: false, missing: [] };
		return { field, ...layoutFieldText(field, previewRow, previewIndex + 1, measurer.measure, measurer.standard) };
	}));

	const overflowRows = $derived.by(() => {
		if (!fonts || selectedRows.length === 0)
			return [] as { position: number; row: SelectedRow; templates: string[] }[];
		const measurers = layout.fields.flatMap((field) => {
			const measurer = measurerFor(field);
			return measurer ? [{ field, ...measurer }] : [];
		});
		const result: { position: number; row: SelectedRow; templates: string[] }[] = [];
		selectedRows.forEach((row, index) => {
			const templates = measurers
				.filter(({ field, measure, standard }) => layoutFieldText(field, row, index + 1, measure, standard).overflow)
				.map(({ field }) => field.template);
			if (templates.length > 0)
				result.push({ position: index, row, templates });
		});
		return result;
	});

	onMount(() => {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved)
				layout = parseLayout(saved);
		}
		catch {
		// Start from the default layout.
		}
		selectedFieldId = layout.fields[0]?.id ?? null;
	});

	$effect(() => {
		const json = serializeLayout(layout);
		try {
			localStorage.setItem(STORAGE_KEY, json);
		}
		catch {
		// Autosave is a convenience only.
		}
	});

	// Re-embed fonts only when the set of font faces or the uploaded font changes.
	$effect(() => {
		void fontKeys;
		const fontBytes = customFont;
		let cancelled = false;
		(async () => {
			try {
				const doc = await PDFDocument.create();
				const embedded = await embedLayoutFonts(doc, untrack(() => $state.snapshot(layout.fields)), fontBytes ?? undefined);
				if (!cancelled)
					fonts = embedded;
			}
			catch (e) {
				if (!cancelled)
					error = `Could not use that font: ${(e as Error).message}`;
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	// --- Data handlers ---------------------------------------------------------
	function loadText(text: string, name: string) {
		const parsed = parseDelimited(text);
		if (parsed.headers.length === 0 || parsed.rows.length === 0) {
			error = "No rows found. The first line should contain the column headings.";
			return;
		}
		error = "";
		table = parsed;
		dataName = name;
		position = 0;
		// Point the untouched starter field at the first column so something prints straight away.
		const [first] = layout.fields;
		if (layout.fields.length === 1 && first.template === "{Name}" && !parsed.headers.includes("Name"))
			first.template = `{${parsed.headers[0]}}`;
	}

	async function handleDataFiles(files: File[]) {
		const file = files[0];
		if (!file)
			return;
		loadText(await file.text(), file.name.replace(FILE_EXTENSION_RE, ""));
	}

	function handlePaste() {
		if (pasteText.trim())
			loadText(pasteText, "pasted-data");
	}

	function clearData() {
		table = null;
		dataName = "";
		pasteText = "";
		position = 0;
	}

	// --- Layout handlers -------------------------------------------------------
	function choosePageSize(size: PageSizeId) {
		layout.page.size = size;
		layout.page.orientation = naturalOrientation(size, layout.page.width, layout.page.height);
	}

	function nextFieldId() {
		const highest = Math.max(0, ...layout.fields.map(field => Number(/^field-(\d+)$/.exec(field.id)?.[1] ?? 0)));
		return `field-${highest + 1}`;
	}

	function addField() {
		const field = defaultField(nextFieldId(), layout.page, table?.headers[0] ? `{${table.headers[0]}}` : "{Name}");
		field.y = Math.min(dims.trim.height - field.h, field.y + (layout.fields.length * 5) % 30);
		layout.fields.push(field);
		selectedFieldId = field.id;
	}

	function removeField(id: string) {
		layout.fields = layout.fields.filter(field => field.id !== id);
		if (selectedFieldId === id)
			selectedFieldId = layout.fields[0]?.id ?? null;
	}

	function saveLayout() {
		downloadBlob(new Blob([serializeLayout(layout)], { type: "application/json" }), `${dataName || "print-merge"}-layout.json`);
	}

	async function loadLayout(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (!file)
			return;
		try {
			layout = parseLayout(await file.text());
			selectedFieldId = layout.fields[0]?.id ?? null;
			layoutMessage = `Loaded ${file.name}`;
			error = "";
		}
		catch (e) {
			error = (e as Error).message;
		}
	}

	function resetLayout() {
		layout = defaultLayout();
		selectedFieldId = layout.fields[0]?.id ?? null;
		layoutMessage = "";
	}

	// --- Asset handlers --------------------------------------------------------
	function clearBackground() {
		if (backgroundPreview?.startsWith("blob:"))
			URL.revokeObjectURL(backgroundPreview);
		background = null;
		backgroundName = "";
		backgroundPreview = null;
	}

	async function handleBackground(files: File[]) {
		const file = files[0];
		if (!file)
			return;
		const kind = file.type === "application/pdf" || /\.pdf$/i.test(file.name)
			? "pdf"
			: file.type === "image/png"
			? "png"
			: file.type === "image/jpeg"
			? "jpeg"
			: null;
		if (!kind) {
			error = "The background must be a PDF, PNG or JPEG";
			return;
		}
		error = "";
		clearBackground();
		const bytes = new Uint8Array(await file.arrayBuffer());
		try {
			backgroundPreview = kind === "pdf" ? (await renderPdfThumbnails(bytes.buffer as ArrayBuffer, 800))[0] ?? null : URL.createObjectURL(file);
			background = { bytes, kind };
			backgroundName = file.name;
		}
		catch (e) {
			error = `Could not read ${file.name}: ${(e as Error).message}`;
		}
	}

	async function handleFont(files: File[]) {
		const file = files[0];
		if (!file)
			return;
		const bytes = new Uint8Array(await file.arrayBuffer());
		try {
			const face = new FontFace(CUSTOM_FONT_FAMILY, bytes);
			await face.load();
			if (customFontFace)
				document.fonts.delete(customFontFace);
			document.fonts.add(face);
			customFontFace = face;
			customFont = bytes;
			customFontName = file.name;
			error = "";
			if (selectedField)
				selectedField.font = "custom";
		}
		catch {
			error = `${file.name} is not a font this browser can load`;
		}
	}

	function clearFont() {
		if (customFontFace)
			document.fonts.delete(customFontFace);
		customFontFace = null;
		customFont = null;
		customFontName = "";
	}

	// --- Preview dragging ------------------------------------------------------
	let svgEl = $state<SVGSVGElement | null>(null);
	let layoutInput = $state<HTMLInputElement | null>(null);
	let drag: { field: TextField; mode: "move" | "resize"; startX: number; startY: number; x: number; y: number; w: number; h: number } | null = null;

	function startDrag(event: PointerEvent, field: TextField, mode: "move" | "resize") {
		event.preventDefault();
		event.stopPropagation();
		selectedFieldId = field.id;
		drag = { field, mode, startX: event.clientX, startY: event.clientY, x: field.x, y: field.y, w: field.w, h: field.h };
		svgEl?.setPointerCapture(event.pointerId);
	}

	function onDrag(event: PointerEvent) {
		if (!drag || !svgEl)
			return;
		// Screen pixels per user unit, correct whether the SVG is width- or height-limited.
		const scale = 1 / (svgEl.getScreenCTM()?.a || 1);
		const dx = (event.clientX - drag.startX) * scale;
		const dy = (event.clientY - drag.startY) * scale;
		const snap = (value: number) => Math.round(value * 2) / 2;
		const { field } = drag;
		if (drag.mode === "move") {
			field.x = snap(Math.min(Math.max(drag.x + dx, -dims.bleed), dims.trim.width + dims.bleed - field.w));
			field.y = snap(Math.min(Math.max(drag.y + dy, -dims.bleed), dims.trim.height + dims.bleed - field.h));
		}
		else {
			field.w = snap(Math.max(5, Math.min(drag.w + dx, dims.trim.width + dims.bleed - field.x)));
			field.h = snap(Math.max(5, Math.min(drag.h + dy, dims.trim.height + dims.bleed - field.y)));
		}
	}

	function endDrag() {
		drag = null;
	}

	// --- Output ----------------------------------------------------------------
	function mergeOptions() {
		return {
			background: background ?? undefined,
			customFont: customFontUsed ? customFont ?? undefined : undefined,
			onProgress: (done: number, total: number) => {
				progress = `Building page ${done} of ${total}...`;
			},
		};
	}

	async function downloadMerged() {
		if (selectedRows.length === 0)
			return;
		processing = true;
		error = "";
		try {
			const bytes = await buildMergedPdf($state.snapshot(selectedRows), $state.snapshot(layout), mergeOptions());
			downloadBlob(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `${dataName || "print-merge"}-merged.pdf`);
		}
		catch (e) {
			error = `Could not build the PDF: ${(e as Error).message}`;
		}
		finally {
			processing = false;
			progress = "";
		}
	}

	async function downloadImposed() {
		if (selectedRows.length === 0)
			return;
		processing = true;
		error = "";
		try {
			const merged = await buildMergedPdf($state.snapshot(selectedRows), $state.snapshot(layout), mergeOptions());
			progress = "Imposing...";
			imposition.columns = sanitizePositiveInt(imposition.columns, 2, 1, 10);
			imposition.rows = sanitizePositiveInt(imposition.rows, 2, 1, 10);
			imposition.margin = sanitizeNonNegative(imposition.margin, 5, 25);
			imposition.gap = sanitizeNonNegative(imposition.gap, 2, 25);
			const options: ImpositionOptions = { ...$state.snapshot(imposition), repeatPages: false };
			const bytes = await imposePdf(merged, options);
			downloadBlob(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `${dataName || "print-merge"}-${options.columns}x${options.rows}-imposed.pdf`);
		}
		catch (e) {
			error = `Could not impose the PDF: ${(e as Error).message}`;
		}
		finally {
			processing = false;
			progress = "";
		}
	}

	function textBlock(preview: (typeof previewFields)[number]) {
		const { field, lines, size } = preview;
		const lineHeight = ptToMm(size * LINE_HEIGHT);
		const blockHeight = lines.length * lineHeight;
		const top = field.valign === "top" ? 0 : field.valign === "middle" ? (field.h - blockHeight) / 2 : field.h - blockHeight;
		const x = field.align === "left" ? 0 : field.align === "center" ? field.w / 2 : field.w;
		return lines.map((line, index) => ({ line, x, y: top + index * lineHeight + ptToMm(size * BASELINE_RATIO) }));
	}
</script>

<svelte:head>
	<title>Print Merge</title>
</svelte:head>

<svelte:window onpointermove={onDrag} onpointerup={endDrag} onpointercancel={endDrag} />

<main class="mx-auto max-w-5xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<Printer class="text-primary size-7" />
		Print Merge
	</h1>
	<p class="text-muted-foreground mb-8">Fill a print layout from spreadsheet rows, one page per row. Nothing leaves your browser.</p>

	{#if error}
		<div class="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border px-4 py-3 text-sm">⚠️ {error}</div>
	{/if}

	<!-- 1. Data -->
	<Card.Root class="mb-6">
		<Card.Header class="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
			<Card.Title>1. Data</Card.Title>
			{#if table}
				<Button variant="outline" size="sm" onclick={clearData}>Clear data</Button>
			{/if}
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if !table}
				<div class="grid gap-4 md:grid-cols-2">
					<FileDropZone accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" label="Drop a CSV or TSV file" onfiles={handleDataFiles} />
					<div class="flex flex-col gap-2">
						<Label for="paste">Or paste cells copied from Sheets or Excel</Label>
						<textarea id="paste" bind:value={pasteText} rows="6" spellcheck="false" placeholder="Name&#9;Seat&#10;Ada Lovelace&#9;12" class="border-input bg-transparent placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 flex-1 rounded-md border px-3 py-2 font-mono text-sm shadow-sm outline-none focus-visible:ring-[3px]"></textarea>
						<Button variant="outline" onclick={handlePaste} disabled={!pasteText.trim()}>Use pasted data</Button>
					</div>
				</div>
			{:else}
				<p class="text-sm">
					<span class="font-semibold">{dataName}</span>
					<span class="text-muted-foreground">· {table.rows.length} row{table.rows.length === 1 ? "" : "s"} × {table.headers.length} column{table.headers.length === 1 ? "" : "s"}</span>
				</p>
				<div class="max-h-64 overflow-auto rounded-md border">
					<table class="w-full text-sm">
						<thead class="bg-muted sticky top-0 text-left">
							<tr>
								<th class="text-muted-foreground px-2 py-1.5 font-mono text-xs font-normal">#</th>
								{#each table.headers as header (header)}
									<th class="px-2 py-1.5 font-semibold whitespace-nowrap">{header}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each table.rows.slice(0, MAX_TABLE_ROWS) as row, index (index)}
								<tr class="border-t">
									<td class="text-muted-foreground px-2 py-1 font-mono text-xs">{index + 1}</td>
									{#each table.headers as header (header)}
										<td class="max-w-64 truncate px-2 py-1" title={row[header]}>{row[header]}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
					{#if table.rows.length > MAX_TABLE_ROWS}
						<p class="text-muted-foreground bg-muted/50 px-2 py-1.5 text-xs">Showing the first {MAX_TABLE_ROWS} rows.</p>
					{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<div class="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
		<!-- 2. Page -->
		<Card.Root>
			<Card.Header>
				<Card.Title>2. Page</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-2 gap-3">
					<div class="col-span-2 grid gap-1.5">
						<Label for="page-size">Size</Label>
						<Select id="page-size" value={layout.page.size} onchange={event => choosePageSize((event.currentTarget as HTMLSelectElement).value as PageSizeId)}>
							{#each Object.entries(PAGE_SIZES) as [id, size] (id)}
								<option value={id}>{size.label}</option>
							{/each}
							<option value="custom">Custom size</option>
						</Select>
					</div>
					{#if layout.page.size === "custom"}
						<div class="grid gap-1.5">
							<Label for="page-width">Width (mm)</Label>
							<Input id="page-width" type="number" min={10} max={2000} step={0.5} bind:value={layout.page.width} />
						</div>
						<div class="grid gap-1.5">
							<Label for="page-height">Height (mm)</Label>
							<Input id="page-height" type="number" min={10} max={2000} step={0.5} bind:value={layout.page.height} />
						</div>
					{/if}
					<div class="grid gap-1.5">
						<Label for="orientation">Orientation</Label>
						<Select id="orientation" bind:value={layout.page.orientation}>
							<option value="portrait">Portrait</option>
							<option value="landscape">Landscape</option>
						</Select>
					</div>
					<div class="grid gap-1.5">
						<Label for="bleed">Bleed (mm)</Label>
						<Input id="bleed" type="number" min={0} max={20} step={0.5} bind:value={layout.page.bleed} />
					</div>
				</div>
				<p class="text-muted-foreground text-sm">
					Trim {dims.trim.width} × {dims.trim.height} mm{#if dims.bleed > 0}, page {dims.media.width} × {dims.media.height} mm with bleed. The PDF's TrimBox marks the finished size.{/if}
				</p>

				<div class="space-y-2 border-t pt-4">
					<Label>Background (optional)</Label>
					{#if background}
						<div class="bg-muted/40 flex items-center gap-3 rounded-lg border p-3 text-sm">
							<FileText class="text-primary size-5 shrink-0" />
							<span class="min-w-0 flex-1 truncate">{backgroundName}</span>
							<Button variant="ghost" size="icon" class="size-7" onclick={clearBackground} aria-label="Remove background"><X class="size-4" /></Button>
						</div>
						{#if background.kind === "pdf"}
							<p class="text-muted-foreground text-xs">Embedded as vector artwork; the first page is used and stretched to the page size including bleed.</p>
						{/if}
					{:else}
						<FileDropZone accept=".pdf,image/png,image/jpeg" label="Drop a single-page PDF, PNG or JPEG" class="p-4" onfiles={handleBackground} />
					{/if}
				</div>
			</Card.Content>
		</Card.Root>

		<!-- 3. Rows -->
		<Card.Root>
			<Card.Header>
				<Card.Title>3. Rows</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-1.5">
						<Label for="filter-column">Filter column</Label>
						<Select id="filter-column" bind:value={layout.selection.filter.column} disabled={!table}>
							<option value="">Any row</option>
							{#each table?.headers ?? [] as header (header)}
								<option value={header}>{header}</option>
							{/each}
						</Select>
					</div>
					<div class="grid gap-1.5">
						<Label for="filter-op">Condition</Label>
						<Select id="filter-op" bind:value={layout.selection.filter.op} disabled={!layout.selection.filter.column}>
							<option value="none">No filter</option>
							<option value="equals">Equals</option>
							<option value="contains">Contains</option>
							<option value="notEmpty">Is not empty</option>
						</Select>
					</div>
					{#if layout.selection.filter.op === "equals" || layout.selection.filter.op === "contains"}
						<div class="col-span-2 grid gap-1.5">
							<Label for="filter-value">Value</Label>
							<Input id="filter-value" bind:value={layout.selection.filter.value} />
						</div>
					{/if}
					<div class="grid gap-1.5">
						<Label for="sort-column">Sort by</Label>
						<Select id="sort-column" value={layout.selection.sort?.column ?? ""} disabled={!table} onchange={(event) => {
							const column = (event.currentTarget as HTMLSelectElement).value;
							layout.selection.sort = column ? { column, direction: layout.selection.sort?.direction ?? "asc" } : null;
						}}>
							<option value="">Sheet order</option>
							{#each table?.headers ?? [] as header (header)}
								<option value={header}>{header}</option>
							{/each}
						</Select>
					</div>
					<div class="grid gap-1.5">
						<Label for="sort-direction">Direction</Label>
						<Select id="sort-direction" value={layout.selection.sort?.direction ?? "asc"} disabled={!layout.selection.sort} onchange={(event) => {
							if (layout.selection.sort)
								layout.selection.sort.direction = (event.currentTarget as HTMLSelectElement).value as "asc" | "desc";
						}}>
							<option value="asc">Ascending</option>
							<option value="desc">Descending</option>
						</Select>
					</div>
				</div>
				<Label class="font-normal"><Checkbox bind:checked={layout.selection.skipBlank} /> Skip rows where every used column is blank</Label>

				{#if table}
					<p class="text-sm">
						<span class="font-semibold">{selectedRows.length}</span> of {table.rows.length} rows will print.
					</p>
				{/if}
				{#if missingColumns.length > 0}
					<p class="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
						<TriangleAlert class="mt-0.5 size-4 shrink-0" />
						<span>No column named {missingColumns.map(column => `"${column}"`).join(", ")}; those placeholders print blank.</span>
					</p>
				{/if}
				{#if overflowRows.length > 0}
					<div class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
						<p class="mb-1 font-medium">{overflowRows.length} row{overflowRows.length === 1 ? "" : "s"} still overflow at the minimum size:</p>
						<ul class="max-h-28 space-y-0.5 overflow-auto">
							{#each overflowRows as item (item.position)}
								<li>
									<button type="button" class="hover:underline" onclick={() => (position = item.position)}>
										Row {item.row.index + 1}: {item.templates.join(", ")}
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- 4. Fields and preview -->
	<Card.Root class="mb-6">
		<Card.Header class="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
			<Card.Title>4. Fields</Card.Title>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" size="sm" onclick={addField}><Plus class="size-4" /> Add field</Button>
				<Button variant="outline" size="sm" onclick={saveLayout}><Download class="size-4" /> Save layout</Button>
				<Button variant="outline" size="sm" onclick={() => layoutInput?.click()}><Upload class="size-4" /> Load layout</Button>
				<input bind:this={layoutInput} type="file" accept=".json,application/json" onchange={loadLayout} hidden />
				<Button variant="ghost" size="sm" onclick={resetLayout}>Reset</Button>
			</div>
		</Card.Header>
		<Card.Content>
			{#if layoutMessage}
				<p class="text-muted-foreground mb-3 text-sm">{layoutMessage}</p>
			{/if}
			<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
				<div>
					<div class="mb-2 flex items-center justify-between gap-2 text-sm">
						<span class="text-muted-foreground">Drag a box to move it, or its corner to resize. Dotted line is the trim edge.</span>
						{#if selectedRows.length > 0}
							<div class="flex shrink-0 items-center gap-1">
								<Button variant="outline" size="icon" class="size-7" onclick={() => (position = Math.max(0, previewIndex - 1))} disabled={previewIndex === 0} aria-label="Previous row"><ChevronLeft class="size-4" /></Button>
								<span class="tabular-nums">{previewIndex + 1} / {selectedRows.length}</span>
								<Button variant="outline" size="icon" class="size-7" onclick={() => (position = Math.min(selectedRows.length - 1, previewIndex + 1))} disabled={previewIndex >= selectedRows.length - 1} aria-label="Next row"><ChevronRight class="size-4" /></Button>
							</div>
						{/if}
					</div>
					<div class="bg-muted/40 flex justify-center rounded-lg border p-4">
						<svg
							bind:this={svgEl}
							viewBox="0 0 {dims.media.width} {dims.media.height}"
							class="max-h-[70vh] w-full touch-none bg-white shadow-md select-none"
							style="aspect-ratio: {dims.media.width} / {dims.media.height};"
							role="img"
							aria-label="Page preview"
							onpointerdown={() => (selectedFieldId = null)}
						>
							{#if backgroundPreview}
								<image href={backgroundPreview} x="0" y="0" width={dims.media.width} height={dims.media.height} preserveAspectRatio="none" />
							{/if}
							{#if dims.bleed > 0}
								<rect x={dims.bleed} y={dims.bleed} width={dims.trim.width} height={dims.trim.height} fill="none" stroke="#dc2626" stroke-width="0.25" stroke-dasharray="1.5 1" />
							{/if}
							{#each previewFields as preview (preview.field.id)}
								{@const field = preview.field}
								{@const selected = field.id === selectedFieldId}
								<g transform="translate({dims.bleed + field.x} {dims.bleed + field.y})" class="cursor-move" role="button" tabindex="-1" aria-label="Field {field.template}" onpointerdown={event => startDrag(event, field, "move")}>
									<rect width={field.w} height={field.h} fill={selected ? "rgba(37, 99, 235, 0.08)" : "rgba(0, 0, 0, 0.001)"} stroke={preview.overflow ? "#dc2626" : selected ? "#2563eb" : "#94a3b8"} stroke-width={selected ? 0.4 : 0.2} stroke-dasharray={selected ? "" : "1 1"} />
									{#each textBlock(preview) as { line, x, y }, index (index)}
										<text {x} {y} font-family={PREVIEW_FONTS[field.font]} font-size={ptToMm(preview.size)} font-weight={field.bold && field.font !== "custom" ? 700 : 400} fill={field.color} text-anchor={TEXT_ANCHORS[field.align]} style="white-space: pre;">{line}</text>
									{/each}
									{#if selected}
										<rect x={field.w - 3} y={field.h - 3} width="3" height="3" fill="#2563eb" class="cursor-nwse-resize" role="button" tabindex="-1" aria-label="Resize field" onpointerdown={event => startDrag(event, field, "resize")} />
									{/if}
								</g>
							{/each}
						</svg>
					</div>
				</div>

				<div class="space-y-4">
					<div class="flex flex-wrap gap-2">
						{#each layout.fields as field (field.id)}
							<button type="button" class={cn("max-w-full truncate rounded-md border px-2.5 py-1 text-sm", field.id === selectedFieldId ? "border-primary bg-primary/10" : "hover:bg-accent")} onclick={() => (selectedFieldId = field.id)}>
								{field.template || "(empty)"}
							</button>
						{/each}
					</div>

					{#if selectedField}
						<div class="grid gap-1.5">
							<Label for="template">Text</Label>
							<Input id="template" bind:value={selectedField.template} placeholder={"{First Name} {Last Name}"} />
							<p class="text-muted-foreground text-xs">
								Columns: {#each table?.headers ?? ["Name"] as header (header)}<button type="button" class="text-primary mr-1 hover:underline" onclick={() => {
									if (selectedField)
										selectedField.template += `{${header}}`;
								}}>{"{"}{header}}</button>{/each}
								<button type="button" class="text-primary hover:underline" onclick={() => {
									if (selectedField)
										selectedField.template += "{Row}";
								}}>{"{Row}"}</button>
							</p>
						</div>

						<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
							<div class="grid gap-1.5"><Label for="field-x">X (mm)</Label><Input id="field-x" type="number" step={0.5} bind:value={selectedField.x} /></div>
							<div class="grid gap-1.5"><Label for="field-y">Y (mm)</Label><Input id="field-y" type="number" step={0.5} bind:value={selectedField.y} /></div>
							<div class="grid gap-1.5"><Label for="field-w">Width</Label><Input id="field-w" type="number" min={1} step={0.5} bind:value={selectedField.w} /></div>
							<div class="grid gap-1.5"><Label for="field-h">Height</Label><Input id="field-h" type="number" min={1} step={0.5} bind:value={selectedField.h} /></div>
						</div>

						<div class="grid grid-cols-2 gap-3">
							<div class="grid gap-1.5">
								<Label for="font">Font</Label>
								<Select id="font" bind:value={selectedField.font}>
									<option value="helvetica">Helvetica</option>
									<option value="times">Times</option>
									<option value="courier">Courier</option>
									<option value="custom" disabled={!customFont}>{customFontName || "Uploaded font"}</option>
								</Select>
							</div>
							<div class="grid gap-1.5">
								<Label for="color">Colour</Label>
								<input id="color" type="color" bind:value={selectedField.color} class="border-input h-9 w-full cursor-pointer rounded-md border bg-transparent p-1" />
							</div>
							<div class="grid gap-1.5">
								<Label for="size">Size (pt)</Label>
								<Input id="size" type="number" min={1} max={400} step={0.5} bind:value={selectedField.size} />
							</div>
							<div class="grid gap-1.5">
								<Label for="min-size">Minimum (pt)</Label>
								<Input id="min-size" type="number" min={1} max={400} step={0.5} bind:value={selectedField.minSize} />
							</div>
							<div class="grid gap-1.5">
								<Label for="overflow">If it doesn't fit</Label>
								<Select id="overflow" bind:value={selectedField.overflow}>
									<option value="shrink">Shrink to fit</option>
									<option value="wrap">Wrap, then shrink</option>
								</Select>
							</div>
							<div class="grid gap-1.5">
								<Label for="case">Text case</Label>
								<Select id="case" bind:value={selectedField.textCase}>
									<option value="none">As typed</option>
									<option value="upper">UPPER CASE</option>
									<option value="title">Title Case</option>
								</Select>
							</div>
						</div>

						<div class="flex flex-wrap items-center gap-4">
							<Label class="font-normal" title={selectedField.font === "custom" ? "Uploaded fonts are used as they are; upload a bold face for bold text" : undefined}><Checkbox bind:checked={selectedField.bold} disabled={selectedField.font === "custom"} /> Bold</Label>
							<div class="bg-muted inline-flex gap-1 rounded-lg p-1">
								{#each [["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const as [align, Icon] (align)}
									<Button variant={selectedField.align === align ? "default" : "ghost"} size="icon" class="size-7" aria-label="Align {align}" onclick={() => {
										if (selectedField)
											selectedField.align = align;
									}}><Icon class="size-4" /></Button>
								{/each}
							</div>
							<div class="bg-muted inline-flex gap-1 rounded-lg p-1">
								{#each ["top", "middle", "bottom"] as const as valign (valign)}
									<Button variant={selectedField.valign === valign ? "default" : "ghost"} size="sm" class="h-7 px-2 capitalize" onclick={() => {
										if (selectedField)
											selectedField.valign = valign;
									}}>{valign}</Button>
								{/each}
							</div>
							<Button variant="ghost" size="sm" class="hover:bg-destructive/10 hover:text-destructive ml-auto" onclick={() => {
								if (selectedField)
									removeField(selectedField.id);
							}} disabled={layout.fields.length <= 1}><Trash2 class="size-4" /> Remove</Button>
						</div>

						<div class="space-y-2 border-t pt-3">
							<Label>Custom font (TTF or OTF)</Label>
							{#if customFont}
								<div class="bg-muted/40 flex items-center gap-3 rounded-lg border p-2 text-sm">
									<span class="min-w-0 flex-1 truncate">{customFontName}</span>
									<Button variant="ghost" size="icon" class="size-7" onclick={clearFont} aria-label="Remove font"><X class="size-4" /></Button>
								</div>
							{:else}
								<FileDropZone accept=".ttf,.otf,font/ttf,font/otf" label="Drop a font file" class="p-3" onfiles={handleFont} />
							{/if}
							<p class="text-muted-foreground text-xs">The built-in fonts cover Latin-1 characters only; upload a font for anything else.</p>
						</div>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- 5. Output -->
	<Card.Root>
		<Card.Header>
			<Card.Title>5. Output</Card.Title>
		</Card.Header>
		<Card.Content class="divide-border divide-y">
			<div class="flex flex-wrap items-center justify-between gap-3 pb-4">
				<div>
					<h3 class="font-semibold">Merged PDF</h3>
					<p class="text-muted-foreground text-sm">One {dims.trim.width} × {dims.trim.height} mm page per row.</p>
				</div>
				<Button onclick={downloadMerged} disabled={processing || selectedRows.length === 0}>
					{#if processing}<LoaderCircle class="size-4 animate-spin" />{:else}<Download class="size-4" />{/if}
					Download {selectedRows.length} page{selectedRows.length === 1 ? "" : "s"}
				</Button>
			</div>

			<div class="pt-4">
				<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
					<div>
						<h3 class="flex items-center gap-2 font-semibold"><LayoutGrid class="size-4" /> Impose onto sheets</h3>
						<p class="text-muted-foreground text-sm">Lay the merged pages out N-up for printing, using the PDF Imposition Tool.</p>
					</div>
					<Button variant="outline" onclick={downloadImposed} disabled={processing || selectedRows.length === 0}>
						{#if processing}<LoaderCircle class="size-4 animate-spin" />{:else}<Download class="size-4" />{/if}
						Download imposed PDF
					</Button>
				</div>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
					<div class="grid gap-1.5"><Label for="imp-columns">Columns</Label><Input id="imp-columns" type="number" min={1} max={10} bind:value={imposition.columns} /></div>
					<div class="grid gap-1.5"><Label for="imp-rows">Rows</Label><Input id="imp-rows" type="number" min={1} max={10} bind:value={imposition.rows} /></div>
					<div class="grid gap-1.5">
						<Label for="imp-sheet">Sheet</Label>
						<Select id="imp-sheet" bind:value={imposition.outputSize}>
							<option value="a4">A4</option>
							<option value="a3">A3</option>
							<option value="letter">Letter</option>
							<option value="legal">Legal</option>
							<option value="tabloid">Tabloid</option>
							<option value="same">Scale from page</option>
						</Select>
					</div>
					<div class="grid gap-1.5">
						<Label for="imp-order">Order</Label>
						<Select id="imp-order" bind:value={imposition.pageOrder}>
							<option value="row">Across, then down</option>
							<option value="column">Down, then across</option>
						</Select>
					</div>
					<div class="grid gap-1.5"><Label for="imp-margin">Margin (mm)</Label><Input id="imp-margin" type="number" min={0} max={25} step={0.5} bind:value={imposition.margin} /></div>
					<div class="grid gap-1.5"><Label for="imp-gap">Gap (mm)</Label><Input id="imp-gap" type="number" min={0} max={25} step={0.5} bind:value={imposition.gap} /></div>
				</div>
				<div class="mt-3 flex flex-wrap gap-4">
					<Label class="font-normal"><Checkbox bind:checked={imposition.autoRotate} /> Auto-rotate to fit</Label>
					<Label class="font-normal"><Checkbox bind:checked={imposition.resizeToFit} /> Scale pages to fill cells</Label>
					<Label class="font-normal"><Checkbox bind:checked={imposition.showCropMarks} /> Crop marks</Label>
					<Label class="font-normal"><Checkbox bind:checked={imposition.showBorders} /> Borders</Label>
				</div>
				{#if dims.bleed > 0 && imposition.showCropMarks}
					<p class="mt-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
						<TriangleAlert class="mt-0.5 size-4 shrink-0" />
						<span>Imposition places pages by their full size, so with {dims.bleed} mm of bleed the crop marks sit at the bleed edge rather than the trim edge.</span>
					</p>
				{/if}
			</div>

			{#if progress}
				<p class="text-muted-foreground pt-4 text-sm">{progress}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<footer class="text-muted-foreground mt-6 text-center text-sm">
		<p>✨ No server upload • Runs entirely in your browser • The layout is remembered on this device</p>
	</footer>
</main>
