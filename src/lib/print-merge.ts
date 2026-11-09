import type { PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const MM_TO_PT = 72 / 25.4;
export const LINE_HEIGHT = 1.2;
/** Baseline offset from the top of a line, as a fraction of the font size. */
export const BASELINE_RATIO = 0.8;
const SIZE_STEP = 0.5;
export const MAX_FONT_SIZE = 1000;

export function mmToPt(mm: number) {
	return mm * MM_TO_PT;
}

export function ptToMm(pt: number) {
	return pt / MM_TO_PT;
}

// --- Data ---------------------------------------------------------------------

export type Delimiter = "," | "\t" | ";";

export interface DataTable {
	headers: string[];
	rows: Record<string, string>[];
}

const BOM_RE = /^\uFEFF/;

/** Pick the delimiter from the first record, ignoring punctuation inside quoted fields. */
export function detectDelimiter(text: string): Delimiter {
	const input = text.replace(BOM_RE, "");
	const counts = { "\t": 0, ",": 0, ";": 0 };
	let quoted = false;
	for (let i = 0; i < input.length; i += 1) {
		const char = input[i];
		if (char === "\"") {
			if (quoted && input[i + 1] === "\"")
				i += 1;
			else
				quoted = !quoted;
		}
		else if (!quoted && (char === "\n" || char === "\r")) {
			break;
		}
		else if (!quoted && char in counts) {
			counts[char as Delimiter] += 1;
		}
	}
	if (counts["\t"] > 0)
		return "\t";
	return counts[";"] > counts[","] ? ";" : ",";
}

function uniqueHeaders(raw: string[]) {
	const taken = new Set<string>();
	return raw.map((name, index) => {
		const base = name.trim() || `Column ${index + 1}`;
		let candidate = base;
		for (let n = 2; taken.has(candidate); n += 1)
			candidate = `${base} (${n})`;
		taken.add(candidate);
		return candidate;
	});
}

/** Parse CSV or TSV (RFC 4180 quoting, BOM, CRLF or LF) with the first row as headers. */
export function parseDelimited(text: string, delimiter: Delimiter = detectDelimiter(text)): DataTable {
	const input = text.replace(BOM_RE, "");
	const records: string[][] = [];
	let record: string[] = [];
	let field = "";
	let quoted = false;

	for (let i = 0; i < input.length; i += 1) {
		const char = input[i];
		if (quoted) {
			if (char === "\r") {
				if (input[i + 1] !== "\n")
					field += "\n";
			}
			else if (char !== "\"") {
				field += char;
			}
			else if (input[i + 1] === "\"") {
				field += "\"";
				i += 1;
			}
			else {
				quoted = false;
			}
			continue;
		}
		if (char === "\"" && field === "") {
			quoted = true;
		}
		else if (char === delimiter) {
			record.push(field);
			field = "";
		}
		else if (char === "\n" || char === "\r") {
			if (char === "\r" && input[i + 1] === "\n")
				i += 1;
			record.push(field);
			records.push(record);
			record = [];
			field = "";
		}
		else {
			field += char;
		}
	}
	if (field !== "" || record.length > 0) {
		record.push(field);
		records.push(record);
	}

	const headers = uniqueHeaders(records.shift() ?? []);
	const rows = records
		.filter(values => values.some(value => value.trim() !== ""))
		.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])));
	return { headers, rows };
}

// --- Templates ----------------------------------------------------------------

export const ROW_NUMBER_COLUMN = "Row";
const PLACEHOLDER_RE = /\{([^{}]+)\}/g;

/** A row's value for a column, ignoring inherited names such as `constructor`. */
export function cell(row: Record<string, string>, column: string) {
	return Object.hasOwn(row, column) ? row[column] : "";
}

/** Column names referenced by a template, in order of first use. */
export function templateColumns(template: string) {
	const names: string[] = [];
	for (const match of template.matchAll(PLACEHOLDER_RE)) {
		const name = match[1].trim();
		if (name && !names.includes(name))
			names.push(name);
	}
	return names;
}

export function interpolate(template: string, row: Record<string, string>, rowNumber: number) {
	const missing: string[] = [];
	const text = template.replace(PLACEHOLDER_RE, (_, rawName: string) => {
		const name = rawName.trim();
		if (Object.hasOwn(row, name))
			return row[name];
		if (name === ROW_NUMBER_COLUMN)
			return String(rowNumber);
		if (!missing.includes(name))
			missing.push(name);
		return "";
	});
	return { text, missing };
}

// --- Rows ---------------------------------------------------------------------

export type FilterOp = "none" | "equals" | "contains" | "notEmpty";

export interface RowFilter {
	column: string;
	op: FilterOp;
	value: string;
}

export interface RowSort {
	column: string;
	direction: "asc" | "desc";
}

export interface RowSelection {
	filter: RowFilter;
	sort: RowSort | null;
	/** Skip rows where every column referenced by a field is blank. */
	skipBlank: boolean;
}

export interface SelectedRow {
	/** 0-based index into the source table. */
	index: number;
	data: Record<string, string>;
}

function matchesFilter(row: Record<string, string>, filter: RowFilter) {
	if (filter.op === "none" || !filter.column)
		return true;
	const value = cell(row, filter.column).trim();
	const wanted = filter.value.trim();
	switch (filter.op) {
		case "equals":
			return value.localeCompare(wanted, undefined, { sensitivity: "accent" }) === 0;
		case "contains":
			return value.toLowerCase().includes(wanted.toLowerCase());
		case "notEmpty":
			return value !== "";
	}
}

export function selectRows(rows: Record<string, string>[], selection: RowSelection, referencedColumns: string[]): SelectedRow[] {
	const dataColumns = referencedColumns.filter(column => column !== ROW_NUMBER_COLUMN);
	const selected = rows
		.map((data, index) => ({ index, data }))
		.filter(({ data }) => matchesFilter(data, selection.filter))
		.filter(({ data }) => !selection.skipBlank || dataColumns.length === 0 || dataColumns.some(column => cell(data, column).trim() !== ""));

	const { sort } = selection;
	if (sort && sort.column) {
		const direction = sort.direction === "desc" ? -1 : 1;
		selected.sort((a, b) => direction * cell(a.data, sort.column).localeCompare(cell(b.data, sort.column), undefined, { numeric: true, sensitivity: "base" }));
	}
	return selected;
}

// --- Layout -------------------------------------------------------------------

export const LAYOUT_VERSION = 1;

export type PageSizeId = "a3" | "a4" | "a5" | "a6" | "dl" | "cr80" | "business-card" | "custom";
export type Orientation = "portrait" | "landscape";

/** Preset sizes in mm, listed as commonly quoted; orientation picks which side is the width. */
export const PAGE_SIZES: Record<Exclude<PageSizeId, "custom">, { label: string; width: number; height: number }> = {
	"a3": { label: "A3 (297 × 420 mm)", width: 297, height: 420 },
	"a4": { label: "A4 (210 × 297 mm)", width: 210, height: 297 },
	"a5": { label: "A5 (148 × 210 mm)", width: 148, height: 210 },
	"a6": { label: "A6 (105 × 148 mm)", width: 105, height: 148 },
	"dl": { label: "DL (99 × 210 mm)", width: 99, height: 210 },
	"cr80": { label: "CR80 badge (85.6 × 54 mm)", width: 85.6, height: 54 },
	"business-card": { label: "Business card (90 × 55 mm)", width: 90, height: 55 },
};

export interface PageSetup {
	size: PageSizeId;
	/** Custom size in mm; ignored for presets. */
	width: number;
	height: number;
	orientation: Orientation;
	/** Bleed in mm added on every side. */
	bleed: number;
}

export type FontFamily = "helvetica" | "times" | "courier" | "custom";
export type TextCase = "none" | "upper" | "title";

export interface TextField {
	id: string;
	template: string;
	/** Position and size in mm from the top-left of the trim box. */
	x: number;
	y: number;
	w: number;
	h: number;
	font: FontFamily;
	bold: boolean;
	/** Font size in pt. */
	size: number;
	minSize: number;
	/** Hex colour, e.g. #000000. */
	color: string;
	align: "left" | "center" | "right";
	valign: "top" | "middle" | "bottom";
	overflow: "shrink" | "wrap";
	textCase: TextCase;
}

export interface Layout {
	version: number;
	page: PageSetup;
	fields: TextField[];
	selection: RowSelection;
}

export function naturalOrientation(size: PageSizeId, width: number, height: number): Orientation {
	const base = size === "custom" ? { width, height } : PAGE_SIZES[size];
	return base.width > base.height ? "landscape" : "portrait";
}

/** Trim and media (trim plus bleed) sizes in mm with orientation applied. */
export function pageDimensions(page: PageSetup) {
	const base = page.size === "custom" ? { width: page.width, height: page.height } : PAGE_SIZES[page.size];
	const short = Math.max(1, Math.min(base.width, base.height));
	const long = Math.max(1, Math.max(base.width, base.height));
	const trim = page.orientation === "portrait" ? { width: short, height: long } : { width: long, height: short };
	const bleed = Math.max(0, page.bleed);
	return {
		trim,
		media: { width: trim.width + bleed * 2, height: trim.height + bleed * 2 },
		bleed,
	};
}

export function defaultField(id: string, page: PageSetup, template = "{Name}"): TextField {
	const { trim } = pageDimensions(page);
	const w = Math.round(trim.width * 0.8);
	const h = Math.round(trim.height * 0.2);
	return {
		id,
		template,
		x: Math.round((trim.width - w) / 2),
		y: Math.round((trim.height - h) / 2),
		w,
		h,
		font: "helvetica",
		bold: true,
		size: 36,
		minSize: 8,
		color: "#000000",
		align: "center",
		valign: "middle",
		overflow: "shrink",
		textCase: "none",
	};
}

export function defaultLayout(): Layout {
	const page: PageSetup = { size: "a6", width: 100, height: 150, orientation: "portrait", bleed: 0 };
	return {
		version: LAYOUT_VERSION,
		page,
		fields: [defaultField("field-1", page)],
		selection: { filter: { column: "", op: "none", value: "" }, sort: null, skipBlank: true },
	};
}

export function serializeLayout(layout: Layout) {
	return `${JSON.stringify({ ...layout, version: LAYOUT_VERSION }, null, "\t")}\n`;
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.includes(value as T) ? value as T : fallback;
}

function num(value: unknown, fallback: number) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string) {
	return typeof value === "string" ? value : fallback;
}

/** Parse a saved layout, filling defaults for anything missing; throws on junk. */
export function parseLayout(json: string): Layout {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	}
	catch {
		throw new Error("That file is not valid JSON");
	}
	if (!raw || typeof raw !== "object" || !("fields" in raw) || !Array.isArray((raw as { fields: unknown }).fields))
		throw new Error("That file is not a Print Merge layout");
	const input = raw as Partial<Layout> & { fields: unknown[]; page?: Partial<PageSetup>; selection?: Partial<RowSelection> };
	if (num(input.version, LAYOUT_VERSION) > LAYOUT_VERSION)
		throw new Error("That layout was saved by a newer version of this tool");

	const base = defaultLayout();
	const page: PageSetup = {
		size: pick(input.page?.size, [...Object.keys(PAGE_SIZES), "custom"] as PageSizeId[], base.page.size),
		width: num(input.page?.width, base.page.width),
		height: num(input.page?.height, base.page.height),
		orientation: pick(input.page?.orientation, ["portrait", "landscape"] as const, base.page.orientation),
		bleed: Math.max(0, num(input.page?.bleed, 0)),
	};
	const fields = input.fields.map((entry, index) => {
		const field = (entry ?? {}) as Partial<TextField>;
		const fallback = defaultField(str(field.id, `field-${index + 1}`), page);
		return {
			id: str(field.id, fallback.id),
			template: str(field.template, fallback.template),
			x: num(field.x, fallback.x),
			y: num(field.y, fallback.y),
			w: Math.max(1, num(field.w, fallback.w)),
			h: Math.max(1, num(field.h, fallback.h)),
			font: pick(field.font, ["helvetica", "times", "courier", "custom"] as const, fallback.font),
			bold: typeof field.bold === "boolean" ? field.bold : fallback.bold,
			size: Math.min(MAX_FONT_SIZE, Math.max(1, num(field.size, fallback.size))),
			minSize: Math.min(MAX_FONT_SIZE, Math.max(1, num(field.minSize, fallback.minSize))),
			color: /^#[0-9a-f]{6}$/i.test(str(field.color, "")) ? str(field.color, "") : fallback.color,
			align: pick(field.align, ["left", "center", "right"] as const, fallback.align),
			valign: pick(field.valign, ["top", "middle", "bottom"] as const, fallback.valign),
			overflow: pick(field.overflow, ["shrink", "wrap"] as const, fallback.overflow),
			textCase: pick(field.textCase, ["none", "upper", "title"] as const, fallback.textCase),
		} satisfies TextField;
	});
	const selection: RowSelection = {
		filter: {
			column: str(input.selection?.filter?.column, ""),
			op: pick(input.selection?.filter?.op, ["none", "equals", "contains", "notEmpty"] as const, "none"),
			value: str(input.selection?.filter?.value, ""),
		},
		sort: input.selection?.sort && typeof input.selection.sort === "object"
			? { column: str(input.selection.sort.column, ""), direction: pick(input.selection.sort.direction, ["asc", "desc"] as const, "asc") }
			: null,
		skipBlank: typeof input.selection?.skipBlank === "boolean" ? input.selection.skipBlank : true,
	};
	return { version: LAYOUT_VERSION, page, fields, selection };
}

export function layoutColumns(layout: Layout) {
	const columns: string[] = [];
	for (const field of layout.fields) {
		for (const column of templateColumns(field.template)) {
			if (!columns.includes(column))
				columns.push(column);
		}
	}
	return columns;
}

// --- Text ---------------------------------------------------------------------

/** Width in pt of `text` set at `size` pt. */
export type MeasureWidth = (text: string, size: number) => number;

export interface FitResult {
	lines: string[];
	size: number;
	/** True when the text still does not fit at the minimum size. */
	overflow: boolean;
}

const WORD_START_RE = /(^|[\s\-–—(["'])(\p{L})/gu;

export function applyTextCase(text: string, textCase: TextCase) {
	if (textCase === "upper")
		return text.toUpperCase();
	if (textCase === "title")
		return text.toLowerCase().replace(WORD_START_RE, (_, before: string, letter: string) => before + letter.toUpperCase());
	return text;
}

/** Greedy word wrap; a single word wider than the box stays on its own line. */
export function wrapText(text: string, width: number, size: number, measure: MeasureWidth) {
	const lines: string[] = [];
	for (const paragraph of text.split("\n")) {
		const words = paragraph.split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			lines.push("");
			continue;
		}
		let line = words[0];
		for (const word of words.slice(1)) {
			const candidate = `${line} ${word}`;
			if (measure(candidate, size) <= width) {
				line = candidate;
			}
			else {
				lines.push(line);
				line = word;
			}
		}
		lines.push(line);
	}
	return lines;
}

function fits(lines: string[], size: number, width: number, height: number, measure: MeasureWidth) {
	return lines.length * size * LINE_HEIGHT <= height + 1e-6 && lines.every(line => measure(line, size) <= width + 1e-6);
}

/** Lay `text` out in a box (pt), shrinking from `size` towards `minSize` until it fits. */
export function fitText(
	text: string,
	box: { width: number; height: number },
	options: { size: number; minSize: number; overflow: "shrink" | "wrap" },
	measure: MeasureWidth,
): FitResult {
	const startSize = Math.min(MAX_FONT_SIZE, Math.max(1, options.size));
	const minSize = Math.min(startSize, Math.max(1, options.minSize));
	const layout = (size: number) => options.overflow === "wrap" ? wrapText(text, box.width, size, measure) : text.split("\n");
	for (let size = startSize; size >= minSize; size -= SIZE_STEP) {
		const lines = layout(size);
		if (fits(lines, size, box.width, box.height, measure))
			return { lines, size, overflow: false };
	}
	// The minimum may sit between steps, so test it on its own before flagging.
	const lines = layout(minSize);
	return { lines, size: minSize, overflow: !fits(lines, minSize, box.width, box.height, measure) };
}

// --- Fonts --------------------------------------------------------------------

// WinAnsi covers Latin-1 plus a handful of typographic characters; the standard
// fonts can draw nothing else, so swap anything outside it for "?".
const WIN_ANSI_RE = /[^\u0020-\u007E\u00A0-\u00FF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178\n]/gu;

export function sanitizeForStandardFont(text: string) {
	return text.normalize("NFC").replace(WIN_ANSI_RE, "?");
}

export function fontKey(font: FontFamily, bold: boolean) {
	return font === "custom" ? "custom" : `${font}${bold ? "-bold" : ""}`;
}

const STANDARD_FONTS: Record<string, StandardFonts> = {
	"helvetica": StandardFonts.Helvetica,
	"helvetica-bold": StandardFonts.HelveticaBold,
	"times": StandardFonts.TimesRoman,
	"times-bold": StandardFonts.TimesRomanBold,
	"courier": StandardFonts.Courier,
	"courier-bold": StandardFonts.CourierBold,
};

/** Embed every font the layout uses; a custom font falls back to Helvetica when none is supplied. */
export async function embedLayoutFonts(doc: PDFDocument, fields: TextField[], customFont?: Uint8Array) {
	const fonts = new Map<string, PDFFont>();
	for (const field of fields) {
		let key = fontKey(field.font, field.bold);
		if (key === "custom" && !customFont)
			key = fontKey("helvetica", field.bold);
		if (fonts.has(key))
			continue;
		if (key === "custom") {
			doc.registerFontkit(fontkit);
			fonts.set(key, await doc.embedFont(customFont!, { subset: true }));
		}
		else {
			fonts.set(key, await doc.embedFont(STANDARD_FONTS[key]));
		}
	}
	return fonts;
}

/** The embedded font for a field, or undefined while that face has not been embedded yet. */
export function fontFor(fonts: Map<string, PDFFont>, field: TextField) {
	return fonts.get(fontKey(field.font, field.bold)) ?? fonts.get(fontKey("helvetica", field.bold));
}

export function measureWith(font: PDFFont, standard: boolean): MeasureWidth {
	return (text, size) => font.widthOfTextAtSize(standard ? sanitizeForStandardFont(text) : text, size);
}

/** Resolve a field's text for one row and lay it out; shared by the preview and the PDF. */
export function layoutFieldText(field: TextField, row: SelectedRow, position: number, measure: MeasureWidth, standardFont: boolean) {
	const { text: raw, missing } = interpolate(field.template, row.data, position);
	const cased = applyTextCase(raw.replace(/\r\n?/g, "\n"), field.textCase);
	const text = standardFont ? sanitizeForStandardFont(cased) : cased;
	const fit = fitText(text, { width: mmToPt(field.w), height: mmToPt(field.h) }, field, measure);
	return { ...fit, missing };
}

// --- PDF ----------------------------------------------------------------------

export interface Background {
	bytes: Uint8Array;
	kind: "pdf" | "png" | "jpeg";
}

export interface MergeOptions {
	background?: Background;
	customFont?: Uint8Array;
	onProgress?: (done: number, total: number) => void;
}

function hexToRgb(hex: string) {
	const value = Number.parseInt(hex.slice(1), 16);
	return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function drawField(page: PDFPage, field: TextField, fit: FitResult, font: PDFFont, bleed: number, mediaHeight: number) {
	const boxX = mmToPt(bleed + field.x);
	const boxTop = mmToPt(bleed + field.y);
	const boxWidth = mmToPt(field.w);
	const boxHeight = mmToPt(field.h);
	const lineHeight = fit.size * LINE_HEIGHT;
	const blockHeight = fit.lines.length * lineHeight;
	const blockTop = field.valign === "top"
		? boxTop
		: field.valign === "middle"
			? boxTop + (boxHeight - blockHeight) / 2
			: boxTop + boxHeight - blockHeight;
	const color = hexToRgb(field.color);

	fit.lines.forEach((line, index) => {
		const width = font.widthOfTextAtSize(line, fit.size);
		const x = field.align === "left" ? boxX : field.align === "center" ? boxX + (boxWidth - width) / 2 : boxX + boxWidth - width;
		const baselineFromTop = blockTop + index * lineHeight + fit.size * BASELINE_RATIO;
		page.drawText(line, { x, y: mediaHeight - baselineFromTop, size: fit.size, font, color });
	});
}

/** One page per row, with the background and every field drawn. */
export async function buildMergedPdf(rows: SelectedRow[], layout: Layout, options: MergeOptions = {}): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const fonts = await embedLayoutFonts(doc, layout.fields, options.customFont);
	const { trim, media, bleed } = pageDimensions(layout.page);
	const mediaWidth = mmToPt(media.width);
	const mediaHeight = mmToPt(media.height);

	let drawBackground: ((page: PDFPage) => void) | null = null;
	if (options.background) {
		const { bytes, kind } = options.background;
		if (kind === "pdf") {
			const [embedded] = await doc.embedPdf(bytes);
			drawBackground = page => page.drawPage(embedded, { x: 0, y: 0, width: mediaWidth, height: mediaHeight });
		}
		else {
			const image = kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
			drawBackground = page => page.drawImage(image, { x: 0, y: 0, width: mediaWidth, height: mediaHeight });
		}
	}

	for (const [position, row] of rows.entries()) {
		// Let the browser repaint progress every few pages.
		if (position > 0 && position % 10 === 0)
			await new Promise(resolve => setTimeout(resolve));
		const page = doc.addPage([mediaWidth, mediaHeight]);
		if (bleed > 0) {
			page.setTrimBox(mmToPt(bleed), mmToPt(bleed), mmToPt(trim.width), mmToPt(trim.height));
			page.setBleedBox(0, 0, mediaWidth, mediaHeight);
		}
		drawBackground?.(page);
		for (const field of layout.fields) {
			const font = fontFor(fonts, field);
			if (!font)
				throw new Error(`Font for "${field.template}" was not embedded`);
			const standard = fontKey(field.font, field.bold) !== "custom" || !options.customFont;
			const fit = layoutFieldText(field, row, position + 1, measureWith(font, standard), standard);
			drawField(page, field, fit, font, bleed, mediaHeight);
		}
		options.onProgress?.(position + 1, rows.length);
	}

	return doc.save();
}
