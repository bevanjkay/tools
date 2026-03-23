import antfu from "@antfu/eslint-config";

export default antfu({
	ignores: [
		"build/**",
		".svelte-kit/**",
		".pnpm-store/**",
		"dist/**",
	],
	formatters: true,
	svelte: true,
	stylistic: {
		quotes: "double",
		semi: true,
		indent: "tab",
	},
});
