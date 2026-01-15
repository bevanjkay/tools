<script lang="ts">
	import type { Snippet } from "svelte";
	import "$lib/styles/global.css";

	const { children }: { children: Snippet } = $props();
</script>

{@render children()}
