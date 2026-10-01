// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { checkLinkMeta, normalizeUrl, openGraphCard, parseLinkMeta, xCard } from "./link-preview";

const COMPLETE = `<!doctype html><html><head>
	<title>Reside Church</title>
	<meta name="description" content="A church in Geelong.">
	<meta name="robots" content="index, follow">
	<meta name="theme-color" content="#123456">
	<link rel="canonical" href="/about">
	<link rel="icon" href="/favicon.svg">
	<meta property="og:title" content="Reside Church | About">
	<meta property="og:description" content="Who we are.">
	<meta property="og:url" content="https://example.com/about">
	<meta property="og:site_name" content="Reside">
	<meta property="og:image" content="/og.jpg">
	<meta property="og:image" content="/second.jpg">
	<meta property="og:image:alt" content="Church building">
	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:title" content="Reside on X">
</head><body></body></html>`;

describe("normalizeUrl", () => {
	it("adds https and rejects junk", () => {
		expect(normalizeUrl("example.com/a")?.toString()).toBe("https://example.com/a");
		expect(normalizeUrl("http://example.com")?.protocol).toBe("http:");
		expect(normalizeUrl("not a url")).toBeNull();
		expect(normalizeUrl("")).toBeNull();
	});
});

describe("parseLinkMeta", () => {
	it("reads tags and resolves relative URLs", () => {
		const meta = parseLinkMeta(COMPLETE, "https://example.com/about");
		expect(meta.title).toBe("Reside Church");
		expect(meta.description).toBe("A church in Geelong.");
		expect(meta.canonical).toBe("https://example.com/about");
		expect(meta.favicon).toBe("https://example.com/favicon.svg");
		expect(meta.themeColor).toBe("#123456");
		expect(meta.og["og:image"]).toBe("https://example.com/og.jpg");
		expect(meta.twitter["twitter:card"]).toBe("summary_large_image");
	});

	it("honours <base href> and defaults the favicon", () => {
		const meta = parseLinkMeta(`<base href="https://cdn.example.com/site/"><meta property="og:image" content="img.png">`, "https://example.com/");
		expect(meta.og["og:image"]).toBe("https://cdn.example.com/site/img.png");
		expect(meta.favicon).toBe("https://example.com/favicon.ico");
	});
});

describe("preview cards", () => {
	it("falls back from twitter to Open Graph to HTML", () => {
		const meta = parseLinkMeta(COMPLETE, "https://www.example.com/about");
		expect(openGraphCard(meta)).toEqual({
			title: "Reside Church | About",
			description: "Who we are.",
			image: "https://www.example.com/og.jpg",
			imageAlt: "Church building",
			siteName: "Reside",
			domain: "example.com",
		});
		expect(xCard(meta)).toMatchObject({ title: "Reside on X", description: "Who we are.", large: true });

		const bare = parseLinkMeta("<title>Plain</title>", "https://www.plain.org/");
		expect(openGraphCard(bare)).toMatchObject({ title: "Plain", image: "", domain: "plain.org" });
		expect(xCard(bare).large).toBe(false);
	});
});

describe("checkLinkMeta", () => {
	it("passes a complete page with a large image", () => {
		const meta = parseLinkMeta(COMPLETE, "https://example.com/about");
		expect(checkLinkMeta(meta, { width: 1200, height: 630 }).filter(check => check.level !== "ok")).toEqual([]);
	});

	it("flags missing and weak tags", () => {
		const meta = parseLinkMeta(`<title>${"x".repeat(70)}</title><meta name="robots" content="noindex"><meta property="og:image" content="http://example.com/a.jpg">`, "https://example.com/");
		const messages = checkLinkMeta(meta, { width: 600, height: 315 }).map(check => `${check.level}: ${check.message}`);
		expect(messages).toEqual(expect.arrayContaining([
			expect.stringMatching(/^warning: <title> is 70 characters/),
			"warning: Missing meta description",
			"warning: og:image uses http://; some platforms only load https images",
			"warning: og:image is 600 × 315; 1200 × 630 or larger is recommended",
			"error: Page is set to noindex (robots: noindex)",
		]));
	});

	it("reports an image that failed to load", () => {
		const meta = parseLinkMeta(COMPLETE, "https://example.com/about");
		expect(checkLinkMeta(meta, null)).toContainEqual({ level: "error", message: "og:image could not be loaded" });
	});
});
