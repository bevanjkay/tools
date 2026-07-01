import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Absolute filesystem path so the alias resolves correctly during dev
// dependency optimization (a root-relative "/src/..." target is otherwise
// treated as relative to the importing module inside node_modules).
const mediapipeShim = new URL("./src/lib/shims/mediapipe-face-detection.js", import.meta.url).pathname;

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	resolve: {
		alias: {
			// The collage-creator only uses the tfjs face-detection runtime, so the
			// MediaPipe solution is dead code. Its UMD bundle exposes no static
			// `FaceDetection` export, which breaks rolldown (Vite 8); shim it out.
			"@mediapipe/face_detection": mediapipeShim,
		},
	},
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
