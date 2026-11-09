import { getPdfjs } from "./pdfjs.js";

/** Render every page to a small JPEG data URL, `width` CSS pixels wide. */
export async function renderPdfThumbnails(bytes: ArrayBuffer, width: number): Promise<string[]> {
	const pdfjsLib = await getPdfjs();
	// pdf.js transfers the buffer to its worker, so hand it a copy.
	const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) });
	const pdf = await loadingTask.promise;
	const pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
	const thumbnails: string[] = [];
	try {
		for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
			const page = await pdf.getPage(pageNumber);
			const base = page.getViewport({ scale: 1 });
			const viewport = page.getViewport({ scale: (width * pixelRatio) / base.width });
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.ceil(viewport.width));
			canvas.height = Math.max(1, Math.ceil(viewport.height));
			const ctx = canvas.getContext("2d");
			if (!ctx)
				throw new Error("Unable to create canvas context");
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			await page.render({ canvas, canvasContext: ctx, viewport }).promise;
			thumbnails.push(canvas.toDataURL("image/jpeg", 0.8));
			page.cleanup();
		}
	}
	finally {
		await loadingTask.destroy();
	}
	return thumbnails;
}
