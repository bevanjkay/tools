import type { Component } from "svelte";

export interface Tool {
	name: string;
	description: string;
	path: string;
	icon: Component<{ class?: string }>;
	status: "ready" | "coming-soon";
}
