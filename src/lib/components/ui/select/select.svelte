<script lang="ts">
	import type { WithElementRef } from "$lib/utils";
	import type { HTMLSelectAttributes } from "svelte/elements";
	import { cn } from "$lib/utils";
	import { ChevronDown } from "@lucide/svelte";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLSelectAttributes, HTMLSelectElement> = $props();
</script>

<div class="relative w-full">
	<select
		bind:this={ref}
		bind:value
		class={cn(
			"border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/40 w-full appearance-none rounded-md border py-2 pr-8 pl-3 text-sm leading-tight shadow-sm transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
			className,
		)}
		{...restProps}
	>
		{@render children?.()}
	</select>
	<ChevronDown class="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
</div>
