export interface LinkMeta {
	url: string;
	title: string;
	description: string;
	canonical: string;
	favicon: string;
	themeColor: string;
	robots: string;
	og: Record<string, string>;
	twitter: Record<string, string>;
}

export interface PreviewCard {
	title: string;
	description: string;
	image: string;
	imageAlt: string;
	siteName: string;
	domain: string;
}

export interface Check {
	level: "error" | "warning" | "ok";
	message: string;
}

const HTTP_PROTOCOL_RE = /^https?:\/\//i;
const WWW_RE = /^www\./;

export const RECOMMENDED_IMAGE = { width: 1200, height: 630 };
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

export function normalizeUrl(value: string) {
	const raw = value.trim();
	if (!raw)
		return null;
	try {
		const url = new URL(HTTP_PROTOCOL_RE.test(raw) ? raw : `https://${raw}`);
		return url.hostname.includes(".") ? url : null;
	}
	catch {
		return null;
	}
}

function absolute(value: string | null | undefined, base: string) {
	const trimmed = value?.trim();
	if (!trimmed)
		return "";
	try {
		return new URL(trimmed, base).toString();
	}
	catch {
		return trimmed;
	}
}

export function parseLinkMeta(html: string, pageUrl: string): LinkMeta {
	const doc = new DOMParser().parseFromString(html, "text/html");
	const base = absolute(doc.querySelector("base[href]")?.getAttribute("href"), pageUrl) || pageUrl;

	const og: Record<string, string> = {};
	const twitter: Record<string, string> = {};
	const named: Record<string, string> = {};
	for (const meta of doc.querySelectorAll("meta")) {
		const key = (meta.getAttribute("property") || meta.getAttribute("name") || "").trim().toLowerCase();
		const content = meta.getAttribute("content")?.trim() ?? "";
		if (!key || !content)
			continue;
		// First occurrence wins, matching how most scrapers behave.
		const target = key.startsWith("og:") ? og : key.startsWith("twitter:") ? twitter : named;
		target[key] ??= content;
	}

	for (const key of ["og:image", "og:image:url", "og:image:secure_url", "og:url"]) {
		if (og[key])
			og[key] = absolute(og[key], base);
	}
	for (const key of ["twitter:image", "twitter:image:src"]) {
		if (twitter[key])
			twitter[key] = absolute(twitter[key], base);
	}

	const iconHref = doc.querySelector("link[rel~='icon']")?.getAttribute("href")
		?? doc.querySelector("link[rel~='apple-touch-icon']")?.getAttribute("href");

	return {
		url: pageUrl,
		title: doc.querySelector("title")?.textContent?.trim() ?? "",
		description: named.description ?? "",
		canonical: absolute(doc.querySelector("link[rel~='canonical']")?.getAttribute("href"), base),
		favicon: iconHref ? absolute(iconHref, base) : absolute("/favicon.ico", pageUrl),
		themeColor: named["theme-color"] ?? "",
		robots: named.robots ?? "",
		og,
		twitter,
	};
}

function domainOf(url: string) {
	try {
		return new URL(url).hostname.replace(WWW_RE, "");
	}
	catch {
		return url;
	}
}

export function ogImage(meta: LinkMeta) {
	return meta.og["og:image"] || meta.og["og:image:url"] || meta.og["og:image:secure_url"] || "";
}

/** What Facebook, LinkedIn, iMessage, WhatsApp and Slack broadly show. */
export function openGraphCard(meta: LinkMeta): PreviewCard {
	return {
		title: meta.og["og:title"] || meta.title,
		description: meta.og["og:description"] || meta.description,
		image: ogImage(meta),
		imageAlt: meta.og["og:image:alt"] ?? "",
		siteName: meta.og["og:site_name"] ?? "",
		domain: domainOf(meta.og["og:url"] || meta.canonical || meta.url),
	};
}

/** X falls back to Open Graph for anything missing from `twitter:*`. */
export function xCard(meta: LinkMeta): PreviewCard & { large: boolean } {
	const card = openGraphCard(meta);
	const type = meta.twitter["twitter:card"] || (card.image ? "summary_large_image" : "summary");
	return {
		...card,
		title: meta.twitter["twitter:title"] || card.title,
		description: meta.twitter["twitter:description"] || card.description,
		image: meta.twitter["twitter:image"] || meta.twitter["twitter:image:src"] || card.image,
		imageAlt: meta.twitter["twitter:image:alt"] || card.imageAlt,
		large: type === "summary_large_image",
	};
}

export function checkLinkMeta(meta: LinkMeta, image?: { width: number; height: number } | null): Check[] {
	const checks: Check[] = [];
	const add = (level: Check["level"], message: string) => checks.push({ level, message });

	if (!meta.title)
		add("error", "Missing <title>");
	else if (meta.title.length > TITLE_MAX)
		add("warning", `<title> is ${meta.title.length} characters; Google usually truncates after about ${TITLE_MAX}`);

	if (!meta.description)
		add("warning", "Missing meta description");
	else if (meta.description.length > DESCRIPTION_MAX)
		add("warning", `Meta description is ${meta.description.length} characters; Google usually truncates after about ${DESCRIPTION_MAX}`);

	if (!meta.og["og:title"])
		add("warning", "Missing og:title (falls back to <title>)");
	if (!meta.og["og:description"])
		add("warning", "Missing og:description (falls back to meta description)");

	const imageUrl = ogImage(meta);
	if (!imageUrl) {
		add("error", "Missing og:image, so most platforms show no image");
	}
	else {
		if (imageUrl.startsWith("http://"))
			add("warning", "og:image uses http://; some platforms only load https images");
		if (image === null)
			add("error", "og:image could not be loaded");
		else if (image && (image.width < RECOMMENDED_IMAGE.width || image.height < RECOMMENDED_IMAGE.height))
			add("warning", `og:image is ${image.width} × ${image.height}; ${RECOMMENDED_IMAGE.width} × ${RECOMMENDED_IMAGE.height} or larger is recommended`);
		else if (image)
			add("ok", `og:image is ${image.width} × ${image.height}`);
		if (!meta.og["og:image:alt"])
			add("warning", "Missing og:image:alt");
	}

	if (!meta.og["og:url"])
		add("warning", "Missing og:url");
	if (!meta.twitter["twitter:card"])
		add("warning", "Missing twitter:card; X will guess the card type");
	if (!meta.canonical)
		add("warning", "Missing canonical link");
	else if (domainOf(meta.canonical) !== domainOf(meta.url))
		add("warning", `Canonical points to another domain (${domainOf(meta.canonical)})`);
	if (meta.robots.toLowerCase().includes("noindex"))
		add("error", `Page is set to noindex (robots: ${meta.robots})`);

	if (!checks.some(check => check.level !== "ok"))
		add("ok", "All recommended tags are present");
	return checks;
}
