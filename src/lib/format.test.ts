import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
	it("picks the unit and precision", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(-5)).toBe("0 B");
		expect(formatBytes(Number.NaN)).toBe("0 B");
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(1536)).toBe("1.5 KB");
		expect(formatBytes(150 * 1024)).toBe("150 KB");
		expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5.0 GB");
		expect(formatBytes(5000 * 1024 * 1024 * 1024)).toBe("5000 GB");
	});
});
