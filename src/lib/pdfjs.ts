let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

/** Load pdf.js on demand and point it at its bundled worker. */
export function getPdfjs() {
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
