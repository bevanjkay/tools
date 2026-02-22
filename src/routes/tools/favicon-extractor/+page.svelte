<script lang="ts">
	import { base } from "$app/paths";
	import JSZip from "jszip";

	type IconCandidate = {
		id: string;
		url: string;
		fetchUrl: string;
		width: number;
		height: number;
		type: string;
		source: string;
		selected: boolean;
	};

	const PROXY_BASE = (import.meta.env.PUBLIC_FAVICON_PROXY_BASE || "").trim().replace(/\/$/, "");
	const proxyConfigured = Boolean(PROXY_BASE);

	let targetUrl = $state("");
	let hostName = $state("");
	let icons = $state<IconCandidate[]>([]);
	let loading = $state(false);
	let downloading = $state(false);
	let error = $state("");
	let info = $state("");
	let scannedCount = $state(0);
	let scanTotal = $state(0);

	const discoveredCount = $derived(icons.length);
	const selectedCount = $derived(icons.filter(icon => icon.selected).length);

	function normalizeUrl(value: string) {
		const raw = value.trim();
		if (!raw)
			return null;
		const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
		try {
			return new URL(withProtocol);
		}
		catch {
			return null;
		}
	}

	function fileTypeFromUrl(url: string) {
		const path = url.split("?")[0].toLowerCase();
		if (path.endsWith(".svg"))
			return "SVG";
		if (path.endsWith(".png"))
			return "PNG";
		if (path.endsWith(".ico"))
			return "ICO";
		if (path.endsWith(".webp"))
			return "WebP";
		if (path.endsWith(".jpg") || path.endsWith(".jpeg"))
			return "JPEG";
		if (path.endsWith(".gif"))
			return "GIF";
		return "Unknown";
	}

	function fileNameFromUrl(url: string, fallback: string, index: number) {
		try {
			const parsed = new URL(url);
			const segment = parsed.pathname.split("/").filter(Boolean).pop();
			if (segment)
				return segment;
		}
		catch {
		// ignore and use fallback
		}
		return `${fallback}_${String(index + 1).padStart(2, "0")}.ico`;
	}

	async function loadImage(url: string): Promise<{ width: number; height: number }> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				resolve({ width: img.naturalWidth, height: img.naturalHeight });
			};
			img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
			img.src = url;
		});
	}

	async function discoverFromManifest(manifestUrl: string, origin: string) {
		try {
			const response = await fetch(manifestUrl);
			if (!response.ok)
				return [];
			const manifest = await response.json() as { icons?: Array<{ src?: string }> };
			return manifest.icons
				?.map(icon => icon.src)
				.filter((src): src is string => Boolean(src))
				.map(src => new URL(src, origin).toString()) ?? [];
		}
		catch {
			return [];
		}
	}

	async function discoverFromHtml(pageUrl: string, origin: string) {
		try {
			const response = await fetch(pageUrl);
			if (!response.ok)
				return [];
			const html = await response.text();
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, "text/html");
			const iconLinks = Array.from(doc.querySelectorAll("link[rel]"))
				.filter((link) => {
					const rel = (link.getAttribute("rel") || "").toLowerCase();
					return rel.includes("icon") || rel.includes("apple-touch-icon");
				})
				.map(link => link.getAttribute("href"))
				.filter((href): href is string => Boolean(href))
				.map(href => new URL(href, origin).toString());
			const manifestLinks = Array.from(doc.querySelectorAll("link[rel='manifest']"))
				.map(link => link.getAttribute("href"))
				.filter((href): href is string => Boolean(href))
				.map(href => new URL(href, origin).toString());
			return [...iconLinks, ...manifestLinks];
		}
		catch {
			return [];
		}
	}

	function toDiscoverUrl(target: string) {
		return `${PROXY_BASE}/discover?url=${encodeURIComponent(target)}`;
	}

	function toProxyUrl(target: string) {
		return `${PROXY_BASE}/proxy?url=${encodeURIComponent(target)}`;
	}

	async function extractFavicons() {
		const parsed = normalizeUrl(targetUrl);
		if (!parsed) {
			error = "Please enter a valid domain or URL";
			return;
		}

		loading = true;
		error = "";
		info = "";
		icons = [];
		scannedCount = 0;
		scanTotal = 0;
		hostName = parsed.hostname;

		const origin = `${parsed.protocol}//${parsed.host}`;
		const candidates = new Set<string>([
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
		]);

		let usedProxyDiscovery = false;
		if (proxyConfigured) {
			try {
				const response = await fetch(toDiscoverUrl(parsed.toString()));
				if (response.ok) {
					const payload = await response.json() as { host?: string; candidates?: string[] };
					if (payload.host)
						hostName = payload.host;
					payload.candidates?.forEach(url => candidates.add(url));
					usedProxyDiscovery = true;
				}
			}
			catch {
			// fall back to browser-only discovery
			}
		}

		if (!usedProxyDiscovery) {
			const htmlDiscovered = await discoverFromHtml(origin, origin);
			htmlDiscovered.forEach(url => candidates.add(url));

			const manifestUrls = [
				`${origin}/site.webmanifest`,
				`${origin}/manifest.webmanifest`,
				...htmlDiscovered.filter(url => url.endsWith(".webmanifest") || url.includes("manifest")),
			];
			for (const manifestUrl of manifestUrls) {
				const manifestIcons = await discoverFromManifest(manifestUrl, origin);
				manifestIcons.forEach(url => candidates.add(url));
			}
			if (proxyConfigured) {
				info = "Proxy discovery unavailable; used browser-only extraction for this scan.";
			}
		}

		const list = Array.from(candidates)
			.filter(url => /\.(?:ico|png|svg|webp|jpe?g|gif)(?:\?|$)/i.test(url));
		scanTotal = list.length;

		const found: IconCandidate[] = [];
		for (let index = 0; index < list.length; index += 1) {
			const url = list[index];
			scannedCount = index + 1;
			try {
				const fetchUrl = proxyConfigured ? toProxyUrl(url) : url;
				const size = await loadImage(fetchUrl);
				found.push({
					id: `${index}-${url}`,
					url,
					fetchUrl,
					width: size.width,
					height: size.height,
					type: fileTypeFromUrl(url),
					source: url.includes("apple-touch")
						? "Apple Touch"
						: url.includes("android") || url.includes("icon-")
						? "Manifest/Android"
						: url.includes("favicon")
						? "Favicon"
						: "Link Tag",
					selected: true,
				});
			}
			catch {
			// ignore non-loadable candidates
			}
		}

		const deduped = new Map<string, IconCandidate>();
		for (const icon of found) {
			const key = `${icon.url}-${icon.width}x${icon.height}`;
			if (!deduped.has(key))
				deduped.set(key, icon);
		}

		icons = Array.from(deduped.values()).sort((a, b) => (b.width * b.height) - (a.width * a.height));

		if (icons.length === 0) {
			error = proxyConfigured
				? "No favicons found. This site may block access or not expose icon files."
				: "No favicons found. Without a proxy, cross-origin restrictions may block detection.";
		}
		else {
			info = `Found ${icons.length} icon${icons.length === 1 ? "" : "s"} for ${hostName}`;
		}

		loading = false;
	}

	function toggleSelect(id: string) {
		icons = icons.map(icon => icon.id === id ? { ...icon, selected: !icon.selected } : icon);
	}

	function selectAll() {
		icons = icons.map(icon => ({ ...icon, selected: true }));
	}

	function clearSelection() {
		icons = icons.map(icon => ({ ...icon, selected: false }));
	}

	async function downloadIcons(mode: "selected" | "all") {
		const targets = mode === "all"
			? icons
			: icons.filter(icon => icon.selected);
		if (targets.length === 0)
			return;

		downloading = true;
		error = "";
		info = "";

		try {
			const zip = new JSZip();
			let added = 0;
			for (let index = 0; index < targets.length; index += 1) {
				const icon = targets[index];
				try {
					const response = await fetch(icon.fetchUrl);
					if (!response.ok)
						continue;
					const blob = await response.blob();
					const fileName = fileNameFromUrl(icon.url, `${hostName || "favicon"}_${icon.width}x${icon.height}`, index);
					zip.file(fileName, blob);
					added += 1;
				}
				catch {
				// ignore blocked icons
				}
			}

			if (added === 0) {
				error = proxyConfigured
					? "Could not download icons from upstream responses."
					: "Could not download icons directly. Configure a proxy to bypass CORS limits.";
				return;
			}

			const zipBlob = await zip.generateAsync({ type: "blob" });
			const url = URL.createObjectURL(zipBlob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${hostName || "favicons"}_icons.zip`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			if (added < targets.length) {
				info = `Downloaded ${added}/${targets.length} icons.`;
			}
			else {
				info = `Downloaded ${added} icon${added === 1 ? "" : "s"}.`;
			}
		}
		catch (e) {
			error = (e as Error).message || "Failed to create ZIP file";
		}
		finally {
			downloading = false;
		}
	}
</script>

<svelte:head>
	<title>Favicon Extractor</title>
</svelte:head>

<main class="page-container">
	<a href="{base}/" class="back-link">← Back to Tools</a>

	<h1>🌐 Favicon Extractor</h1>
	<p class="subtitle">Extract favicon and app icon files from any public website.</p>

	<section class="card-section">
		<h2>Website URL</h2>
		<p class="text-muted proxy-note">
			{#if proxyConfigured}
				Proxy mode enabled via `PUBLIC_FAVICON_PROXY_BASE`.
			{:else}
				Browser-only mode. Set `PUBLIC_FAVICON_PROXY_BASE` to a Cloudflare Worker URL for reliable cross-origin support.
			{/if}
		</p>
		<div class="url-row">
			<input
				type="text"
				bind:value={targetUrl}
				placeholder="example.com or https://example.com"
				onkeydown={(event) => {
					if (event.key === "Enter")
						void extractFavicons();
				}}
			/>
			<button class="btn btn-primary" type="button" onclick={extractFavicons} disabled={loading || downloading}>
				{#if loading}
					<span class="spinner"></span>
					Scanning...
				{:else}
					Extract Icons
				{/if}
			</button>
		</div>
		{#if loading}
			<p class="text-muted">Scanned {scannedCount}/{scanTotal || "?"} icon paths...</p>
		{/if}
	</section>

	{#if error}
		<div class="error-message">⚠️ {error}</div>
	{/if}

	{#if info && !error}
		<div class="info-message">✅ {info}</div>
	{/if}

	{#if discoveredCount > 0}
		<section class="card-section">
			<div class="header-row">
				<h2>Discovered Icons ({discoveredCount})</h2>
				<div class="header-actions">
					<button type="button" class="btn" onclick={selectAll}>Select All</button>
					<button type="button" class="btn" onclick={clearSelection}>Clear</button>
				</div>
			</div>

			<div class="action-row">
				<button
					type="button"
					class="btn btn-primary"
					disabled={selectedCount === 0 || downloading}
					onclick={() => downloadIcons("selected")}
				>
					Download Selected ({selectedCount})
				</button>
				<button
					type="button"
					class="btn"
					disabled={discoveredCount === 0 || downloading}
					onclick={() => downloadIcons("all")}
				>
					Download All
				</button>
			</div>

			<div class="icon-grid">
				{#each icons as icon}
					<article class="icon-card" class:selected={icon.selected}>
						<label class="icon-header">
							<input type="checkbox" checked={icon.selected} onchange={() => toggleSelect(icon.id)} />
							<span>{icon.width}×{icon.height}</span>
							<span class="text-muted">{icon.type}</span>
						</label>
						<div class="preview-wrap">
							<img src={icon.fetchUrl} alt="Favicon preview" loading="lazy" />
						</div>
						<div class="icon-meta text-muted">
							<span>{icon.source}</span>
							<a href={icon.url} target="_blank" rel="noopener noreferrer">Open URL ↗</a>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}
</main>

<style>
	.url-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.75rem;
	}

	.proxy-note {
		margin-bottom: 0.75rem;
	}

	.info-message {
		background: #e6fffa;
		color: #0f766e;
		padding: 0.8rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.header-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.header-row h2 {
		margin: 0;
	}

	.header-actions,
	.action-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.action-row {
		margin-bottom: 1rem;
	}

	.icon-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 0.75rem;
	}

	.icon-card {
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 0.75rem;
		background: white;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.icon-card.selected {
		border-color: #007acc;
		box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.12);
	}

	.icon-header {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.preview-wrap {
		height: 84px;
		border-radius: 8px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		display: grid;
		place-items: center;
	}

	.preview-wrap img {
		max-width: 72px;
		max-height: 72px;
		object-fit: contain;
	}

	.icon-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
	}

	@media (max-width: 700px) {
		.url-row {
			grid-template-columns: 1fr;
		}

		.header-row {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
