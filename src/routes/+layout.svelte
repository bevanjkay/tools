<script lang="ts">
	import type { Snippet } from "svelte";
	import packageJson from "../../package.json";
	import "$lib/styles/global.css";

	const { children }: { children: Snippet } = $props();
	const appVersion = packageJson.version;
</script>

<div class="app-shell">
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
</style>
