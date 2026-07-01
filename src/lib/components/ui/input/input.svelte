<script lang="ts">
	import type { WithElementRef } from "$lib/utils";
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";
	import { cn } from "$lib/utils";

	type Props = WithElementRef<Omit<HTMLInputAttributes, "type">, HTMLInputElement> & {
		type?: HTMLInputTypeAttribute;
	};

	let {
		ref = $bindable(null),
		value = $bindable(),
		type = "text",
		class: className,
		...restProps
	}: Props = $props();

	const baseClass = "border-input bg-transparent placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-sm transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";
</script>

{#if type === "number"}
	<input
		bind:this={ref}
		type="number"
		bind:value
		class={cn(baseClass, className)}
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		{type}
		bind:value
		class={cn(baseClass, className)}
		{...restProps}
	/>
{/if}
