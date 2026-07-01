<script lang="ts">
	import type { Pathname } from "$app/types";
	import { resolve as resolvePath } from "$app/paths";
	import * as Card from "$lib/components/ui/card";
	import { tools } from "$lib/tools";
</script>

<svelte:head>
	<title>Tools Directory</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<h1 class="mb-1 text-3xl font-bold tracking-tight">Tools Directory</h1>
	<p class="text-muted-foreground mb-8">A collection of useful utilities</p>

	<div class="grid gap-4 sm:grid-cols-2">
		{#each tools as tool (tool.path)}
			{@const Icon = tool.icon}
			<a
				href={resolvePath(tool.path as Pathname)}
				class="group focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2 {tool.status === "coming-soon" ? "pointer-events-none opacity-60" : ""}"
			>
				<Card.Root class="relative h-full gap-3 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
					<Card.Header>
						<div class="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-lg">
							<Icon class="size-6" />
						</div>
					</Card.Header>
					<Card.Content class="space-y-1">
						<Card.Title class="text-lg">{tool.name}</Card.Title>
						<Card.Description>{tool.description}</Card.Description>
					</Card.Content>
					{#if tool.status === "coming-soon"}
						<span class="bg-muted text-muted-foreground absolute top-4 right-4 rounded px-2 py-0.5 text-xs">Coming Soon</span>
					{/if}
				</Card.Root>
			</a>
		{/each}
	</div>
</main>
