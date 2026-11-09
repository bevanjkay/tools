interface Env {
	/**
	 * Comma-separated origins allowed to call the worker, e.g. `https://example.com`;
	 * `https://*.example.pages.dev` also matches any subdomain. Empty allows any caller.
	 */
	ALLOWED_ORIGINS?: string;
}

const ICON_LINK_RE = /<link[^>]+rel\s*=\s*["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/gi;
const MANIFEST_LINK_RE = /<link[^>]+rel\s*=\s*["']manifest["'][^>]*>/gi;
const HREF_RE = /\bhref\s*=\s*["']([^"']+)["']/i;
const ICON_FILE_RE = /\.(?:ico|png|svg|webp|jpe?g|gif|webmanifest)(?:\?|$)/i;
const OG_IMAGE_RE = /<meta[^>]+property\s*=\s*["']og:image(?::secure_url)?["'][^>]*>/gi;
const TWITTER_IMAGE_RE = /<meta[^>]+name\s*=\s*["']twitter:image(?::src)?["'][^>]*>/gi;
const CONTENT_RE = /\bcontent\s*=\s*["']([^"']+)["']/i;

const USER_AGENT = "tools-favicon-proxy/1.0";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_PROXY_BYTES = 10 * 1024 * 1024;

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
// Loopback, link-local, RFC 1918, CGNAT and "this network" ranges.
const PRIVATE_IPV4_RE = /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
const PRIVATE_IPV6_RE = /^(?:::1?$|f[cd]|fe[89ab]|::ffff:)/i;

function isBlockedHost(hostname: string) {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))
		return true;
	if (IPV4_RE.test(host))
		return PRIVATE_IPV4_RE.test(host);
	if (host.includes(":"))
		return PRIVATE_IPV6_RE.test(host);
	return false;
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
	if (isBlockedHost(target.hostname))
		return null;
	return target;
}

function allowedOrigins(env: Env) {
	return (env.ALLOWED_ORIGINS ?? "").split(",").map(origin => origin.trim()).filter(Boolean);
}

// `<img>` requests carry no Origin header, so fall back to the Referer's origin.
function clientOrigin(request: Request) {
	const source = request.headers.get("origin") ?? request.headers.get("referer");
	if (!source)
		return null;
	try {
		return new URL(source).origin;
	}
	catch {
		return null;
	}
}

function originMatches(origin: string, pattern: string) {
	if (!pattern.includes("*"))
		return origin === pattern;
	const [scheme, host] = pattern.split("://");
	const suffix = host?.replace(/^\*\./, "") ?? "";
	try {
		const url = new URL(origin);
		return url.protocol === `${scheme}:` && (url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
	}
	catch {
		return false;
	}
}

function isAllowedClient(request: Request, env: Env) {
	const allowed = allowedOrigins(env);
	if (allowed.length === 0)
		return true;
	const origin = clientOrigin(request);
	return origin !== null && allowed.some(pattern => originMatches(origin, pattern));
}

function corsHeaders(request: Request) {
	return {
		"access-control-allow-origin": request.headers.get("origin") ?? "*",
		"access-control-allow-methods": "GET,OPTIONS",
		"vary": "origin",
	};
}

function json(request: Request, body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...corsHeaders(request) },
	});
}

/** Follow redirects by hand so every hop is checked against the blocklist. */
async function fetchChecked(target: URL) {
	let url = target;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		const response = await fetch(url.toString(), {
			redirect: "manual",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { "user-agent": USER_AGENT },
		});
		const location = response.headers.get("location");
		if (response.status < 300 || response.status >= 400 || !location)
			return response;
		await response.body?.cancel();
		const next = parseTarget(toAbsoluteUrl(location, url));
		if (!next)
			throw new Error("Redirected to a blocked address");
		url = next;
	}
	throw new Error("Too many redirects");
}

/** Buffer a body, giving up (null) once it exceeds `maxBytes`. */
async function readCapped(response: Response, maxBytes: number) {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > maxBytes) {
		await response.body?.cancel();
		return null;
	}
	const reader = response.body?.getReader();
	if (!reader)
		return new Uint8Array(0);
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done)
			break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

async function fetchText(url: string, maxBytes: number) {
	const target = parseTarget(url);
	if (!target)
		return null;
	const response = await fetchChecked(target);
	if (!response.ok)
		return null;
	const bytes = await readCapped(response, maxBytes);
	return bytes ? new TextDecoder().decode(bytes) : null;
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
		const content = match[0].match(CONTENT_RE)?.[1]?.trim();
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
		const href = match[0].match(HREF_RE)?.[1];
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
		const text = await fetchText(manifestUrl, MAX_HTML_BYTES);
		if (!text)
			return [];
		const payload = JSON.parse(text) as { icons?: Array<{ src?: string }> };
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

async function handleDiscover(request: Request, requestUrl: URL) {
	const target = parseTarget(requestUrl.searchParams.get("url")?.trim() || null);
	if (!target)
		return json(request, { error: "Invalid URL" }, 400);

	const origin = `${target.protocol}//${target.host}`;
	const candidates = new Set<string>(standardCandidates(origin));
	const manifestCandidates = new Set<string>([
		`${origin}/site.webmanifest`,
		`${origin}/manifest.webmanifest`,
	]);
	const socialImages = new Set<string>();

	try {
		const html = await fetchText(target.toString(), MAX_HTML_BYTES);
		if (html) {
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

	return json(request, {
		host: target.hostname,
		origin,
		candidates: [...candidates].filter(candidate => ICON_FILE_RE.test(candidate)),
		socialImages: [...socialImages],
	});
}

async function handleProxy(request: Request, requestUrl: URL) {
	const target = parseTarget(requestUrl.searchParams.get("url")?.trim() || null);
	if (!target)
		return json(request, { error: "Invalid URL" }, 400);

	try {
		const response = await fetchChecked(target);
		if (!response.ok)
			return json(request, { error: `Upstream response ${response.status}` }, 502);
		const body = await readCapped(response, MAX_PROXY_BYTES);
		if (!body)
			return json(request, { error: "Upstream resource is too large" }, 502);

		return new Response(body, {
			headers: {
				"content-type": response.headers.get("content-type") || "application/octet-stream",
				"cache-control": "public, max-age=3600",
				...corsHeaders(request),
			},
		});
	}
	catch {
		return json(request, { error: "Failed to fetch upstream resource" }, 502);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: { ...corsHeaders(request), "access-control-allow-headers": "content-type" },
			});
		}

		if (url.pathname === "/health")
			return json(request, { ok: true });
		if (!isAllowedClient(request, env))
			return json(request, { error: "Forbidden" }, 403);
		if (url.pathname === "/discover")
			return handleDiscover(request, url);
		if (url.pathname === "/proxy")
			return handleProxy(request, url);

		return json(request, { error: "Not found" }, 404);
	},
} satisfies ExportedHandler<Env>;
