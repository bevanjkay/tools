import type { Layout, MeasureWidth } from "./print-merge";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
	applyTextCase,
	buildMergedPdf,
	cell,
	defaultLayout,
	detectDelimiter,
	fitText,
	interpolate,
	layoutColumns,
	layoutFieldText,
	MAX_FONT_SIZE,
	mmToPt,
	pageDimensions,
	parseDelimited,
	parseLayout,
	sanitizeForStandardFont,
	selectRows,
	serializeLayout,
	templateColumns,
	wrapText,
} from "./print-merge";

// A monospaced stand-in: every character is 0.6 em wide.
const mono: MeasureWidth = (text, size) => text.length * size * 0.6;

describe("parseDelimited", () => {
	it("handles quoted commas, escaped quotes and embedded newlines", () => {
		const table = parseDelimited("Name,Notes\n\"Smith, Jo\",\"Says \"\"hi\"\"\nTwice\"\nLee,plain\n");
		expect(table.headers).toEqual(["Name", "Notes"]);
		expect(table.rows).toEqual([
			{ Name: "Smith, Jo", Notes: "Says \"hi\"\nTwice" },
			{ Name: "Lee", Notes: "plain" },
		]);
	});

	it("normalises line endings inside quoted fields", () => {
		expect(parseDelimited("Notes\r\n\"two\r\nlines\"\r\n\"old\rmac\"\r\n").rows).toEqual([{ Notes: "two\nlines" }, { Notes: "old\nmac" }]);
	});

	it("reads a tab-separated paste with CRLF endings and a BOM", () => {
		const text = "\uFEFFFirst\tLast\r\nAda\tLovelace\r\nAlan\tTuring\r\n";
		expect(detectDelimiter(text)).toBe("\t");
		const table = parseDelimited(text);
		expect(table.headers).toEqual(["First", "Last"]);
		expect(table.rows).toEqual([{ First: "Ada", Last: "Lovelace" }, { First: "Alan", Last: "Turing" }]);
	});

	it("prefers semicolons when they outnumber commas", () => {
		expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
		expect(detectDelimiter("a,b\n1,2")).toBe(",");
	});

	it("ignores punctuation inside quoted headers when detecting the delimiter", () => {
		const text = "\"Last; First; Middle\",Seat\n\"Lovelace; Ada; Augusta\",1\n";
		expect(detectDelimiter(text)).toBe(",");
		expect(parseDelimited(text).rows).toEqual([{ "Last; First; Middle": "Lovelace; Ada; Augusta", "Seat": "1" }]);
		expect(detectDelimiter("\"a\nb\"\tc\n")).toBe("\t");
	});

	it("fills short rows, drops blank rows and disambiguates headers", () => {
		const table = parseDelimited("Name,,Name\nA\n\nB,x,y,extra\n");
		expect(table.headers).toEqual(["Name", "Column 2", "Name (2)"]);
		expect(parseDelimited("Name,Name,Name (2)\na,b,c\n").headers).toEqual(["Name", "Name (2)", "Name (2) (2)"]);
		expect(table.rows).toEqual([
			{ "Name": "A", "Column 2": "", "Name (2)": "" },
			{ "Name": "B", "Column 2": "x", "Name (2)": "y" },
		]);
	});
});

describe("templates", () => {
	it("lists referenced columns once", () => {
		expect(templateColumns("{First} {Last} ({First}) seat {Seat}")).toEqual(["First", "Last", "Seat"]);
	});

	it("fills values, row numbers and reports missing columns", () => {
		const row = { First: "Ada", Last: "Lovelace" };
		expect(interpolate("{First} {Last}", row, 1)).toEqual({ text: "Ada Lovelace", missing: [] });
		expect(interpolate("Row {Row}: {Nickname}", row, 7)).toEqual({ text: "Row 7: ", missing: ["Nickname"] });
	});

	it("ignores inherited object properties as column names", () => {
		expect(interpolate("{constructor}{toString}", { Name: "x" }, 1)).toEqual({ text: "", missing: ["constructor", "toString"] });
		expect(cell({ Name: "x" }, "hasOwnProperty")).toBe("");
		expect(selectRows([{ Name: "x" }], { filter: { column: "constructor", op: "notEmpty", value: "" }, sort: { column: "toString", direction: "asc" }, skipBlank: true }, ["constructor"])).toEqual([]);
	});
});

describe("selectRows", () => {
	const rows = [
		{ Name: "Zed", Team: "Blue", Seat: "10" },
		{ Name: "Amy", Team: "Red", Seat: "2" },
		{ Name: "", Team: "Blue", Seat: "" },
		{ Name: "Bob", Team: "blue", Seat: "1" },
	];
	const base = { filter: { column: "", op: "none" as const, value: "" }, sort: null, skipBlank: true };

	it("filters by equality, substring and presence", () => {
		expect(selectRows(rows, { ...base, filter: { column: "Team", op: "equals", value: "blue" } }, ["Name"]).map(r => r.index)).toEqual([0, 3]);
		expect(selectRows(rows, { ...base, filter: { column: "Name", op: "contains", value: "m" } }, ["Name"]).map(r => r.index)).toEqual([1]);
		expect(selectRows(rows, { ...base, skipBlank: false, filter: { column: "Seat", op: "notEmpty", value: "" } }, []).map(r => r.index)).toEqual([0, 1, 3]);
	});

	it("skips rows whose referenced columns are all blank, unless told otherwise", () => {
		expect(selectRows(rows, base, ["Name", "Seat", "Row"]).map(r => r.index)).toEqual([0, 1, 3]);
		expect(selectRows(rows, { ...base, skipBlank: false }, ["Name"]).map(r => r.index)).toEqual([0, 1, 2, 3]);
		expect(selectRows(rows, base, []).map(r => r.index)).toEqual([0, 1, 2, 3]);
	});

	it("sorts naturally in either direction", () => {
		expect(selectRows(rows, { ...base, skipBlank: false, sort: { column: "Seat", direction: "asc" } }, []).map(r => r.data.Seat)).toEqual(["", "1", "2", "10"]);
		expect(selectRows(rows, { ...base, sort: { column: "Name", direction: "desc" } }, ["Name"]).map(r => r.data.Name)).toEqual(["Zed", "Bob", "Amy"]);
	});
});

describe("text fitting", () => {
	it("applies text case", () => {
		expect(applyTextCase("o'neil mc-gee (jo)", "title")).toBe("O'Neil Mc-Gee (Jo)");
		expect(applyTextCase("abc", "upper")).toBe("ABC");
		expect(applyTextCase("MiXed", "none")).toBe("MiXed");
	});

	it("wraps greedily and keeps long words on their own line", () => {
		expect(wrapText("the quick brown fox", 60, 10, mono)).toEqual(["the quick", "brown fox"]);
		expect(wrapText("supercalifragilistic is long", 60, 10, mono)).toEqual(["supercalifragilistic", "is long"]);
		expect(wrapText("a\n\nb", 600, 10, mono)).toEqual(["a", "", "b"]);
	});

	it("shrinks to fit and flags text that never fits", () => {
		// 10 characters at 0.6 em: fits a 60 pt wide box at 10 pt exactly.
		expect(fitText("0123456789", { width: 60, height: 20 }, { size: 20, minSize: 8, overflow: "shrink" }, mono)).toEqual({ lines: ["0123456789"], size: 10, overflow: false });
		const stuck = fitText("0123456789", { width: 30, height: 20 }, { size: 20, minSize: 8, overflow: "shrink" }, mono);
		expect(stuck).toEqual({ lines: ["0123456789"], size: 8, overflow: true });
	});

	it("tries a minimum size that sits between the half-point steps", () => {
		// 10 chars × 0.6 em × 9.7 pt = 58.2 pt, which fits a 59 pt box only at the odd minimum.
		expect(fitText("0123456789", { width: 59, height: 20 }, { size: 10, minSize: 9.7, overflow: "shrink" }, mono)).toEqual({ lines: ["0123456789"], size: 9.7, overflow: false });
	});

	it("wraps first and only shrinks when the lines run out of height", () => {
		const fit = fitText("aaaa bbbb cccc", { width: 60, height: 30 }, { size: 10, minSize: 6, overflow: "wrap" }, mono);
		expect(fit).toEqual({ lines: ["aaaa bbbb", "cccc"], size: 10, overflow: false });
		const shrunk = fitText("aaaa bbbb cccc dddd", { width: 60, height: 20 }, { size: 10, minSize: 6, overflow: "wrap" }, mono);
		expect(shrunk.overflow).toBe(false);
		expect(shrunk.size).toBeLessThan(10);
	});

	it("replaces characters the standard fonts cannot draw", () => {
		expect(sanitizeForStandardFont("Café – “Nguyễn” 😀")).toBe("Café – “Nguy?n” ?");
		expect(sanitizeForStandardFont("Jose\u0301")).toBe("José");
	});

	it("caps absurd font sizes so fitting terminates", () => {
		const fit = fitText("x", { width: 1000, height: 1000 }, { size: 1e9, minSize: 1e9, overflow: "shrink" }, mono);
		expect(fit.size).toBeLessThanOrEqual(MAX_FONT_SIZE);
		expect(parseLayout("{\"fields\":[{\"size\":1e9,\"minSize\":1e9}]}").fields[0]).toMatchObject({ size: MAX_FONT_SIZE, minSize: MAX_FONT_SIZE });
	});

	it("changes case before sanitising and joins CRLF lines", () => {
		const field = { ...defaultLayout().fields[0], template: "{Note}", textCase: "upper" as const, overflow: "wrap" as const };
		const row = { index: 0, data: { Note: "5 µm\r\nsecond" } };
		const fit = layoutFieldText(field, row, 1, mono, true);
		expect(fit.lines).toEqual(["5 ?M", "SECOND"]);
	});
});

describe("layout", () => {
	it("derives page sizes with orientation and bleed", () => {
		expect(pageDimensions({ size: "a6", width: 0, height: 0, orientation: "portrait", bleed: 0 })).toEqual({ trim: { width: 105, height: 148 }, media: { width: 105, height: 148 }, bleed: 0 });
		expect(pageDimensions({ size: "cr80", width: 0, height: 0, orientation: "landscape", bleed: 3 })).toEqual({ trim: { width: 85.6, height: 54 }, media: { width: 91.6, height: 60 }, bleed: 3 });
		expect(pageDimensions({ size: "custom", width: 120, height: 80, orientation: "portrait", bleed: 0 }).trim).toEqual({ width: 80, height: 120 });
	});

	it("round-trips through JSON and fills defaults", () => {
		const layout = defaultLayout();
		layout.page = { size: "custom", width: 120, height: 80, orientation: "landscape", bleed: 3 };
		layout.fields[0].template = "{First} {Last}";
		layout.selection.sort = { column: "Last", direction: "desc" };
		expect(parseLayout(serializeLayout(layout))).toEqual(layout);

		const sparse = parseLayout("{\"fields\":[{\"template\":\"{Seat}\",\"x\":5}]}");
		expect(sparse.version).toBe(1);
		expect(sparse.fields[0]).toMatchObject({ id: "field-1", template: "{Seat}", x: 5, font: "helvetica", overflow: "shrink" });
		expect(sparse.selection.skipBlank).toBe(true);
	});

	it("rejects junk and newer versions", () => {
		expect(() => parseLayout("nope")).toThrow("not valid JSON");
		expect(() => parseLayout("{\"page\":{}}")).toThrow("not a Print Merge layout");
		expect(() => parseLayout("{\"version\":99,\"fields\":[]}")).toThrow("newer version");
	});

	it("collects the columns every field references", () => {
		const layout = defaultLayout();
		layout.fields.push({ ...layout.fields[0], id: "field-2", template: "{Seat} / {Name}" });
		expect(layoutColumns(layout)).toEqual(["Name", "Seat"]);
	});
});

describe("buildMergedPdf", () => {
	const rows = [
		{ index: 0, data: { Name: "Ada Lovelace", Seat: "1" } },
		{ index: 1, data: { Name: "Alan Turing", Seat: "2" } },
		{ index: 2, data: { Name: "Grace Hopper", Seat: "3" } },
	];

	it("writes one page per row at the trim size", async () => {
		const layout: Layout = defaultLayout();
		const pdf = await PDFDocument.load(await buildMergedPdf(rows, layout));
		expect(pdf.getPageCount()).toBe(3);
		const { width, height } = pdf.getPage(0).getSize();
		expect(width).toBeCloseTo(mmToPt(105), 3);
		expect(height).toBeCloseTo(mmToPt(148), 3);
	});

	it("sets the MediaBox to include bleed and the TrimBox to the trim size", async () => {
		const layout: Layout = defaultLayout();
		layout.page = { size: "business-card", width: 0, height: 0, orientation: "landscape", bleed: 3 };
		layout.fields[0].font = "times";
		layout.fields[0].overflow = "wrap";
		const pdf = await PDFDocument.load(await buildMergedPdf(rows.slice(0, 1), layout));
		const page = pdf.getPage(0);
		const media = page.getMediaBox();
		const trim = page.getTrimBox();
		expect(media.width).toBeCloseTo(mmToPt(96), 3);
		expect(media.height).toBeCloseTo(mmToPt(61), 3);
		expect(trim.x).toBeCloseTo(mmToPt(3), 3);
		expect(trim.y).toBeCloseTo(mmToPt(3), 3);
		expect(trim.width).toBeCloseTo(mmToPt(90), 3);
		expect(trim.height).toBeCloseTo(mmToPt(55), 3);
	});

	it("draws a PDF background on every page", async () => {
		const art = await PDFDocument.create();
		art.addPage([200, 100]).drawRectangle({ x: 0, y: 0, width: 200, height: 100 });
		const background = { bytes: await art.save(), kind: "pdf" as const };
		const pdf = await PDFDocument.load(await buildMergedPdf(rows.slice(0, 2), defaultLayout(), { background }));
		expect(pdf.getPageCount()).toBe(2);
		for (const page of pdf.getPages())
			expect(page.node.Resources()?.lookup(page.node.context.obj("XObject"))).toBeDefined();
	});
});
