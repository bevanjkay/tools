import type { SignaturePerson } from "./email-signature";
import { describe, expect, it } from "vitest";
import {
	emptyPerson,
	escapeHtml,
	formatAustralianPhone,
	GMAIL_SIGNATURE_LIMIT,
	isHttpsUrl,
	normalizeWebUrl,
	parsePrefill,
	phoneHref,
	renderSignatureHtml,
	renderSignatureText,
} from "./email-signature";
import { emptyBrand } from "./signature-brand";

const preset = {
	...emptyBrand(),
	name: "Example Org",
	logoUrl: "https://example.com/logo.png",
	website: "https://example.com",
	websiteLabel: "example.com",
	addressLine: "1 Example St, Geelong VIC",
	socials: [{ label: "Instagram", url: "https://instagram.com/example" }],
};
const person: SignaturePerson = {
	name: "Taylor O'Connor",
	pronouns: "they/them",
	role: "Youth Pastor",
	phone: "0412345678",
	email: "taylor@example.com",
	extraLine: "Part-time: Tue–Thu",
};

describe("escapeHtml", () => {
	it("escapes markup and quotes", () => {
		expect(escapeHtml("O'Connor & <Sons> \"Ltd\"")).toBe("O&#39;Connor &amp; &lt;Sons&gt; &quot;Ltd&quot;");
	});
});

describe("formatAustralianPhone", () => {
	it("groups mobiles, landlines, 13 and 1300 numbers", () => {
		expect(formatAustralianPhone("0412345678")).toBe("0412 345 678");
		expect(formatAustralianPhone("(03) 9123-4567")).toBe("03 9123 4567");
		expect(formatAustralianPhone("+61 412 345 678")).toBe("0412 345 678");
		expect(formatAustralianPhone("61298765432")).toBe("02 9876 5432");
		expect(formatAustralianPhone("1300123456")).toBe("1300 123 456");
		expect(formatAustralianPhone("131234")).toBe("13 12 34");
	});

	it("leaves unrecognised numbers alone", () => {
		expect(formatAustralianPhone(" +44 20 7946 0958 ")).toBe("+44 20 7946 0958");
		expect(formatAustralianPhone("ext 123")).toBe("ext 123");
	});

	it("links Australian numbers in E.164", () => {
		expect(phoneHref("0412 345 678")).toBe("tel:+61412345678");
		expect(phoneHref("+61 3 9123 4567")).toBe("tel:+61391234567");
		expect(phoneHref("+44 20 7946 0958")).toBe("tel:+442079460958");
	});
});

describe("renderSignatureHtml", () => {
	const html = renderSignatureHtml(preset, person);

	it("escapes every user value", () => {
		expect(html).toContain("Taylor O&#39;Connor");
		expect(html).not.toContain("O'Connor");
		const hostile = renderSignatureHtml(preset, { ...person, role: "<script>alert(1)</script>", email: "a\"b@example.com" });
		expect(hostile).not.toContain("<script>");
		expect(hostile).toContain("&lt;script&gt;");
		expect(hostile).toContain("mailto:a&quot;b@example.com");
	});

	it("uses only presentation tables with inline styles", () => {
		expect(html).not.toMatch(/<div/i);
		expect(html).not.toMatch(/<style/i);
		expect(html).not.toMatch(/class=/i);
		expect(html).toContain("<table role=\"presentation\"");
		expect(html).toContain("font-family:Arial, Helvetica, sans-serif;");
	});

	it("gives every image an absolute https source, size and alt text", () => {
		const images = [...html.matchAll(/<img[^>]*>/g)].map(match => match[0]);
		expect(images.length).toBeGreaterThan(0);
		for (const img of images) {
			expect(img).toMatch(/src="https:\/\//);
			expect(img).toMatch(/\swidth="\d+"/);
			expect(img).toMatch(/\sheight="\d+"/);
			expect(img).toMatch(/\salt="[^"]+"/);
			expect(img).toContain("border=\"0\"");
		}
	});

	it("links phone, email, website and socials", () => {
		expect(html).toContain("href=\"tel:+61412345678\"");
		expect(html).toContain(">0412 345 678<");
		expect(html).toContain("href=\"mailto:taylor@example.com\"");
		expect(html).toContain("href=\"https://instagram.com/example\"");
		expect(html).toContain("(they/them)");
		expect(html).toContain("Part-time: Tue–Thu");
	});

	it("omits empty fields without leaving blank rows or separators", () => {
		const sparse = renderSignatureHtml({ ...preset, addressLine: "", socials: [], logoUrl: "" }, { ...emptyPerson(), name: "Sam Lee" });
		expect(sparse).not.toContain("<img");
		expect(sparse).not.toContain("&middot;");
		expect(sparse).not.toContain("tel:");
		expect(sparse).not.toContain("mailto:");
		expect(sparse).not.toContain("()");
		expect([...sparse.matchAll(/<tr>/g)]).toHaveLength(3);
		expect(sparse).not.toMatch(/<td[^>]*>\s*<\/td>/);
	});

	it("stays well under Gmail's limit", () => {
		expect(html.length).toBeLessThan(GMAIL_SIGNATURE_LIMIT / 3);
	});

	it("escapes a quoted font stack instead of breaking the style attribute", () => {
		const quoted = renderSignatureHtml({ ...preset, fontStack: "\"Times New Roman\", Times, serif" }, person);
		expect(quoted).toContain("font-family:&quot;Times New Roman&quot;, Times, serif;");
		expect(quoted).not.toContain("\"Times New Roman\"");
		const hostile = renderSignatureHtml({ ...preset, fontStack: "Arial\" onmouseover=\"alert(1)" }, person);
		expect(hostile).not.toContain("onmouseover=\"");
	});

	it("drops logos that are not absolute https URLs", () => {
		expect(isHttpsUrl("https://example.com/logo.png")).toBe(true);
		expect(isHttpsUrl("http://example.com/logo.png")).toBe(false);
		expect(isHttpsUrl("/logo.png")).toBe(false);
		expect(isHttpsUrl("data:image/png;base64,AAAA")).toBe(false);
		for (const logoUrl of ["/logo.png", "data:image/png;base64,AAAA", "http://example.com/logo.png"])
			expect(renderSignatureHtml({ ...preset, logoUrl }, person)).not.toContain("<img");
	});

	it("adds https to scheme-less links and drops unsafe schemes", () => {
		expect(normalizeWebUrl(" www.example.com/team ")).toBe("https://www.example.com/team");
		expect(normalizeWebUrl("http://example.com")).toBe("http://example.com");
		expect(normalizeWebUrl("javascript:alert(1)")).toBe("");
		expect(normalizeWebUrl("")).toBe("");
		const html = renderSignatureHtml({ ...preset, website: "example.org", socials: [{ label: "X", url: "x.com/example" }, { label: "Bad", url: "javascript:alert(1)" }] }, person);
		expect(html).toContain("href=\"https://example.org\"");
		expect(html).toContain("href=\"https://x.com/example\"");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain(">Bad<");
		expect(renderSignatureText({ ...preset, website: "example.org" }, person)).toContain("https://example.org");
	});

	it("tolerates null social slots from an older save", () => {
		const socials = [null, { label: "X", url: "https://x.com/example" }] as unknown as typeof preset.socials;
		expect(renderSignatureHtml({ ...preset, socials }, person)).toContain("https://x.com/example");
	});

	it("renders a brand with no logo or website", () => {
		const html = renderSignatureHtml({ ...emptyBrand(), name: "Acme" }, person);
		expect(html).not.toContain("<img");
		expect(html).not.toContain("border-left");
	});
});

describe("renderSignatureText", () => {
	it("lists the filled-in lines only", () => {
		expect(renderSignatureText(preset, person).split("\n")).toEqual([
			"Taylor O'Connor (they/them)",
			"Youth Pastor",
			"Part-time: Tue–Thu",
			"0412 345 678",
			"taylor@example.com",
			`${preset.name} · ${preset.website}`,
			"1 Example St, Geelong VIC",
		]);
		expect(renderSignatureText({ ...emptyBrand(), name: "" }, { ...emptyPerson(), name: "Sam" })).toBe("Sam");
	});
});

describe("prefill links", () => {
	it("parses only the person fields present", () => {
		expect(parsePrefill("?name=Sam%20Lee&phone=0412345678&role=")).toEqual({ name: "Sam Lee", phone: "0412345678" });
		expect(parsePrefill(new URLSearchParams("line=Tue%E2%80%93Thu"))).toEqual({ extraLine: "Tue–Thu" });
	});
});
