import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPlacementMap, tokenizeContent } from "./pdf-compress";

const PIXEL_PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));

function encode(text: string) {
	return new TextEncoder().encode(text);
}

function imageRefs(doc: PDFDocument) {
	return doc.context.enumerateIndirectObjects()
		.filter(([, obj]) => obj instanceof PDFRawStream && obj.dict.lookup(PDFName.of("Subtype"))?.toString() === "/Image")
		.map(([ref]) => ref.toString());
}

describe("tokenizeContent", () => {
	it("splits operands, names and operators", () => {
		expect(tokenizeContent(encode("q 1 0 0 1 10 -2.5 cm /Im0 Do Q"))).toEqual([
			{ t: "op", v: "q" },
			{ t: "num", v: 1 },
			{ t: "num", v: 0 },
			{ t: "num", v: 0 },
			{ t: "num", v: 1 },
			{ t: "num", v: 10 },
			{ t: "num", v: -2.5 },
			{ t: "op", v: "cm" },
			{ t: "name", v: "Im0" },
			{ t: "op", v: "Do" },
			{ t: "op", v: "Q" },
		]);
	});

	it("skips strings, dicts, comments and inline images", () => {
		const content = "(a (nested) \\) string) Tj % comment\n<</K 1>> BDC <48656c6c6f> Tj BI /W 1 /H 1 ID \u0000ÿ EI EMC /A#20B Do";
		expect(tokenizeContent(encode(content))).toEqual([
			{ t: "op", v: "Tj" },
			{ t: "op", v: "BDC" },
			{ t: "op", v: "Tj" },
			{ t: "op", v: "EMC" },
			{ t: "name", v: "A B" },
			{ t: "op", v: "Do" },
		]);
	});
});

describe("buildPlacementMap", () => {
	it("measures an image's drawn size on the page", async () => {
		const source = await PDFDocument.create();
		const image = await source.embedPng(PIXEL_PNG);
		source.addPage([600, 800]).drawImage(image, { x: 50, y: 50, width: 144, height: 72 });

		const doc = await PDFDocument.load(await source.save());
		const placements = await buildPlacementMap(doc);

		const [ref] = imageRefs(doc);
		expect(placements.get(ref)).toEqual({ w: 144, h: 72 });
	});

	it("follows form XObjects and keeps the largest placement", async () => {
		const inner = await PDFDocument.create();
		const image = await inner.embedPng(PIXEL_PNG);
		inner.addPage([200, 200]).drawImage(image, { x: 0, y: 0, width: 100, height: 100 });

		const outer = await PDFDocument.create();
		const embedded = await outer.embedPage((await PDFDocument.load(await inner.save())).getPage(0));
		const page = outer.addPage([600, 800]);
		page.drawPage(embedded, { x: 0, y: 0, xScale: 0.5, yScale: 0.5 });
		page.drawPage(embedded, { x: 200, y: 200, xScale: 2, yScale: 1.5 });

		const doc = await PDFDocument.load(await outer.save());
		const placements = await buildPlacementMap(doc);

		const [ref] = imageRefs(doc);
		expect(placements.get(ref)).toEqual({ w: 200, h: 150 });
	});
});
