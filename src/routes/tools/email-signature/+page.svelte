<script lang="ts">
	import type { SignaturePerson } from "#lib/email-signature.js";
	import type { SignaturePreset, SocialLink } from "#lib/signature-presets.js";
	import { resolve as resolvePath } from "$app/paths";
	import { page } from "$app/state";
	import { Check, Copy, Download, Link, Mail, TriangleAlert } from "@lucide/svelte";
	import { onMount } from "svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { Select } from "#lib/components/ui/select/index.js";
	import { downloadBlob } from "#lib/download.js";
	import { buildPrefillQuery, emptyPerson, GMAIL_SIGNATURE_LIMIT, isHttpsUrl, parsePrefill, renderSignatureHtml, renderSignatureText } from "#lib/email-signature.js";
	import { CUSTOM_PRESET_ID, CUSTOM_SOCIAL_SLOTS, customPreset, findPreset, PRESETS } from "#lib/signature-presets.js";
	import { cn } from "#lib/utils.js";

	const STORAGE_KEY = "email-signature";
	const WARN_AT = GMAIL_SIGNATURE_LIMIT * 0.8;

	let presetId = $state(PRESETS[0].id);
	let custom = $state<SignaturePreset>(customPreset());
	let person = $state<SignaturePerson>(emptyPerson());
	let copied = $state<"gmail" | "html" | "text" | "link" | null>(null);
	let error = $state("");
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	// The preview holds absolute image URLs that the prerenderer would try to crawl.
	let mounted = $state(false);

	const preset = $derived(presetId === CUSTOM_PRESET_ID ? custom : findPreset(presetId) ?? PRESETS[0]);
	const html = $derived(renderSignatureHtml(preset, person));
	const text = $derived(renderSignatureText(preset, person));
	const count = $derived(html.length);
	const hasContent = $derived(person.name.trim().length > 0);
	const prefillLink = $derived(presetId === CUSTOM_PRESET_ID ? "" : `${page.url.origin}${page.url.pathname}?${buildPrefillQuery(presetId, person)}`);
	const logoProblem = $derived(presetId === CUSTOM_PRESET_ID && custom.logoUrl.trim() !== "" && !isHttpsUrl(custom.logoUrl));

	onMount(() => {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const parsed = JSON.parse(saved) as { presetId?: string; person?: Partial<SignaturePerson>; custom?: Partial<SignaturePreset> };
				if (parsed.presetId && (parsed.presetId === CUSTOM_PRESET_ID || findPreset(parsed.presetId)))
					presetId = parsed.presetId;
				person = { ...emptyPerson(), ...parsed.person };
				const restored = { ...customPreset(), ...parsed.custom, id: CUSTOM_PRESET_ID };
				// Sparse social slots serialise as null; refill every slot.
				restored.socials = Array.from({ length: CUSTOM_SOCIAL_SLOTS }, (_, index) => {
					const slot = restored.socials[index] as Partial<SocialLink> | null | undefined;
					return { label: slot?.label ?? "", url: slot?.url ?? "" };
				});
				custom = restored;
			}
		}
		catch {
		// Nothing remembered; start blank.
		}
		const prefill = parsePrefill(page.url.search);
		if (prefill.preset || Object.keys(prefill.person).length > 0) {
			// A shared link describes one person completely; do not mix in whoever was remembered.
			if (prefill.preset && findPreset(prefill.preset))
				presetId = prefill.preset;
			person = { ...emptyPerson(), ...prefill.person };
		}
		mounted = true;
	});

	$effect(() => {
		const snapshot = JSON.stringify({ presetId, person, custom });
		try {
			localStorage.setItem(STORAGE_KEY, snapshot);
		}
		catch {
		// Remembering fields is a convenience only.
		}
	});

	function clearFields() {
		person = emptyPerson();
	}

	function flash(kind: typeof copied) {
		copied = kind;
		if (copyTimer)
			clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = null), 2000);
	}

	async function copyForGmail() {
		error = "";
		try {
			const item = new ClipboardItem({
				"text/html": new Blob([html], { type: "text/html" }),
				"text/plain": new Blob([text], { type: "text/plain" }),
			});
			await navigator.clipboard.write([item]);
			flash("gmail");
		}
		catch {
			error = "Couldn't copy rich text in this browser. Use \"Copy HTML source\" and paste it into a client that accepts HTML.";
		}
	}

	async function copyText(value: string, kind: typeof copied) {
		error = "";
		try {
			await navigator.clipboard.writeText(value);
			flash(kind);
		}
		catch {
			error = "Couldn't access the clipboard. Select the text below and copy it instead.";
		}
	}

	function downloadHtml() {
		const document = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Email signature</title>\n</head>\n<body>\n${html}\n</body>\n</html>\n`;
		downloadBlob(new Blob([document], { type: "text/html" }), `${person.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "email"}-signature.html`);
	}
</script>

<svelte:head>
	<title>Email Signature Builder</title>
</svelte:head>

<main class="mx-auto max-w-5xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<Mail class="text-primary size-7" />
		Email Signature Builder
	</h1>
	<p class="text-muted-foreground mb-8">Build a branded HTML signature that survives Gmail, Outlook and Spark. Nothing leaves your browser.</p>

	{#if error}
		<div class="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border px-4 py-3 text-sm">⚠️ {error}</div>
	{/if}

	<div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
		<div class="space-y-6">
			<Card.Root>
				<Card.Header>
					<Card.Title>Organisation</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid gap-1.5">
						<Label for="preset">Preset</Label>
						<Select id="preset" bind:value={presetId}>
							{#each PRESETS as option (option.id)}
								<option value={option.id}>{option.name}</option>
							{/each}
							<option value={CUSTOM_PRESET_ID}>Custom</option>
						</Select>
					</div>
					{#if presetId === CUSTOM_PRESET_ID}
						<div class="grid gap-3 sm:grid-cols-2">
							<div class="grid gap-1.5 sm:col-span-2"><Label for="org-name">Organisation name</Label><Input id="org-name" bind:value={custom.name} /></div>
							<div class="grid gap-1.5 sm:col-span-2"><Label for="logo-url">Logo URL (https, PNG or JPEG)</Label><Input id="logo-url" type="url" placeholder="https://example.com/logo.png" bind:value={custom.logoUrl} /></div>
							<div class="grid gap-1.5"><Label for="logo-w">Logo width (px)</Label><Input id="logo-w" type="number" min={16} max={400} bind:value={custom.logoWidth} /></div>
							<div class="grid gap-1.5"><Label for="logo-h">Logo height (px)</Label><Input id="logo-h" type="number" min={16} max={400} bind:value={custom.logoHeight} /></div>
							<div class="grid gap-1.5"><Label for="accent">Accent colour</Label><input id="accent" type="color" bind:value={custom.accentColor} class="border-input h-9 w-full cursor-pointer rounded-md border bg-transparent p-1" /></div>
							<div class="grid gap-1.5"><Label for="text-color">Text colour</Label><input id="text-color" type="color" bind:value={custom.textColor} class="border-input h-9 w-full cursor-pointer rounded-md border bg-transparent p-1" /></div>
							<div class="grid gap-1.5 sm:col-span-2"><Label for="font">Font stack</Label><Input id="font" bind:value={custom.fontStack} placeholder="Outfit, Arial, Helvetica, sans-serif" /></div>
							<div class="grid gap-1.5"><Label for="website">Website</Label><Input id="website" type="url" placeholder="https://example.com" bind:value={custom.website} /></div>
							<div class="grid gap-1.5"><Label for="website-label">Website label</Label><Input id="website-label" placeholder="example.com" bind:value={custom.websiteLabel} /></div>
							<div class="grid gap-1.5 sm:col-span-2"><Label for="address">Address line</Label><Input id="address" bind:value={custom.addressLine} /></div>
							{#each custom.socials as social, index (index)}
								<div class="grid gap-1.5"><Label for="social-label-{index}">Social {index + 1} label</Label><Input id="social-label-{index}" placeholder="Instagram" bind:value={social.label} /></div>
								<div class="grid gap-1.5"><Label for="social-url-{index}">Social {index + 1} URL</Label><Input id="social-url-{index}" type="url" placeholder="https://instagram.com/…" bind:value={social.url} /></div>
							{/each}
						</div>
						{#if logoProblem}
							<p class="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
								<TriangleAlert class="mt-0.5 size-4 shrink-0" />
								<span>The logo URL must be an absolute https address, so it has been left out of the signature.</span>
							</p>
						{/if}
						<p class="text-muted-foreground text-xs">Logos must be hosted at a public https address; Gmail removes embedded images and SVG. Keep text colours dark enough to read on white.</p>
					{:else}
						<p class="text-muted-foreground text-sm">Logo, colours, font, website and address come from the preset. <span class="text-amber-700 dark:text-amber-400">Presets currently hold placeholder brand values.</span></p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="flex-row items-center justify-between space-y-0">
					<Card.Title>Person</Card.Title>
					<Button variant="ghost" size="sm" onclick={clearFields}>Clear</Button>
				</Card.Header>
				<Card.Content class="grid gap-3 sm:grid-cols-2">
					<div class="grid gap-1.5"><Label for="name">Full name</Label><Input id="name" autocomplete="name" bind:value={person.name} /></div>
					<div class="grid gap-1.5"><Label for="pronouns">Pronouns (optional)</Label><Input id="pronouns" placeholder="she/her" bind:value={person.pronouns} /></div>
					<div class="grid gap-1.5 sm:col-span-2"><Label for="role">Role</Label><Input id="role" placeholder="Youth Pastor" bind:value={person.role} /></div>
					<div class="grid gap-1.5"><Label for="phone">Phone</Label><Input id="phone" type="tel" autocomplete="tel" placeholder="0412 345 678" bind:value={person.phone} /></div>
					<div class="grid gap-1.5"><Label for="email">Email</Label><Input id="email" type="email" autocomplete="email" bind:value={person.email} /></div>
					<div class="grid gap-1.5 sm:col-span-2"><Label for="extra">Extra line (optional)</Label><Input id="extra" placeholder="Part-time: Tue–Thu" bind:value={person.extraLine} /></div>
					<p class="text-muted-foreground text-xs sm:col-span-2">Fields are remembered on this device until you clear them.</p>
				</Card.Content>
			</Card.Root>

			{#if prefillLink}
				<Card.Root>
					<Card.Header>
						<Card.Title>Share a ready-made link</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-2">
						<p class="text-muted-foreground text-sm">Send a new starter this link and the form opens filled in with their details.</p>
						<div class="flex gap-2">
							<Input readonly value={prefillLink} class="font-mono text-xs" onfocus={event => (event.currentTarget as HTMLInputElement).select()} />
							<Button variant="outline" class="shrink-0" onclick={() => copyText(prefillLink, "link")}>
								{#if copied === "link"}<Check class="size-4" />{:else}<Link class="size-4" />{/if}
								Copy
							</Button>
						</div>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>

		<div class="space-y-6">
			<Card.Root>
				<Card.Header>
					<Card.Title>Preview</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="overflow-hidden rounded-lg border bg-white text-black">
						<div class="border-b border-neutral-200 px-4 py-2 text-xs text-neutral-500">Light mode</div>
						<div class="overflow-x-auto px-4 py-3 text-sm text-neutral-700">
							<p class="mb-3">Thanks so much,</p>
							{#if mounted}
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated from escaped input -->
								{@html html}
							{/if}
						</div>
					</div>
					<div class="overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 text-white">
						<div class="border-b border-neutral-700 px-4 py-2 text-xs text-neutral-400">Dark mode (colours inverted, as the Gmail and Outlook apps do)</div>
						<div class="dark-sim overflow-x-auto bg-white px-4 py-3 text-sm text-neutral-700">
							<p class="mb-3">Thanks so much,</p>
							{#if mounted}
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated from escaped input -->
								{@html html}
							{/if}
						</div>
					</div>
					<p class="text-muted-foreground text-xs">Check that the name, links and divider stay readable in both panes; the logo should still look right once inverted back.</p>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
					<Card.Title>Use it</Card.Title>
					<span class={cn("text-xs tabular-nums", count >= GMAIL_SIGNATURE_LIMIT ? "text-destructive font-semibold" : count >= WARN_AT ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
						{count.toLocaleString()} / {GMAIL_SIGNATURE_LIMIT.toLocaleString()} characters
					</span>
				</Card.Header>
				<Card.Content class="space-y-4">
					{#if count >= WARN_AT}
						<p class="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
							<TriangleAlert class="mt-0.5 size-4 shrink-0" />
							<span>{count >= GMAIL_SIGNATURE_LIMIT ? "Over Gmail's limit: Gmail will cut the signature off." : "Close to Gmail's 10,000-character limit."} Shorten the address or drop a social link.</span>
						</p>
					{/if}
					<div class="flex flex-wrap gap-2">
						<Button onclick={copyForGmail} disabled={!hasContent}>
							{#if copied === "gmail"}<Check class="size-4" />{:else}<Copy class="size-4" />{/if}
							Copy for Gmail
						</Button>
						<Button variant="outline" onclick={() => copyText(html, "html")} disabled={!hasContent}>
							{#if copied === "html"}<Check class="size-4" />{:else}<Copy class="size-4" />{/if}
							Copy HTML source
						</Button>
						<Button variant="outline" onclick={downloadHtml} disabled={!hasContent}>
							<Download class="size-4" />
							Download .html
						</Button>
					</div>

					<ol class="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
						<li>Click <strong>Copy for Gmail</strong>.</li>
						<li>In Gmail, open <strong>Settings › See all settings › General</strong> and scroll to <strong>Signature</strong>.</li>
						<li>Click <strong>Create new</strong>, name it, then paste into the editor with <kbd>⌘V</kbd> or <kbd>Ctrl+V</kbd>.</li>
						<li>Pick it under <strong>Signature defaults</strong> for new emails and replies, then <strong>Save changes</strong>.</li>
					</ol>

					<div class="space-y-2">
						<div class="flex items-center justify-between gap-2">
							<Label for="plain">Plain-text version</Label>
							<Button variant="ghost" size="sm" onclick={() => copyText(text, "text")} disabled={!hasContent}>
								{#if copied === "text"}<Check class="size-4" />{:else}<Copy class="size-4" />{/if}
								Copy
							</Button>
						</div>
						<textarea id="plain" readonly rows={Math.max(3, text.split("\n").length)} value={text} class="border-input bg-muted/40 w-full rounded-md border px-3 py-2 font-mono text-xs"></textarea>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</div>

	<footer class="text-muted-foreground mt-6 text-center text-sm">
		<p>Tables and inline styles only, so the layout survives Spark, Outlook and Gmail • Images must be hosted at https addresses</p>
	</footer>
</main>

<style>
	/* Approximates the full-colour inversion that mobile mail apps apply in dark mode. */
	.dark-sim {
		filter: invert(1) hue-rotate(180deg);
	}

	.dark-sim :global(img) {
		filter: invert(1) hue-rotate(180deg);
	}
</style>
