import process from "node:process";
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			pages: "build",
			assets: "build",
			fallback: undefined,
			precompress: false,
			strict: true,
		}),
		paths: {
			base: process.env?.SVELTE_KIT_BASE_PATH || "",
		},
	},
};

export default config;
