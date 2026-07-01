<script lang="ts">
	import { resolve as resolvePath } from "$app/paths";
	import { env } from "$env/dynamic/public";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Input } from "$lib/components/ui/input";
	import { cn } from "$lib/utils";
	import { Globe, LoaderCircle } from "@lucide/svelte";
	import JSZip from "jszip";
	import { SvelteMap, SvelteSet } from "svelte/reactivity";

	type IconCandidate = {
		id: string;
		url: string;
		fetchUrl: string;
		width: number;
		height: number;
		type: string;
		source: string;
		category: "favicon" | "social";
		selected: boolean;
	};

	const HTTP_PROTOCOL_RE = /^https?:\/\//i;
	const TRAILING_SLASH_RE = /\/$/;
	const URL_ICON_FILE_RE = /\.(?:ico|png|svg|webp|jpe?g|gif)(?:\?|$)/i;
	const PROXY_BASE = (env.PUBLIC_FAVICON_PROXY_BASE || "").trim().replace(TRAILING_SLASH_RE, "");
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
	const scanProgressPercent = $derived(
		scanTotal > 0
			? Math.min(100, Math.round((scannedCount / scanTotal) * 100))
			: 0,
	);

	function normalizeUrl(value: string) {
		const raw = value.trim();
		if (!raw)
			return null;
		const withProtocol = HTTP_PROTOCOL_RE.test(raw) ? raw : `https://${raw}`;
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
				return { icons: [] as string[], socialImages: [] as string[] };
			const html = await response.text();
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, "text/html");
			const iconLinks = [...doc.querySelectorAll("link[rel]")]
				.filter((link) => {
					const rel = (link.getAttribute("rel") || "").toLowerCase();
					return rel.includes("icon") || rel.includes("apple-touch-icon");
				})
				.map(link => link.getAttribute("href"))
				.filter((href): href is string => Boolean(href))
				.map(href => new URL(href, origin).toString());
			const manifestLinks = Array.from(
				doc.querySelectorAll("link[rel='manifest']"),
				link => link.getAttribute("href"),
			)
				.filter((href): href is string => Boolean(href))
				.map(href => new URL(href, origin).toString());
			const socialImages = [
				...doc.querySelectorAll("meta[property='og:image'], meta[property='og:image:secure_url']"),
				...doc.querySelectorAll("meta[name='twitter:image'], meta[name='twitter:image:src']"),
			]
				.map(meta => meta.getAttribute("content"))
				.filter((content): content is string => Boolean(content))
				.flatMap((content) => {
					try {
						const url = new URL(content, origin);
						return url.protocol === "http:" || url.protocol === "https:" ? [url.toString()] : [];
					}
					catch {
						return [];
					}
				});
			return { icons: [...iconLinks, ...manifestLinks], socialImages };
		}
		catch {
			return { icons: [] as string[], socialImages: [] as string[] };
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
		const candidates = new SvelteSet<string>([
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
		const socialCandidates = new SvelteSet<string>();

		let usedProxyDiscovery = false;
		if (proxyConfigured) {
			try {
				const response = await fetch(toDiscoverUrl(parsed.toString()));
				if (response.ok) {
					const payload = await response.json() as { host?: string; candidates?: string[]; socialImages?: string[] };
					if (payload.host)
						hostName = payload.host;
					payload.candidates?.forEach(url => candidates.add(url));
					payload.socialImages?.forEach(url => socialCandidates.add(url));
					usedProxyDiscovery = true;
				}
			}
			catch {
			// fall back to browser-only discovery
			}
		}

		if (!usedProxyDiscovery) {
			const htmlDiscovered = await discoverFromHtml(parsed.toString(), origin);
			htmlDiscovered.icons.forEach(url => candidates.add(url));
			htmlDiscovered.socialImages.forEach(url => socialCandidates.add(url));

			const manifestUrls = [
				`${origin}/site.webmanifest`,
				`${origin}/manifest.webmanifest`,
				...htmlDiscovered.icons.filter(url => url.endsWith(".webmanifest") || url.includes("manifest")),
			];
			for (const manifestUrl of manifestUrls) {
				const manifestIcons = await discoverFromManifest(manifestUrl, origin);
				manifestIcons.forEach(url => candidates.add(url));
			}
			if (proxyConfigured) {
				info = "Proxy discovery unavailable; used browser-only extraction for this scan.";
			}
		}

		type CandidateEntry = { url: string; category: "favicon" | "social" };
		const list: CandidateEntry[] = [
			...[...candidates].filter(url => URL_ICON_FILE_RE.test(url)).map(url => ({ url, category: "favicon" as const })),
			...Array.from(socialCandidates, url => ({ url, category: "social" as const })),
		];
		scanTotal = list.length;

		const found: IconCandidate[] = [];
		const batchSize = 4;
		for (let offset = 0; offset < list.length; offset += batchSize) {
			const batch = list.slice(offset, offset + batchSize);
			const probeResults = await Promise.allSettled(batch.map(async ({ url, category }, localIndex) => {
				const index = offset + localIndex;
				const fetchUrl = proxyConfigured ? toProxyUrl(url) : url;
				const size = await loadImage(fetchUrl);
				return {
					id: `${index}-${url}`,
					url,
					fetchUrl,
					width: size.width,
					height: size.height,
					type: fileTypeFromUrl(url),
					source: category === "social"
						? "Social Image"
						: url.includes("apple-touch")
						? "Apple Touch"
						: url.includes("android") || url.includes("icon-")
						? "Manifest/Android"
						: url.includes("favicon")
						? "Favicon"
						: "Link Tag",
					category,
					selected: true,
				} satisfies IconCandidate;
			}));
			scannedCount += batch.length;
			probeResults.forEach((result) => {
				if (result.status === "fulfilled")
					found.push(result.value);
			});
		}

		const deduped = new SvelteMap<string, IconCandidate>();
		for (const icon of found) {
			const key = `${icon.url}-${icon.width}x${icon.height}`;
			if (!deduped.has(key))
				deduped.set(key, icon);
		}

		icons = [...deduped.values()].toSorted((a, b) => (b.width * b.height) - (a.width * a.height));

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

<main class="mx-auto max-w-4xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<Globe class="text-primary size-7" />
		Favicon Extractor
	</h1>
	<p class="text-muted-foreground mb-8">Extract favicon and app icon files from any public website.</p>

	<Card.Root class="mb-6">
		<Card.Header>
			<Card.Title>Website URL</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="flex flex-col gap-2 sm:flex-row">
				<Input
					type="text"
					bind:value={targetUrl}
					placeholder="example.com or https://example.com"
					onkeydown={(event) => {
						if (event.key === "Enter")
							void extractFavicons();
					}}
				/>
				<Button class="shrink-0" onclick={extractFavicons} disabled={loading || downloading}>
					{#if loading}
						<LoaderCircle class="size-4 animate-spin" />
						Scanning...
					{:else}
						Extract Icons
					{/if}
				</Button>
			</div>
			{#if loading}
				{#if scanTotal > 0}
					<p class="text-muted-foreground mt-3 text-sm">Scanned {scannedCount}/{scanTotal} icon paths...</p>
					<div class="bg-muted mt-2 h-2 w-full overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scanProgressPercent}>
						<div class="bg-primary h-full transition-all" style="width: {scanProgressPercent}%;"></div>
					</div>
				{:else}
					<p class="text-muted-foreground mt-3 text-sm">Discovering icon paths...</p>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>

	{#if error}
		<div class="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border px-4 py-3 text-sm">⚠️ {error}</div>
	{/if}

	{#if info && !error}
		<div class="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">✅ {info}</div>
	{/if}

	{#if discoveredCount > 0}
		<Card.Root>
			<Card.Header class="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
				<Card.Title>Discovered Icons & Social Images ({discoveredCount})</Card.Title>
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" onclick={selectAll}>Select All</Button>
					<Button variant="outline" size="sm" onclick={clearSelection}>Clear</Button>
				</div>
			</Card.Header>
			<Card.Content>
				<div class="mb-4 flex flex-wrap gap-2">
					<Button disabled={selectedCount === 0 || downloading} onclick={() => downloadIcons("selected")}>
						Download Selected ({selectedCount})
					</Button>
					<Button variant="outline" disabled={discoveredCount === 0 || downloading} onclick={() => downloadIcons("all")}>
						Download All
					</Button>
				</div>

				<div class="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
					{#each icons as icon (icon.id)}
						<article class={cn("bg-card flex flex-col gap-2.5 rounded-lg border p-3", icon.selected ? "border-primary ring-primary/20 ring-2" : "border-border")}>
							<label class="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm">
								<Checkbox checked={icon.selected} onCheckedChange={() => toggleSelect(icon.id)} />
								<span>{icon.width}×{icon.height}</span>
								<span class="text-muted-foreground">{icon.type}</span>
							</label>
							<div class={cn("bg-muted grid place-items-center rounded-md border", icon.category === "social" ? "h-28" : "h-20")}>
								<img src={icon.fetchUrl} alt="Icon preview" loading="lazy" class={cn("object-contain", icon.category === "social" ? "max-h-24 max-w-full" : "max-h-[72px] max-w-[72px]")} />
							</div>
							<div class="text-muted-foreground flex items-center justify-between gap-2 text-xs">
								<span>{icon.source}</span>
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={icon.url} class="hover:text-foreground" target="_blank" rel="noopener noreferrer">Open URL ↗</a>
							</div>
						</article>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</main>
