<script lang="ts">
	import { cn } from "$lib/utils";
	import { Check, Minus } from "@lucide/svelte";
	import { Checkbox as CheckboxPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		...restProps
	}: CheckboxPrimitive.RootProps = $props();
</script>

<CheckboxPrimitive.Root
	bind:ref
	bind:checked
	bind:indeterminate
	class={cn(
		"border-input focus-visible:border-ring focus-visible:ring-ring/40 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary peer size-4 shrink-0 rounded-[4px] border shadow-sm transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
		className,
	)}
	{...restProps}
>
	{#snippet children({ checked, indeterminate })}
		<div class="flex items-center justify-center text-current transition-none">
			{#if indeterminate}
				<Minus class="size-3.5" />
			{:else if checked}
				<Check class="size-3.5" />
			{/if}
		</div>
	{/snippet}
</CheckboxPrimitive.Root>
