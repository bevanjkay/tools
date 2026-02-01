import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		include: [
			"@tensorflow-models/face-detection",
			"@tensorflow/tfjs-core",
			"@tensorflow/tfjs-backend-webgl",
		],
	},
	ssr: {
		noExternal: [
			"@tensorflow-models/face-detection",
			"@tensorflow/tfjs-core",
			"@tensorflow/tfjs-backend-webgl",
		],
	},
	build: {
		cssMinify: "lightningcss",
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					// Split TensorFlow into its own chunk (only loaded on collage-creator page)
					if (id.includes("@tensorflow") || id.includes("tensorflow")) {
						return "vendor-tensorflow";
					}
					// Split pdf-lib into its own chunk (only loaded on pdf-imposition page)
					if (id.includes("pdf-lib")) {
						return "vendor-pdf";
					}
					// Split JSZip into its own chunk (used by multiple tools)
					if (id.includes("jszip")) {
						return "vendor-jszip";
					}
					// Split other large vendor dependencies
					if (id.includes("node_modules")) {
						return "vendor-common";
					}
				},
			},
		},
	},
});
