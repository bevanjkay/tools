import process from "node:process";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Absolute filesystem path so the alias resolves correctly during dev
// dependency optimization (a root-relative "/src/..." target is otherwise
// treated as relative to the importing module inside node_modules).
const mediapipeShim = new URL("./src/lib/shims/mediapipe-face-detection.js", import.meta.url).pathname;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter({
				pages: "build",
				assets: "build",
				// GitHub Pages serves this for unknown paths, so the app can render +error.svelte.
				fallback: "404.html",
				precompress: true,
				strict: true,
			}),
			paths: {
				base: (process.env?.SVELTE_KIT_BASE_PATH || "") as "" | `/${string}`,
				// Makes canonical and og:url tags absolute in the prerendered pages;
				// Cloudflare Pages builds fall back to their own deployment URL.
				origin: process.env?.SVELTE_KIT_ORIGIN || process.env?.CF_PAGES_URL || "https://tools.bevankay.me",
			},
		}),
	],
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
	},
});
