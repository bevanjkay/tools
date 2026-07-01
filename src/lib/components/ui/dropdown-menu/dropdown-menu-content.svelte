<script lang="ts">
	import { cn } from "$lib/utils";
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		sideOffset = 4,
		class: className,
		...restProps
	}: DropdownMenuPrimitive.ContentProps = $props();
</script>

<DropdownMenuPrimitive.Portal>
	<DropdownMenuPrimitive.Content
		bind:ref
		{sideOffset}
		class={cn(
			"bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 max-h-[var(--bits-dropdown-menu-content-available-height)] min-w-[8rem] origin-[var(--bits-dropdown-menu-content-transform-origin)] overflow-y-auto overflow-x-hidden rounded-md border p-1 shadow-md",
			className,
		)}
		{...restProps}
	/>
</DropdownMenuPrimitive.Portal>
