import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildZip, uniqueFileName } from "./zip";

describe("uniqueFileName", () => {
	it("numbers clashes before the extension", () => {
		const taken = new Set<string>();
		expect(uniqueFileName("scan.pdf", taken)).toBe("scan.pdf");
		expect(uniqueFileName("scan.pdf", taken)).toBe("scan (2).pdf");
		expect(uniqueFileName("scan.pdf", taken)).toBe("scan (3).pdf");
		expect(uniqueFileName("scan (2).pdf", taken)).toBe("scan (2) (2).pdf");
		expect(uniqueFileName("README", taken)).toBe("README");
		expect(uniqueFileName("README", taken)).toBe("README (2)");
	});
});

describe("buildZip", () => {
	it("keeps every entry when names collide", async () => {
		const blob = await buildZip([
			{ name: "a.txt", data: new TextEncoder().encode("one") },
			{ name: "a.txt", data: new TextEncoder().encode("two") },
		]);
		const zip = await JSZip.loadAsync(await blob.arrayBuffer());
		expect(Object.keys(zip.files).sort()).toEqual(["a (2).txt", "a.txt"]);
		expect(await zip.file("a (2).txt")?.async("string")).toBe("two");
	});
});
