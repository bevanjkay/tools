<script lang="ts">
	import type { Tool } from "$lib/types";
	import { resolve as resolvePath } from "$app/paths";

	const tools: Tool[] = [
		{
			name: "Collage Creator",
			description: "Build grid, masonry, or scattered photo collages",
			path: "/tools/collage-creator",
			icon: "🧩",
			status: "ready",
		},
		{
			name: "Instagram Carousel Creator",
			description: "Create stunning carousel posts for Instagram",
			path: "/tools/instagram-carousel",
			icon: "📸",
			status: "ready",
		},
		{
			name: "Panorama Splitter",
			description: "Split wide panorama images into Instagram carousel slides",
			path: "/tools/panorama-splitter",
			icon: "🌄",
			status: "ready",
		},
		{
			name: "Batch Image Compressor",
			description: "Compress, resize, and convert many images at once",
			path: "/tools/image-compressor",
			icon: "🗜️",
			status: "ready",
		},
		{
			name: "PDF Imposition Tool",
			description: "Arrange PDF pages for professional printing layouts",
			path: "/tools/pdf-imposition",
			icon: "📄",
			status: "ready",
		},
		{
			name: "Favicon Extractor",
			description: "Find and download favicon files from a website",
			path: "/tools/favicon-extractor",
			icon: "🌐",
			status: "ready",
		},
	];
</script>

<svelte:head>
	<title>Tools Directory</title>
</svelte:head>

<main class="page-container">
	<h1>Tools Directory</h1>
	<p class="subtitle">A collection of useful utilities</p>

	<div class="tools-grid">
		{#each tools as tool (tool.path)}
			<a href={resolvePath(tool.path as Parameters<typeof resolvePath>[0])} class="tool-card card" class:coming-soon={tool.status === "coming-soon"}>
				<span class="icon">{tool.icon}</span>
				<h2>{tool.name}</h2>
				<p class="text-muted">{tool.description}</p>
				{#if tool.status === "coming-soon"}
					<span class="badge">Coming Soon</span>
				{/if}
			</a>
		{/each}
	</div>
</main>

<style>
	.tools-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.5rem;
	}

	.tool-card {
		display: block;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s ease;
		position: relative;
	}

	.tool-card:hover {
		border-color: #007acc;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	.tool-card.coming-soon {
		opacity: 0.7;
		pointer-events: none;
	}

	.icon {
		font-size: 2rem;
		display: block;
		margin-bottom: 0.5rem;
	}

	.tool-card h2 {
		font-size: 1.25rem;
		margin-bottom: 0.5rem;
	}

	.tool-card p {
		font-size: 0.9rem;
		margin: 0;
	}

	.badge {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: #f0f0f0;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		color: #666;
	}
</style>
