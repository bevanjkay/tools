<script lang="ts">
	import { resolve as resolvePath } from "$app/paths";
	import { page } from "$app/state";
	import { Button } from "#lib/components/ui/button/index.js";

	const title = $derived(page.status === 404 ? "Page not found" : "Something went wrong");
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-16 text-center">
	<p class="text-muted-foreground mb-2 text-sm">{page.status}</p>
	<h1 class="mb-3 text-3xl font-bold tracking-tight">{title}</h1>
	<p class="text-muted-foreground mb-8">
		{page.status === 404 ? "There is no tool at this address." : page.error?.message}
	</p>
	<Button href={resolvePath("/")}>Back to Tools</Button>
</main>
