import JSZip from "jszip";
import { downloadBlob } from "./download.js";

export interface ZipEntry {
	name: string;
	data: Blob | Uint8Array;
}

const EXTENSION_RE = /(\.[^./]+)?$/;

/** Returns `name`, or `name (2)`, `name (3)`… before the extension until it is not in `taken`. */
export function uniqueFileName(name: string, taken: Set<string>) {
	let candidate = name;
	for (let n = 2; taken.has(candidate); n += 1)
		candidate = name.replace(EXTENSION_RE, ext => ` (${n})${ext}`);
	taken.add(candidate);
	return candidate;
}

export async function buildZip(entries: ZipEntry[]) {
	const zip = new JSZip();
	const taken = new Set<string>();
	for (const entry of entries)
		zip.file(uniqueFileName(entry.name, taken), entry.data);
	return zip.generateAsync({ type: "blob" });
}

export async function downloadZip(entries: ZipEntry[], zipName: string) {
	downloadBlob(await buildZip(entries), zipName);
}
