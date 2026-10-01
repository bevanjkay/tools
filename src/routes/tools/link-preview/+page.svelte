<script lang="ts">
	import type { Check, LinkMeta } from "$lib/link-preview";
	import { resolve as resolvePath } from "$app/paths";
	import { env } from "$env/dynamic/public";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { checkLinkMeta, normalizeUrl, ogImage, openGraphCard, parseLinkMeta, xCard } from "$lib/link-preview";
	import { CircleCheck, CircleX, LoaderCircle, Share2, TriangleAlert } from "@lucide/svelte";

	const TRAILING_SLASH_RE = /\/$/;
	const PROXY_BASE = (env.PUBLIC_FAVICON_PROXY_BASE || "").trim().replace(TRAILING_SLASH_RE, "");

	let targetUrl = $state("");
	let loading = $state(false);
	let error = $state("");
	let meta = $state<LinkMeta | null>(null);
	// `undefined` while loading or absent, `null` if the image failed to load.
	let imageSize = $state<{ width: number; height: number } | null | undefined>(undefined);

	const ogCard = $derived(meta ? openGraphCard(meta) : null);
	const twitterCard = $derived(meta ? xCard(meta) : null);
	const checks = $derived<Check[]>(meta ? checkLinkMeta(meta, imageSize) : []);
	const tagRows = $derived(meta
		? [
			["title", meta.title],
			["description", meta.description],
			["canonical", meta.canonical],
			["robots", meta.robots],
			["theme-color", meta.themeColor],
			...Object.entries(meta.og),
			...Object.entries(meta.twitter),
		].filter(([, value]) => value)
		: []);

	async function fetchHtml(url: URL) {
		const response = await fetch(PROXY_BASE ? `${PROXY_BASE}/proxy?url=${encodeURIComponent(url.toString())}` : url.toString());
		if (!response.ok)
			throw new Error(`The page responded with an error (${response.status})`);
		return response.text();
	}

	function measureImage(src: string) {
		imageSize = undefined;
		if (!src)
			return;
		const img = new Image();
		img.onload = () => {
			if (src === (meta && ogImage(meta)))
				imageSize = { width: img.naturalWidth, height: img.naturalHeight };
		};
		img.onerror = () => {
			if (src === (meta && ogImage(meta)))
				imageSize = null;
		};
		img.src = src;
	}

	async function checkLink() {
		const url = normalizeUrl(targetUrl);
		if (!url) {
			error = "Enter a valid URL, such as example.com";
			return;
		}
		targetUrl = url.toString();
		loading = true;
		error = "";
		meta = null;
		try {
			meta = parseLinkMeta(await fetchHtml(url), url.toString());
			measureImage(ogImage(meta));
		}
		catch (e) {
			error = PROXY_BASE
				? `Couldn't fetch that page. ${(e as Error).message}`
				: "Couldn't fetch that page. Most sites block direct browser requests; set PUBLIC_FAVICON_PROXY_BASE to use the proxy.";
		}
		finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Link Preview Checker</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<Share2 class="text-primary size-7" />
		Link Preview Checker
	</h1>
	<p class="text-muted-foreground mb-8">See how a page will look when shared, and which meta tags are missing.</p>

	<Card.Root class="mb-6">
		<Card.Header>
			<Card.Title>Page URL</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="flex flex-col gap-2 sm:flex-row">
				<Input
					type="text"
					bind:value={targetUrl}
					placeholder="example.com/page"
					onkeydown={(event) => {
						if (event.key === "Enter")
							void checkLink();
					}}
				/>
				<Button class="shrink-0" onclick={checkLink} disabled={loading}>
					{#if loading}
						<LoaderCircle class="size-4 animate-spin" />
						Checking...
					{:else}
						Check Link
					{/if}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>

	{#if error}
		<div class="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border px-4 py-3 text-sm">⚠️ {error}</div>
	{/if}

	{#if meta && ogCard && twitterCard}
		<Card.Root class="mb-6">
			<Card.Header>
				<Card.Title>Checks</Card.Title>
			</Card.Header>
			<Card.Content>
				<ul class="space-y-2 text-sm">
					{#each checks as check (check.message)}
						<li class="flex items-start gap-2">
							{#if check.level === "error"}
								<CircleX class="text-destructive mt-0.5 size-4 shrink-0" />
							{:else if check.level === "warning"}
								<TriangleAlert class="mt-0.5 size-4 shrink-0 text-amber-500" />
							{:else}
								<CircleCheck class="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
							{/if}
							{check.message}
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>

		<div class="mb-6 grid gap-6 md:grid-cols-2">
			<section>
				<h2 class="mb-2 font-semibold">Facebook, LinkedIn & messaging apps</h2>
				<div class="bg-card overflow-hidden rounded-lg border">
					{#if ogCard.image}
						<img src={ogCard.image} alt={ogCard.imageAlt} class="bg-muted aspect-[1.91/1] w-full object-cover" />
					{/if}
					<div class="bg-muted/60 space-y-0.5 px-3 py-2.5">
						<p class="text-muted-foreground text-xs uppercase">{ogCard.domain}</p>
						<p class="line-clamp-2 font-semibold">{ogCard.title || ogCard.domain}</p>
						{#if ogCard.description}
							<p class="text-muted-foreground line-clamp-1 text-sm">{ogCard.description}</p>
						{/if}
					</div>
				</div>
			</section>

			<section>
				<h2 class="mb-2 font-semibold">X</h2>
				{#if twitterCard.large}
					<div class="relative overflow-hidden rounded-2xl border">
						{#if twitterCard.image}
							<img src={twitterCard.image} alt={twitterCard.imageAlt} class="bg-muted aspect-[1.91/1] w-full object-cover" />
							<span class="absolute bottom-2 left-2 max-w-[90%] truncate rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">{twitterCard.title || twitterCard.domain}</span>
						{:else}
							<div class="bg-muted text-muted-foreground flex aspect-[1.91/1] items-center justify-center text-sm">No image</div>
						{/if}
					</div>
					<p class="text-muted-foreground mt-1 text-xs">From {twitterCard.domain}</p>
				{:else}
					<div class="flex overflow-hidden rounded-2xl border">
						<div class="bg-muted size-32 shrink-0">
							{#if twitterCard.image}
								<img src={twitterCard.image} alt={twitterCard.imageAlt} class="size-full object-cover" />
							{/if}
						</div>
						<div class="flex min-w-0 flex-col justify-center gap-0.5 border-l px-3 text-sm">
							<p class="text-muted-foreground truncate">{twitterCard.domain}</p>
							<p class="truncate">{twitterCard.title || twitterCard.domain}</p>
							<p class="text-muted-foreground line-clamp-2">{twitterCard.description}</p>
						</div>
					</div>
				{/if}
			</section>

			<section class="md:col-span-2">
				<h2 class="mb-2 font-semibold">Google search</h2>
				<div class="bg-card rounded-lg border p-4">
					<div class="mb-1 flex items-center gap-2">
						<img src={meta.favicon} alt="" class="bg-muted size-7 rounded-full border p-1" />
						<div class="min-w-0 text-sm leading-tight">
							<p class="truncate">{ogCard.siteName || ogCard.domain}</p>
							<p class="text-muted-foreground truncate text-xs">{meta.canonical || meta.url}</p>
						</div>
					</div>
					<p class="line-clamp-1 text-xl text-[#1a0dab] dark:text-[#99c3ff]">{meta.title || meta.url}</p>
					<p class="text-muted-foreground line-clamp-2 text-sm">{meta.description || "No meta description; Google will pick text from the page."}</p>
				</div>
			</section>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Tags found</Card.Title>
			</Card.Header>
			<Card.Content class="overflow-x-auto">
				<table class="w-full text-sm">
					<tbody>
						{#each tagRows as [key, value] (key)}
							<tr class="border-b last:border-0">
								<td class="text-muted-foreground py-1.5 pr-4 align-top font-mono whitespace-nowrap">{key}</td>
								<td class="py-1.5 break-all">{value}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</Card.Content>
		</Card.Root>
	{/if}

	<footer class="text-muted-foreground mt-6 text-center text-sm">
		<p>Previews are approximate; each platform crops and caches differently.</p>
	</footer>
</main>
