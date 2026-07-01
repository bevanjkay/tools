<script lang="ts">
	import type { WithElementRef } from "$lib/utils";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn } from "$lib/utils";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	class={cn("text-muted-foreground px-2 py-1.5 text-xs font-medium", className)}
	{...restProps}
>
	{@render children?.()}
</div>
