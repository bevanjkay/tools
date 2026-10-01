import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("favicon", () => {
	// Firefox sends the favicon to extensions as a data URL on every tab
	// update, so a large file stalls the browser on each navigation.
	it("stays small", () => {
		expect(statSync("static/favicon.png").size).toBeLessThan(20_000);
	});
});
