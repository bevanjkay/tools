interface Env {}

const ICON_LINK_RE = /<link[^>]+rel\s*=\s*["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/gi;
const MANIFEST_LINK_RE = /<link[^>]+rel\s*=\s*["']manifest["'][^>]*>/gi;
const HREF_RE = /\bhref\s*=\s*["']([^"']+)["']/i;
const ICON_FILE_RE = /\.(?:ico|png|svg|webp|jpe?g|gif|webmanifest)(?:\?|$)/i;
const OG_IMAGE_RE = /<meta[^>]+property\s*=\s*["']og:image(?::secure_url)?["'][^>]*>/gi;
const TWITTER_IMAGE_RE = /<meta[^>]+name\s*=\s*["']twitter:image(?::src)?["'][^>]*>/gi;
const CONTENT_RE = /\bcontent\s*=\s*["']([^"']+)["']/i;

const BLOCKED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json",
			"access-control-allow-origin": "*",
			"access-control-allow-methods": "GET,OPTIONS",
		},
	});
}

function toAbsoluteUrl(input: string, base: URL) {
	try {
		return new URL(input, base).toString();
	}
	catch {
		return null;
	}
}

function extractMetaContent(html: string, regex: RegExp, base: URL) {
	const results: string[] = [];
	for (const match of html.matchAll(regex)) {
		const tag = match[0];
		const contentMatch = tag.match(CONTENT_RE);
		const content = contentMatch?.[1]?.trim();
		if (!content)
			continue;
		const absolute = toAbsoluteUrl(content, base);
		if (absolute && (absolute.startsWith("http://") || absolute.startsWith("https://")))
			results.push(absolute);
	}
	return results;
}

function extractHrefTags(html: string, regex: RegExp, base: URL) {
	const results: string[] = [];
	for (const match of html.matchAll(regex)) {
		const tag = match[0];
		const hrefMatch = tag.match(HREF_RE);
		const href = hrefMatch?.[1];
		if (!href)
			continue;
		const absolute = toAbsoluteUrl(href, base);
		if (absolute)
			results.push(absolute);
	}
	return results;
}

function standardCandidates(origin: string) {
	return [
		`${origin}/favicon.ico`,
		`${origin}/favicon.png`,
		`${origin}/favicon.svg`,
		`${origin}/favicon-16x16.png`,
		`${origin}/favicon-32x32.png`,
		`${origin}/apple-touch-icon.png`,
		`${origin}/apple-touch-icon-precomposed.png`,
		`${origin}/android-chrome-192x192.png`,
		`${origin}/android-chrome-512x512.png`,
		`${origin}/icon-192.png`,
		`${origin}/icon-512.png`,
		`${origin}/site.webmanifest`,
		`${origin}/manifest.webmanifest`,
	];
}

async function fetchManifestIcons(manifestUrl: string, base: URL) {
	try {
		const response = await fetch(manifestUrl, {
			redirect: "follow",
			headers: {
				"user-agent": "tools-favicon-proxy/1.0",
			},
		});
		if (!response.ok)
			return [];
		const payload = await response.json() as { icons?: Array<{ src?: string }> };
		return payload.icons
			?.map(icon => icon.src)
			.filter((src): src is string => Boolean(src))
			.map(src => toAbsoluteUrl(src, base))
			.filter((url): url is string => Boolean(url)) ?? [];
	}
	catch {
		return [];
	}
}

function parseTarget(raw: string | null) {
	if (!raw)
		return null;
	let target: URL;
	try {
		target = new URL(raw);
	}
	catch {
		return null;
	}
	if (!["http:", "https:"].includes(target.protocol))
		return null;
	if (BLOCKED_HOSTNAMES.has(target.hostname))
		return null;
	return target;
}

async function handleDiscover(requestUrl: URL) {
	const target = parseTarget(requestUrl.searchParams.get("url")?.trim() || null);
	if (!target)
		return json({ error: "Invalid URL" }, 400);

	const origin = `${target.protocol}//${target.host}`;
	const candidates = new Set<string>(standardCandidates(origin));
	const manifestCandidates = new Set<string>([
		`${origin}/site.webmanifest`,
		`${origin}/manifest.webmanifest`,
	]);
	const socialImages = new Set<string>();

	try {
		const pageResponse = await fetch(target.toString(), {
			redirect: "follow",
			headers: {
				"user-agent": "tools-favicon-proxy/1.0",
			},
		});
		if (pageResponse.ok) {
			const html = await pageResponse.text();
			extractHrefTags(html, ICON_LINK_RE, target).forEach(link => candidates.add(link));
			extractHrefTags(html, MANIFEST_LINK_RE, target).forEach(link => manifestCandidates.add(link));
			extractMetaContent(html, OG_IMAGE_RE, target).forEach(url => socialImages.add(url));
			extractMetaContent(html, TWITTER_IMAGE_RE, target).forEach(url => socialImages.add(url));
		}
	}
	catch {
		// continue with base candidates
	}

	for (const manifestUrl of manifestCandidates) {
		const icons = await fetchManifestIcons(manifestUrl, target);
		icons.forEach(icon => candidates.add(icon));
	}

	const filtered = [...candidates].filter(candidate => ICON_FILE_RE.test(candidate));

	return json({
		host: target.hostname,
		origin,
		candidates: filtered,
		socialImages: [...socialImages],
	});
}

async function handleProxy(requestUrl: URL) {
	const target = parseTarget(requestUrl.searchParams.get("url")?.trim() || null);
	if (!target)
		return json({ error: "Invalid URL" }, 400);

	try {
		const response = await fetch(target.toString(), {
			redirect: "follow",
			headers: {
				"user-agent": "tools-favicon-proxy/1.0",
			},
		});
		if (!response.ok)
			return json({ error: `Upstream response ${response.status}` }, 502);

		return new Response(await response.arrayBuffer(), {
			headers: {
				"content-type": response.headers.get("content-type") || "application/octet-stream",
				"cache-control": "public, max-age=3600",
				"access-control-allow-origin": "*",
				"access-control-allow-methods": "GET,OPTIONS",
			},
		});
	}
	catch {
		return json({ error: "Failed to fetch upstream resource" }, 502);
	}
}

export default {
	async fetch(request: Request, _env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"access-control-allow-origin": "*",
					"access-control-allow-methods": "GET,OPTIONS",
					"access-control-allow-headers": "content-type",
				},
			});
		}

		if (url.pathname === "/health")
			return json({ ok: true });
		if (url.pathname === "/discover")
			return handleDiscover(url);
		if (url.pathname === "/proxy")
			return handleProxy(url);

		return json({ error: "Not found" }, 404);
	},
};
