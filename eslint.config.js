import antfu from "@antfu/eslint-config";

export default antfu({
	ignores: [
		"build/**",
		".svelte-kit/**",
		".pnpm-store/**",
		"dist/**",
		// Vendored TensorFlow.js model files.
		"static/models/**",
	],
	formatters: true,
	rules: {
		"antfu/reasonable-newline": "off",
	},
	svelte: true,
	stylistic: {
		quotes: "double",
		semi: true,
		indent: "tab",
	},
});
