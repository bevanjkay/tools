import antfu from "@antfu/eslint-config";

export default antfu({
	formatters: true,
	svelte: true,
	stylistic: {
		quotes: "double",
		semi: true,
		indent: "tab",
	},
});
