import type { Tool } from "$lib/types";
import { Columns3, Files, Globe, Grid2x2, Images, LayoutGrid, QrCode, Shrink } from "@lucide/svelte";

export const tools: Tool[] = [
	{
		name: "Collage Creator",
		description: "Build grid, masonry, or scattered photo collages",
		path: "/tools/collage-creator",
		icon: Grid2x2,
		status: "ready",
	},
	{
		name: "Instagram Carousel Creator",
		description: "Create stunning carousel posts for Instagram",
		path: "/tools/instagram-carousel",
		icon: Images,
		status: "ready",
	},
	{
		name: "Panorama Splitter",
		description: "Split wide panorama images into Instagram carousel slides",
		path: "/tools/panorama-splitter",
		icon: Columns3,
		status: "ready",
	},
	{
		name: "Batch Image Compressor",
		description: "Compress, resize, and convert many images at once",
		path: "/tools/image-compressor",
		icon: Shrink,
		status: "ready",
	},
	{
		name: "PDF Imposition Tool",
		description: "Arrange PDF pages for professional printing layouts",
		path: "/tools/pdf-imposition",
		icon: LayoutGrid,
		status: "ready",
	},
	{
		name: "PDF Organizer",
		description: "Merge, split, reorder, rotate, and extract PDF pages",
		path: "/tools/pdf-organizer",
		icon: Files,
		status: "ready",
	},
	{
		name: "Favicon Extractor",
		description: "Find and download favicon files from a website",
		path: "/tools/favicon-extractor",
		icon: Globe,
		status: "ready",
	},
	{
		name: "QR Code Generator",
		description: "Generate custom QR codes with colors, styles, and a logo",
		path: "/tools/qr-code-generator",
		icon: QrCode,
		status: "ready",
	},
];
