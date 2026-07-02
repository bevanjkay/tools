import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from "pdf-lib";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function getPdfjs() {
	if (!pdfjsPromise) {
		pdfjsPromise = (async () => {
			const pdfjsLib = await import("pdfjs-dist");
			const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
			pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
			return pdfjsLib;
		})();
	}
	return pdfjsPromise;
}

async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error("Failed to encode page image"));
				return;
			}
			resolve(blob);
		}, mime, quality);
	});
}

// --- Aggressive: rasterize every page to a JPEG -----------------------------

export async function rasterizePdf(bytes: ArrayBuffer, options: { dpi: number; quality: number }): Promise<Uint8Array> {
	const pdfjsLib = await getPdfjs();
	const scale = options.dpi / 72;
	const qualityRatio = options.quality / 100;
	const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
	const pdf = await loadingTask.promise;
	const out = await PDFDocument.create();

	try {
		for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
			const page = await pdf.getPage(pageNum);
			const baseViewport = page.getViewport({ scale: 1 });
			const viewport = page.getViewport({ scale });
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.ceil(viewport.width));
			canvas.height = Math.max(1, Math.ceil(viewport.height));
			const ctx = canvas.getContext("2d");
			if (!ctx)
				throw new Error("Unable to create canvas context");
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			await page.render({ canvas, canvasContext: ctx, viewport }).promise;

			const jpegBlob = await canvasToBlob(canvas, "image/jpeg", qualityRatio);
			const jpegBytes = await jpegBlob.arrayBuffer();
			const image = await out.embedJpg(jpegBytes);
			const outPage = out.addPage([baseViewport.width, baseViewport.height]);
			outPage.drawImage(image, { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height });
			page.cleanup();
		}
	}
	finally {
		await loadingTask.destroy();
	}

	return out.save();
}

// --- Downsample: recompress JPEG image XObjects, keep text/vectors ----------

function numberVal(dict: PDFDict, key: string) {
	const value = dict.lookup(PDFName.of(key));
	return value instanceof PDFNumber ? value.asNumber() : 0;
}

// Only handle streams whose bytes are a bare JPEG (single DCTDecode filter).
function isPlainJpeg(dict: PDFDict) {
	const filter = dict.lookup(PDFName.of("Filter"));
	if (filter instanceof PDFName)
		return filter.toString() === "/DCTDecode";
	if (filter instanceof PDFArray)
		return filter.size() === 1 && filter.lookup(0)?.toString() === "/DCTDecode";
	return false;
}

// Restrict to colour spaces a browser canvas decodes correctly (→ RGB output).
function colorSpaceSupported(dict: PDFDict) {
	const cs = dict.lookup(PDFName.of("ColorSpace"));
	if (cs instanceof PDFName) {
		const name = cs.toString();
		return name === "/DeviceRGB" || name === "/DeviceGray" || name === "/CalRGB" || name === "/CalGray";
	}
	if (cs instanceof PDFArray) {
		const kind = cs.get(0)?.toString();
		if (kind === "/ICCBased") {
			const stream = cs.lookup(1);
			const n = stream instanceof PDFRawStream ? stream.dict.lookup(PDFName.of("N")) : undefined;
			const channels = n instanceof PDFNumber ? n.asNumber() : 0;
			return channels === 1 || channels === 3;
		}
		return kind === "/CalRGB" || kind === "/CalGray";
	}
	return false;
}

// --- Placement analysis: work out each image's on-page size, hence its DPI ---
// A crop of a mini PDF content-stream interpreter: it tracks the CTM through
// q/Q/cm and follows Do into image and form XObjects. Resource name → object
// ref comes straight from each page/form's /XObject dict, so no fuzzy matching
// is needed. Anything it can't parse is simply skipped (→ quality-only).

type Matrix = [number, number, number, number, number, number];
type Token = { t: "num"; v: number } | { t: "name"; v: string } | { t: "op"; v: string };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

// Row-vector affine multiply: apply `m` first, then `n`.
function matmul(m: Matrix, n: Matrix): Matrix {
	return [
		m[0] * n[0] + m[1] * n[2],
		m[0] * n[1] + m[1] * n[3],
		m[2] * n[0] + m[3] * n[2],
		m[2] * n[1] + m[3] * n[3],
		m[4] * n[0] + m[5] * n[2] + n[4],
		m[4] * n[1] + m[5] * n[3] + n[5],
	];
}

function decodeName(raw: string) {
	return raw.replace(/#([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
	if (typeof DecompressionStream === "undefined")
		return null;
	for (const format of ["deflate", "deflate-raw"] as const) {
		try {
			const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
			return new Uint8Array(await new Response(stream).arrayBuffer());
		}
		catch {
			// Try the next format.
		}
	}
	return null;
}

async function decodedStreamBytes(stream: PDFRawStream): Promise<Uint8Array | null> {
	const dict = stream.dict;
	const parms = dict.lookup(PDFName.of("DecodeParms")) ?? dict.lookup(PDFName.of("DP"));
	if (parms instanceof PDFDict && parms.lookup(PDFName.of("Predictor")))
		return null;
	const filter = dict.lookup(PDFName.of("Filter"));
	if (!filter)
		return stream.contents;
	const isFlate = (filter instanceof PDFName && filter.toString() === "/FlateDecode")
		|| (filter instanceof PDFArray && filter.size() === 1 && filter.lookup(0)?.toString() === "/FlateDecode");
	return isFlate ? inflate(stream.contents) : null;
}

function readMatrix(dict: PDFDict): Matrix {
	const m = dict.lookup(PDFName.of("Matrix"));
	if (m instanceof PDFArray && m.size() === 6) {
		const out = IDENTITY.slice() as Matrix;
		for (let k = 0; k < 6; k += 1) {
			const value = m.lookup(k);
			if (value instanceof PDFNumber)
				out[k] = value.asNumber();
		}
		return out;
	}
	return IDENTITY.slice() as Matrix;
}

function buildXObjectMap(resources: PDFDict): Map<string, PDFRef> {
	const map = new Map<string, PDFRef>();
	const xobject = resources.lookup(PDFName.of("XObject"));
	if (!(xobject instanceof PDFDict))
		return map;
	for (const [name, value] of xobject.entries()) {
		if (value instanceof PDFRef)
			map.set(decodeName(name.toString().slice(1)), value);
	}
	return map;
}

function isWhitespace(c: number) {
	return c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
}

function isDelimiter(c: number) {
	return c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
}

function tokenizeContent(bytes: Uint8Array): Token[] {
	const tokens: Token[] = [];
	const n = bytes.length;
	let i = 0;
	while (i < n) {
		const c = bytes[i];
		if (isWhitespace(c) || c === 91 || c === 93) {
			i += 1;
		}
		else if (c === 37) { // % comment
			while (i < n && bytes[i] !== 10 && bytes[i] !== 13)
				i += 1;
		}
		else if (c === 40) { // ( literal string
			i += 1;
			let depth = 1;
			while (i < n && depth > 0) {
				const d = bytes[i++];
				if (d === 92)
					i += 1;
				else if (d === 40)
					depth += 1;
				else if (d === 41)
					depth -= 1;
			}
		}
		else if (c === 60 && bytes[i + 1] === 60) { // << dict
			i += 2;
			let depth = 1;
			while (i < n && depth > 0) {
				if (bytes[i] === 60 && bytes[i + 1] === 60) {
					depth += 1;
					i += 2;
				}
				else if (bytes[i] === 62 && bytes[i + 1] === 62) {
					depth -= 1;
					i += 2;
				}
				else if (bytes[i] === 40) {
					i += 1;
					let sd = 1;
					while (i < n && sd > 0) {
						const d = bytes[i++];
						if (d === 92)
							i += 1;
						else if (d === 40)
							sd += 1;
						else if (d === 41)
							sd -= 1;
					}
				}
				else {
					i += 1;
				}
			}
		}
		else if (c === 60) { // < hex string
			i += 1;
			while (i < n && bytes[i] !== 62)
				i += 1;
			i += 1;
		}
		else if (c === 47) { // /Name
			i += 1;
			let name = "";
			while (i < n && !isWhitespace(bytes[i]) && !isDelimiter(bytes[i])) {
				if (bytes[i] === 35 && i + 2 < n) {
					const code = Number.parseInt(String.fromCharCode(bytes[i + 1], bytes[i + 2]), 16);
					if (!Number.isNaN(code)) {
						name += String.fromCharCode(code);
						i += 3;
						continue;
					}
				}
				name += String.fromCharCode(bytes[i]);
				i += 1;
			}
			tokens.push({ t: "name", v: name });
		}
		else if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) { // number
			let s = "";
			while (i < n && !isWhitespace(bytes[i]) && !isDelimiter(bytes[i]))
				s += String.fromCharCode(bytes[i++]);
			const num = Number(s);
			if (Number.isFinite(num))
				tokens.push({ t: "num", v: num });
		}
		else { // operator keyword
			let s = "";
			while (i < n && !isWhitespace(bytes[i]) && !isDelimiter(bytes[i]))
				s += String.fromCharCode(bytes[i++]);
			if (s === "") {
				i += 1;
			}
			else if (s === "BI") { // skip inline image up to EI
				while (i < n) {
					if (bytes[i] === 69 && bytes[i + 1] === 73 && (i === 0 || isWhitespace(bytes[i - 1])) && (i + 2 >= n || isWhitespace(bytes[i + 2]) || isDelimiter(bytes[i + 2]))) {
						i += 2;
						break;
					}
					i += 1;
				}
			}
			else {
				tokens.push({ t: "op", v: s });
			}
		}
	}
	return tokens;
}

interface Placement { w: number; h: number }

async function recordPlacements(
	doc: PDFDocument,
	placements: Map<string, Placement>,
	tokens: Token[],
	xobjectMap: Map<string, PDFRef>,
	baseCtm: Matrix,
	depth: number,
	visited: Set<string>,
) {
	let ctm = baseCtm;
	const stack: Matrix[] = [];
	let operands: number[] = [];
	let lastName: string | null = null;

	for (const token of tokens) {
		if (token.t === "num") {
			operands.push(token.v);
			continue;
		}
		if (token.t === "name") {
			lastName = token.v;
			continue;
		}
		if (token.v === "q") {
			stack.push(ctm);
		}
		else if (token.v === "Q") {
			ctm = stack.pop() ?? ctm;
		}
		else if (token.v === "cm" && operands.length >= 6) {
			ctm = matmul(operands.slice(-6) as Matrix, ctm);
		}
		else if (token.v === "Do" && lastName && xobjectMap.has(lastName)) {
			const ref = xobjectMap.get(lastName)!;
			const obj = doc.context.lookup(ref);
			if (obj instanceof PDFRawStream) {
				const subtype = obj.dict.lookup(PDFName.of("Subtype"))?.toString();
				if (subtype === "/Image") {
					const w = Math.hypot(ctm[0], ctm[1]);
					const h = Math.hypot(ctm[2], ctm[3]);
					const key = ref.toString();
					const prev = placements.get(key);
					if (!prev || w * h > prev.w * prev.h)
						placements.set(key, { w, h });
				}
				else if (subtype === "/Form" && depth < 8 && !visited.has(ref.toString())) {
					const formBytes = await decodedStreamBytes(obj);
					if (formBytes) {
						const resources = obj.dict.lookup(PDFName.of("Resources"));
						const formMap = resources instanceof PDFDict ? buildXObjectMap(resources) : xobjectMap;
						const nextVisited = new Set(visited).add(ref.toString());
						await recordPlacements(doc, placements, tokenizeContent(formBytes), formMap, matmul(readMatrix(obj.dict), ctm), depth + 1, nextVisited);
					}
				}
			}
		}
		operands = [];
		lastName = null;
	}
}

async function buildPlacementMap(doc: PDFDocument): Promise<Map<string, Placement>> {
	const placements = new Map<string, Placement>();
	if (typeof DecompressionStream === "undefined")
		return placements;
	for (const page of doc.getPages()) {
		try {
			const resources = page.node.Resources();
			const xobjectMap = resources ? buildXObjectMap(resources) : new Map<string, PDFRef>();
			if (xobjectMap.size === 0)
				continue;
			const contents = page.node.Contents();
			const streams: PDFRawStream[] = [];
			if (contents instanceof PDFArray) {
				for (let k = 0; k < contents.size(); k += 1) {
					const s = contents.lookup(k);
					if (s instanceof PDFRawStream)
						streams.push(s);
				}
			}
			else if (contents instanceof PDFRawStream) {
				streams.push(contents);
			}
			const parts: Uint8Array[] = [];
			let ok = true;
			for (const s of streams) {
				const decoded = await decodedStreamBytes(s);
				if (!decoded) {
					ok = false;
					break;
				}
				parts.push(decoded, new Uint8Array([32]));
			}
			if (!ok || parts.length === 0)
				continue;
			const total = parts.reduce((sum, p) => sum + p.length, 0);
			const merged = new Uint8Array(total);
			let offset = 0;
			for (const p of parts) {
				merged.set(p, offset);
				offset += p.length;
			}
			await recordPlacements(doc, placements, tokenizeContent(merged), xobjectMap, IDENTITY, 0, new Set());
		}
		catch {
			// Skip pages we can't analyse; their images fall back to quality-only.
		}
	}
	return placements;
}

export async function downsamplePdf(bytes: ArrayBuffer, options: { imageDpi: number; imageQuality: number }): Promise<Uint8Array> {
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	const qualityRatio = options.imageQuality / 100;
	const placements = options.imageDpi > 0 ? await buildPlacementMap(doc) : new Map<string, Placement>();

	for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
		if (!(obj instanceof PDFRawStream))
			continue;
		try {
			const dict = obj.dict;
			if (dict.lookup(PDFName.of("Subtype"))?.toString() !== "/Image")
				continue;
			if (dict.get(PDFName.of("ImageMask")) || dict.get(PDFName.of("Decode")))
				continue;
			if (!isPlainJpeg(dict) || !colorSpaceSupported(dict))
				continue;
			if (numberVal(dict, "Width") <= 0 || numberVal(dict, "Height") <= 0)
				continue;

			const original = obj.contents;
			let bitmap: ImageBitmap;
			try {
				bitmap = await createImageBitmap(new Blob([original as BlobPart], { type: "image/jpeg" }));
			}
			catch {
				continue;
			}

			let scale = 1;
			const place = placements.get(ref.toString());
			if (options.imageDpi > 0 && place && place.w > 0 && place.h > 0) {
				// DPI = pixels / (points / 72). Downscale so neither axis exceeds the target.
				const dpiX = (bitmap.width * 72) / place.w;
				const dpiY = (bitmap.height * 72) / place.h;
				const fit = Math.min(options.imageDpi / dpiX, options.imageDpi / dpiY);
				if (Number.isFinite(fit) && fit > 0 && fit < 1)
					scale = fit;
			}
			const newW = Math.max(1, Math.round(bitmap.width * scale));
			const newH = Math.max(1, Math.round(bitmap.height * scale));

			const canvas = document.createElement("canvas");
			canvas.width = newW;
			canvas.height = newH;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				bitmap.close();
				continue;
			}
			ctx.drawImage(bitmap, 0, 0, newW, newH);
			bitmap.close();

			const outBlob = await canvasToBlob(canvas, "image/jpeg", qualityRatio);
			const newBytes = new Uint8Array(await outBlob.arrayBuffer());
			// Skip if we neither shrank dimensions nor saved bytes.
			if (scale === 1 && newBytes.length >= original.length)
				continue;

			dict.set(PDFName.of("Width"), PDFNumber.of(newW));
			dict.set(PDFName.of("Height"), PDFNumber.of(newH));
			dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
			dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
			dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
			dict.delete(PDFName.of("DecodeParms"));
			dict.set(PDFName.of("Length"), PDFNumber.of(newBytes.length));
			doc.context.assign(ref, PDFRawStream.of(dict, newBytes));
		}
		catch {
			// Leave any problematic image untouched.
		}
	}

	doc.setTitle("");
	doc.setAuthor("");
	doc.setSubject("");
	doc.setKeywords([]);
	doc.setProducer("");
	doc.setCreator("");
	return doc.save({ useObjectStreams: true });
}
