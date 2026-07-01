<script lang="ts">
	import type { Pathname } from "$app/types";
	import type { Snippet } from "svelte";
	import { resolve as resolvePath } from "$app/paths";
	import { page } from "$app/state";
	import ModeToggle from "$lib/components/mode-toggle.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { tools } from "$lib/tools";
	import { cn } from "$lib/utils";
	import { Check, ChevronDown, Wrench } from "@lucide/svelte";
	import { ModeWatcher } from "mode-watcher";
	import packageJson from "../../package.json";
	import "$lib/styles/app.css";
	import "$lib/styles/global.css";

	const { children }: { children: Snippet } = $props();
	const appVersion = packageJson.version;
</script>

<ModeWatcher />

<div class="app-shell">
	<header class="site-header">
		<a href={resolvePath("/")} class="brand">
			<Wrench class="size-5" />
			Tools
		</a>
		<div class="flex items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" size="sm" {...props}>
							Tools
							<ChevronDown class="size-4" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-64">
					<DropdownMenu.Label>Jump to tool</DropdownMenu.Label>
					<DropdownMenu.Separator />
					{#each tools as tool (tool.path)}
						{@const Icon = tool.icon}
						{@const href = resolvePath(tool.path as Pathname)}
						{@const active = page.url.pathname === href}
						<DropdownMenu.Item class={cn(active && "bg-accent")}>
							{#snippet child({ props })}
								<a {href} {...props}>
									<Icon class="text-muted-foreground size-4" />
									<span class="flex-1">{tool.name}</span>
									{#if active}
										<Check class="size-4" />
									{/if}
								</a>
							{/snippet}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			<ModeToggle />
		</div>
	</header>
	<div class="app-main">
		{@render children()}
	</div>
	<footer class="site-footer">
		<span>v{appVersion}</span>
		<span class="footer-separator">•</span>
		<a href="https://bevankay.me" target="_blank" rel="noopener noreferrer">bevankay.me</a>
	</footer>
</div>

<style>
	.app-shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.site-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: 900px;
		width: 100%;
		margin: 0 auto;
		padding: 1rem 2rem 0;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		font-size: 1.05rem;
		text-decoration: none;
		color: inherit;
	}

	.app-main {
		flex: 1;
	}

	.site-footer {
		text-align: center;
		padding: 0.5rem 1rem 0.75rem;
		font-size: 0.75rem;
		color: #718096;
	}

	.footer-separator {
		padding: 0 0.4rem;
	}

	.site-footer a {
		color: inherit;
	}

	@media (max-width: 600px) {
		.site-header {
			padding: 1rem 1rem 0;
		}
	}
</style>
